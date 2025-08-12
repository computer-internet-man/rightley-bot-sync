import OpenAI from 'openai';
import { setupDb, drizzleDb, users, patientBriefs, doctorSettings, auditLogs } from '@/db';
import type { User } from '@/db';
import { eq, count, desc, gte, and } from 'drizzle-orm';
import * as Sentry from '@sentry/cloudflare';

export interface DraftRequest {
  patientInquiry: string;
  patientId: string;
  userId: string;
}

export interface DraftResponse {
  success: boolean;
  draft?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  wordCount?: number;
  model?: string;
  isStubbed?: boolean;
  cost?: number;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
  };
}

/**
 * Server action to generate AI drafts using OpenAI API
 * Production-ready with limits, logging, error handling, and cost controls
 */
export async function generateDraftAction(
  request: DraftRequest,
  env: any
): Promise<DraftResponse> {
  const startTime = Date.now();
  
  try {
    // Set Sentry context for performance tracking
    if (env.SENTRY_DSN) {
      Sentry.setTag('operation', 'draft_generation');
      Sentry.setTag('patientId', request.patientId);
      Sentry.setTag('userId', request.userId);
    }

    // Initialize database
    await setupDb(env);

    // Input validation
    if (!request.patientInquiry?.trim()) {
      return { success: false, error: 'Patient inquiry is required' };
    }
    
    if (request.patientInquiry.length > 10000) {
      return { success: false, error: 'Patient inquiry too long (max 10,000 characters)' };
    }

    // Verify user exists and has appropriate permissions
    const [user] = await drizzleDb
      .select()
      .from(users)
      .where(eq(users.id, request.userId))
      .limit(1);

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if user has permission to generate drafts
    if (!['staff', 'reviewer', 'doctor', 'admin'].includes(user.role)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Check daily usage limits for this user
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);
    
    const [usageCheck] = await drizzleDb
      .select({ count: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.userId, request.userId),
          eq(auditLogs.actionType, 'draft_generated'),
          gte(auditLogs.createdAt, new Date(todayTimestamp * 1000))
        )
      );

    const dailyUsage = usageCheck?.count || 0;
    const dailyLimit = user.role === 'admin' ? 1000 : user.role === 'doctor' ? 100 : 50;
    
    if (dailyUsage >= dailyLimit) {
      return { 
        success: false, 
        error: `Daily draft generation limit reached (${dailyLimit}). Please try again tomorrow.` 
      };
    }

    // Get patient brief with doctor and settings
    const [patientBrief] = await drizzleDb
      .select({
        id: patientBriefs.id,
        patientName: patientBriefs.patientName,
        briefText: patientBriefs.briefText,
        medicalHistory: patientBriefs.medicalHistory,
        currentMedications: patientBriefs.currentMedications,
        allergies: patientBriefs.allergies,
        doctorNotes: patientBriefs.doctorNotes,
        patientInquiry: patientBriefs.patientInquiry,
        createdAt: patientBriefs.createdAt,
        updatedAt: patientBriefs.updatedAt,
        doctorId: patientBriefs.doctorId,
        doctor: {
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
          createdAt: users.createdAt,
        },
        doctorSettings: {
          id: doctorSettings.id,
          communicationTone: doctorSettings.communicationTone,
          signOff: doctorSettings.signOff,
          maxWords: doctorSettings.maxWords,
          readingLevel: doctorSettings.readingLevel,
          specialtyFocus: doctorSettings.specialtyFocus,
        }
      })
      .from(patientBriefs)
      .leftJoin(users, eq(patientBriefs.doctorId, users.id))
      .leftJoin(doctorSettings, eq(users.id, doctorSettings.doctorId))
      .where(eq(patientBriefs.id, request.patientId))
      .limit(1);

    if (!patientBrief) {
      return { success: false, error: 'Patient brief not found' };
    }

    // Enforce doctor-specific word limits
    const maxWords = patientBrief.doctor?.doctorSettings?.maxWords || 300;
    const maxTokens = Math.min(maxWords * 1.5, 500); // Conservative token estimation

    // Check if AI_STUB mode is enabled or no API key available
    const isStubMode = env.AI_STUB === "1" || !env.OPENAI_API_KEY || env.OPENAI_API_KEY === "your-openai-api-key-here";
    
    let generatedDraft: string | null = null;
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let cost = 0;
    let modelUsed = 'mock';

    if (isStubMode) {
      // Use realistic stub response based on inquiry type
      generatedDraft = generateStubResponse(patientBrief, request.patientInquiry, maxWords);
      usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      modelUsed = 'gpt-4o-mini-stub';
      console.log("[AI_STUB] Generated stubbed response for testing");
    } else {
      // Use real OpenAI API with comprehensive error handling and retry logic
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        timeout: 30000, // 30 second timeout
        maxRetries: 2,
      });

      // Generate the prompt with safety checks
      const prompt = buildPrompt(patientBrief, request.patientInquiry, patientBrief.doctor?.doctorSettings);
      
      // Validate prompt length
      if (prompt.length > 50000) {
        return { success: false, error: 'Patient context too large for AI processing' };
      }

      let completion: OpenAI.Chat.Completions.ChatCompletion;
      
      try {
        // Call OpenAI API with HIPAA-compliant settings and retry logic
        completion = await openai.chat.completions.create({
          model: getModelForRole(user.role), // Dynamic model selection based on role
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(patientBrief.doctor?.doctorSettings, maxWords)
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: Math.floor(maxTokens),
          temperature: 0.3, // Lower temperature for consistent medical communication
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          // HIPAA compliance settings
          store: false, // Don't store conversations for training
          metadata: {
            patientId: request.patientId,
            userId: request.userId,
            timestamp: new Date().toISOString()
          }
        });

        modelUsed = completion.model || getModelForRole(user.role);
        
      } catch (apiError) {
        // Enhanced error handling for OpenAI API
        console.error('OpenAI API Error:', apiError);
        
        if (env.SENTRY_DSN) {
          Sentry.captureException(apiError, {
            tags: {
              error_type: 'openai_api_error',
              patientId: request.patientId,
              userId: request.userId
            },
            extra: {
              model: getModelForRole(user.role),
              promptLength: prompt.length
            }
          });
        }

        if (apiError instanceof OpenAI.APIError) {
          if (apiError.status === 429) {
            return { 
              success: false, 
              error: 'API rate limit exceeded. Please try again in a moment.',
              rateLimitInfo: {
                remaining: 0,
                resetTime: Date.now() + 60000 // Retry in 1 minute
              }
            };
          }
          if (apiError.status === 400) {
            return { success: false, error: 'Invalid request. Please check patient inquiry content.' };
          }
          if (apiError.status === 401) {
            return { success: false, error: 'API authentication failed. Please contact support.' };
          }
          if (apiError.status === 403) {
            return { success: false, error: 'API access forbidden. Content may violate policies.' };
          }
          if (apiError.status >= 500) {
            return { success: false, error: 'OpenAI service temporarily unavailable. Please try again.' };
          }
        }

        return { 
          success: false, 
          error: 'AI service error. Please try again or contact support if the issue persists.' 
        };
      }

      const content = completion.choices[0]?.message?.content;
      generatedDraft = content || null;

      if (!generatedDraft) {
        return { success: false, error: 'Failed to generate draft content' };
      }

      // Extract usage and calculate cost
      usage = {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0
      };

      cost = calculateCost(modelUsed, usage);

      // Post-generation validation
      const wordCount = countWords(generatedDraft);
      if (wordCount > maxWords * 1.2) { // Allow 20% buffer
        // Truncate response if it exceeds limits
        const words = generatedDraft.split(/\s+/);
        generatedDraft = words.slice(0, maxWords).join(' ') + '...';
      }

      // Content safety check
      if (containsUnsafeContent(generatedDraft)) {
        return { success: false, error: 'Generated content failed safety validation. Please try rephrasing your inquiry.' };
      }
    }

    // Validate final output
    if (!generatedDraft) {
      return { success: false, error: 'Failed to generate draft' };
    }

    const wordCount = countWords(generatedDraft);
    const processingTime = Date.now() - startTime;

    // Log the action for audit purposes with comprehensive details
    await drizzleDb
      .insert(auditLogs)
      .values({
        userId: request.userId,
        patientName: patientBrief.patientName,
        patientId: request.patientId,
        requestText: request.patientInquiry,
        generatedDraft: generatedDraft,
        finalMessage: '', // Will be updated when message is finalized
        actionType: 'draft_generated',
        deliveryStatus: 'draft',
        aiModelUsed: modelUsed,
        tokensConsumed: usage.totalTokens
      });

    // Log usage to Sentry for monitoring
    if (env.SENTRY_DSN) {
      Sentry.addBreadcrumb({
        category: 'ai_usage',
        message: 'Draft generated successfully',
        level: 'info',
        data: {
          model: modelUsed,
          tokens: usage.totalTokens,
          cost: cost,
          wordCount: wordCount,
          processingTimeMs: processingTime,
          isStubbed: isStubMode,
          dailyUsage: dailyUsage + 1
        }
      });

      // Track cost and usage metrics (as context data)
      Sentry.setContext('ai_metrics', {
        ai_tokens_used: usage.totalTokens,
        ai_cost_usd: cost,
        processing_time_ms: processingTime
      });
    }

    return {
      success: true,
      draft: generatedDraft,
      usage: usage,
      wordCount: wordCount,
      model: modelUsed,
      isStubbed: isStubMode,
      cost: cost
    };

  } catch (error) {
    console.error('Draft generation error:', error);
    
    if (env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: {
          error_type: 'draft_generation_error',
          patientId: request.patientId,
          userId: request.userId
        },
        extra: {
          processingTime: Date.now() - startTime,
          inquiryLength: request.patientInquiry?.length || 0
        }
      });
    }

    return { 
      success: false, 
      error: 'An unexpected error occurred while generating the draft. Please try again.' 
    };
  } finally {
    // Clean up any resources if needed
  }
}

