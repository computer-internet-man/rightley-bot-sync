import OpenAI from 'openai';
import { setupDb, db } from '@/db';
import type { User } from '@/db';

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
}

/**
 * Server action to generate AI drafts using OpenAI API
 * Follows RedwoodSDK patterns for secure server-side operations
 */
export async function generateDraftAction(
  request: DraftRequest,
  env: any
): Promise<DraftResponse> {
  try {
    // Initialize database
    await setupDb(env);

    // Verify user exists and has appropriate permissions
    const user = await db.user.findUnique({
      where: { id: request.userId },
      include: { doctorSettings: true }
    });

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Check if user has permission to generate drafts
    if (!['staff', 'reviewer', 'doctor', 'admin'].includes(user.role)) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Get patient brief
    const patientBrief = await db.patientBrief.findUnique({
      where: { id: request.patientId },
      include: { doctor: { include: { doctorSettings: true } } }
    });

    if (!patientBrief) {
      return { success: false, error: 'Patient brief not found' };
    }

    let generatedDraft: string | null = null;

    // Check if we have a real OpenAI API key
    if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === "your-openai-api-key-here") {
      // Use mock response for development/testing
      generatedDraft = `Hello ${patientBrief.patientName},

Thank you for your inquiry about ${request.patientInquiry.toLowerCase()}. Based on your medical history and current treatment plan, I understand your concern.

${patientBrief.currentMedications ? `I see you're currently taking: ${patientBrief.currentMedications}.` : ''}

${patientBrief.allergies && patientBrief.allergies !== 'NKDA' ? `Please remember that you have allergies to: ${patientBrief.allergies}.` : ''}

${patientBrief.doctorNotes ? `Clinical notes: ${patientBrief.doctorNotes}` : ''}

I recommend scheduling an appointment to discuss this further and ensure your treatment plan remains optimal.

${patientBrief.doctor.doctorSettings?.signOff || 'Best regards,\nYour Healthcare Team'}`;

      console.log("[MOCK DRAFT] Generated mock response for testing");
    } else {
      // Use real OpenAI API
      const openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      // Generate the prompt
      const prompt = buildPrompt(patientBrief, request.patientInquiry, patientBrief.doctor.doctorSettings);

      // Call OpenAI API with HIPAA-compliant settings
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Using faster, cost-effective model
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(patientBrief.doctor.doctorSettings)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: patientBrief.doctor.doctorSettings?.maxWords || 300,
        temperature: 0.3, // Lower temperature for more consistent medical communication
        top_p: 0.9,
        // HIPAA compliance settings
        store: false // Don't store conversations for training
      });

      const content = completion.choices[0]?.message?.content;
      generatedDraft = content || null;

      if (!generatedDraft) {
        return { success: false, error: 'Failed to generate draft' };
      }

      // Log the action for audit purposes
      await db.auditLog.create({
        data: {
          userId: request.userId,
          patientName: patientBrief.patientName,
          requestText: request.patientInquiry,
          generatedDraft: generatedDraft,
          finalMessage: '', // Will be updated when message is finalized
          actionType: 'draft_generated',
          deliveryStatus: 'draft',
          aiModelUsed: 'gpt-4o-mini',
          tokensConsumed: completion.usage?.total_tokens || 0
        }
      });

      return {
        success: true,
        draft: generatedDraft,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0
        }
      };
    }

    // For mock responses, we still need to log the action
    await db.auditLog.create({
      data: {
        userId: request.userId,
        patientName: patientBrief.patientName,
        requestText: request.patientInquiry,
        generatedDraft: generatedDraft,
        finalMessage: '', // Will be updated when message is finalized
        actionType: 'draft_generated',
        deliveryStatus: 'draft',
        aiModelUsed: 'mock'
      }
    });

    return {
      success: true,
      draft: generatedDraft,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      }
    };

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        return { success: false, error: 'API rate limit exceeded. Please try again in a moment.' };
      }
      if (error.status === 400) {
        return { success: false, error: 'Invalid request. Please check your input.' };
      }
      if (error.status === 401) {
        return { success: false, error: 'API authentication failed.' };
      }
    }

    return { 
      success: false, 
      error: 'An error occurred while generating the draft. Please try again.' 
    };
  }
}

/**
 * Build the system prompt based on doctor settings
 */
function buildSystemPrompt(doctorSettings: any): string {
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
- Maximum words: ${doctorSettings?.maxWords || 300}

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

Draft a complete, professional response:`;
}
