import { generateDraftAction, type DraftRequest, type DraftResponse } from '@/actions/generateDraft';

/**
 * Client-side service for draft generation
 * Provides rate limiting and error handling
 */
export class DraftService {
  private lastRequestTime = 0;
  private readonly minRequestInterval = 2000; // 2 seconds between requests

  /**
   * Generate a draft with rate limiting
   */
  async generateDraft(request: DraftRequest): Promise<DraftResponse> {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();

    try {
      // Call server action
      const response = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: DraftResponse = await response.json();
      return result;

    } catch (error) {
      console.error('Draft generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error occurred'
      };
    }
  }

  /**
   * Validate draft against doctor settings
   */
  validateDraft(draft: string, maxWords: number): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const wordCount = draft.trim().split(/\s+/).length;

    if (wordCount > maxWords) {
      issues.push(`Draft exceeds maximum word count (${wordCount}/${maxWords} words)`);
    }

    // Check for potential HIPAA violations
    const hipaaFlags = [
      /ssn|social security/i,
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b\d{16}\b/, // Credit card pattern
    ];

    for (const flag of hipaaFlags) {
      if (flag.test(draft)) {
        issues.push('Draft may contain sensitive information that should be removed');
        break;
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Analyze reading level (simplified analysis)
   */
  analyzeReadingLevel(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);

    if (sentences.length === 0 || words.length === 0) return 'Unable to analyze';

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    // Simplified Flesch-Kincaid Grade Level
    const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

    if (gradeLevel <= 6) return 'Elementary';
    if (gradeLevel <= 8) return 'Middle School';
    if (gradeLevel <= 12) return 'High School';
    return 'College+';
  }

  private countSyllables(word: string): number {
    // Simplified syllable counting
    const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
    if (cleaned.length === 0) return 0;
    
    const vowels = 'aeiouy';
    let count = 0;
    let prevWasVowel = false;

    for (let i = 0; i < cleaned.length; i++) {
      const isVowel = vowels.includes(cleaned[i]);
      if (isVowel && !prevWasVowel) {
        count++;
      }
      prevWasVowel = isVowel;
    }

    // Adjust for silent e
    if (cleaned.endsWith('e') && count > 1) {
      count--;
    }

    return Math.max(1, count);
  }
}

export const draftService = new DraftService();