/**
 * Generate realistic stub responses for testing
 */
function generateStubResponse(patientBrief: any, inquiry: string, maxWords: number): string {
  const responses = {
    medication: `Hello ${patientBrief.patientName},

Thank you for your inquiry about your medication. I understand your concern about ${inquiry.toLowerCase()}.

Based on your current medications (${patientBrief.currentMedications || 'as prescribed'}), I want to address your question carefully. ${patientBrief.allergies && patientBrief.allergies !== 'NKDA' ? `Given your allergies to ${patientBrief.allergies}, we need to be particularly careful with any changes.` : ''}

For medication-related questions, I recommend scheduling an appointment so we can review your current regimen and discuss any adjustments that might be needed. This ensures your safety and optimal treatment outcomes.

Please call our office to schedule a consultation at your earliest convenience.

${patientBrief.doctor?.doctorSettings?.signOff || 'Best regards,\nYour Healthcare Team'}`,

    appointment: `Hello ${patientBrief.patientName},

Thank you for reaching out regarding ${inquiry.toLowerCase()}.

I understand you'd like to schedule an appointment or discuss appointment-related matters. Our office staff will be happy to help you find a suitable time that works with your schedule.

${patientBrief.doctorNotes ? `Based on your recent visit notes: ${patientBrief.doctorNotes}` : ''}

Please call our office during business hours or use our patient portal to schedule your appointment. We look forward to seeing you soon.

${patientBrief.doctor?.doctorSettings?.signOff || 'Best regards,\nYour Healthcare Team'}`,

    general: `Hello ${patientBrief.patientName},

Thank you for your inquiry. I appreciate you taking the time to reach out with your question about ${inquiry.toLowerCase()}.

Based on your medical history (${patientBrief.briefText}) and current situation, I want to provide you with the most appropriate guidance. ${patientBrief.currentMedications ? `I note you're currently taking ${patientBrief.currentMedications}.` : ''}

${patientBrief.allergies && patientBrief.allergies !== 'NKDA' ? `As always, we'll keep in mind your allergies to ${patientBrief.allergies}.` : ''}

For the best care and to address your concerns properly, I recommend scheduling an appointment where we can discuss this in detail and ensure you receive personalized medical guidance.

${patientBrief.doctor?.doctorSettings?.signOff || 'Best regards,\nYour Healthcare Team'}`
  };

  let response;
  if (inquiry.toLowerCase().includes('medication') || inquiry.toLowerCase().includes('prescription') || inquiry.toLowerCase().includes('drug')) {
    response = responses.medication;
  } else if (inquiry.toLowerCase().includes('appointment') || inquiry.toLowerCase().includes('schedule') || inquiry.toLowerCase().includes('visit')) {
    response = responses.appointment;
  } else {
    response = responses.general;
  }

  // Truncate if needed to respect word limits
  const words = response.split(/\s+/);
  if (words.length > maxWords) {
    response = words.slice(0, maxWords - 3).join(' ') + '...';
  }

  return response;
}

/**
 * Select model based on user role
 */
function getModelForRole(role: string): string {
  switch (role) {
    case 'admin':
      return 'gpt-4o-mini'; // Fast and cost-effective for admin users
    case 'doctor':
      return 'gpt-4o-mini'; // Balanced performance for doctors
    case 'reviewer':
      return 'gpt-4o-mini'; // Good quality for reviewers
    case 'staff':
    default:
      return 'gpt-4o-mini'; // Most cost-effective for staff
  }
}

/**
 * Calculate cost based on model and usage
 */
function calculateCost(model: string, usage: { promptTokens: number; completionTokens: number }): number {
  // Pricing as of 2024 (per 1M tokens)
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 }, // $0.15 input, $0.60 output per 1M tokens
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
  };

  const modelPricing = pricing[model] || pricing['gpt-4o-mini'];
  const inputCost = (usage.promptTokens / 1000000) * modelPricing.input;
  const outputCost = (usage.completionTokens / 1000000) * modelPricing.output;
  
  return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
}

/**
 * Count words in text
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Check for unsafe content patterns
 */
function containsUnsafeContent(text: string): boolean {
  const unsafePatterns = [
    /specific medical diagnosis/i,
    /discontinue.*medication/i,
    /start.*new.*medication/i,
    /change.*dosage/i,
    /emergency.*call.*911/i
  ];

  return unsafePatterns.some(pattern => pattern.test(text));
}

/**
 * Build the system prompt based on doctor settings
 */
function buildSystemPrompt(doctorSettings: any, maxWords: number): string {
  const tone = doctorSettings?.communicationTone || 'professional';
  const readingLevel = doctorSettings?.readingLevel || 'standard';
  const specialtyFocus = doctorSettings?.specialtyFocus || 'general medicine';
  const signOff = doctorSettings?.signOff || 'Your Healthcare Team';

  return `You are a medical communication assistant helping healthcare staff draft patient responses. 

IMPORTANT GUIDELINES:
- Communication tone: ${tone}
- Reading level: ${readingLevel}
- Specialty focus: ${specialtyFocus}
- Sign off with: "${signOff}"
- Maximum words: ${maxWords}

MEDICAL COMMUNICATION STANDARDS:
- Always maintain professional, compassionate tone
- Use clear, jargon-free language appropriate for patients
- Include appropriate disclaimers for medical advice
- Encourage patients to contact the office for urgent concerns
- Reference the patient's specific condition and medical history when relevant
- Never provide specific medical diagnoses or treatment changes
- Always recommend professional consultation for medical decisions

HIPAA COMPLIANCE:
- Maintain patient confidentiality
- Only reference information provided in the context
- Use secure, professional language

SAFETY REQUIREMENTS:
- Never recommend stopping medications without consultation
- Never suggest starting new medications
- Never provide emergency medical advice
- Always encourage in-person consultation for complex issues

Format the response as a complete message ready to send to the patient.`;
}

/**
 * Build the user prompt with patient context and inquiry
 */
function buildPrompt(patientBrief: any, inquiry: string, doctorSettings: any): string {
  return `Please draft a response to the following patient inquiry:

PATIENT CONTEXT:
- Name: ${patientBrief.patientName}
- Medical Condition: ${patientBrief.briefText}
- Medical History: ${patientBrief.medicalHistory}
- Current Medications: ${patientBrief.currentMedications}
- Allergies: ${patientBrief.allergies}
- Doctor Notes: ${patientBrief.doctorNotes || 'None'}

PATIENT INQUIRY:
${inquiry}

RESPONSE REQUIREMENTS:
- Address the patient by name
- Reference their specific condition where appropriate
- Maintain the specified communication tone: ${doctorSettings?.communicationTone || 'professional'}
- Keep response under ${doctorSettings?.maxWords || 300} words
- Use ${doctorSettings?.readingLevel || 'standard'} reading level
- Include appropriate medical disclaimers
- Sign off with: "${doctorSettings?.signOff || 'Your Healthcare Team'}"
- Never provide specific medical diagnoses or treatment changes
- Always encourage professional consultation for medical decisions

Draft a complete, professional response:`;
}
