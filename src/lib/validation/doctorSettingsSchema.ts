export interface DoctorSettingsValidation {
  field: string;
  value: any;
  errors: string[];
}

interface ValidationRule {
  required: boolean;
  allowedValues?: string[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  type?: string;
  errorMessage: string;
}

export const VALIDATION_RULES: Record<string, ValidationRule> = {
  communicationTone: {
    required: true,
    allowedValues: ['professional', 'warm', 'empathetic', 'concise'],
    errorMessage: 'Please select a valid communication tone'
  },
  signOff: {
    required: true,
    minLength: 10,
    maxLength: 200,
    errorMessage: 'Sign-off must be between 10 and 200 characters'
  },
  maxWords: {
    required: true,
    min: 50,
    max: 500,
    type: 'number',
    errorMessage: 'Maximum words must be between 50 and 500'
  },
  readingLevel: {
    required: true,
    allowedValues: ['elementary', 'middle', 'high', 'college'],
    errorMessage: 'Please select a valid reading level'
  },
  specialtyFocus: {
    required: true,
    allowedValues: ['general', 'cardiology', 'endocrinology', 'pulmonology', 'psychiatry', 'pediatrics'],
    errorMessage: 'Please select a valid specialty focus'
  },
  medicationTemplate: {
    required: false,
    maxLength: 1000,
    errorMessage: 'Medication template must not exceed 1000 characters'
  },
  emergencyTemplate: {
    required: false,
    maxLength: 1000,
    errorMessage: 'Emergency template must not exceed 1000 characters'
  }
};

export function validateField(field: string, value: any): string[] {
  const rule = VALIDATION_RULES[field];
  if (!rule) return [];

  const errors: string[] = [];

  // Required validation
  if (rule.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    errors.push(`${field} is required`);
    return errors; // Return early if required field is missing
  }

  // Type validation
  if (rule.type === 'number' && value !== undefined && value !== null) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      errors.push(`${field} must be a valid number`);
      return errors;
    }
    
    // Min/Max for numbers
    if (rule.min !== undefined && numValue < rule.min) {
      errors.push(`${field} must be at least ${rule.min}`);
    }
    if (rule.max !== undefined && numValue > rule.max) {
      errors.push(`${field} must be no more than ${rule.max}`);
    }
  }

  // String length validation
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(`${field} must be at least ${rule.minLength} characters long`);
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(`${field} must be no more than ${rule.maxLength} characters long`);
    }
  }

  // Allowed values validation
  if (rule.allowedValues && !rule.allowedValues.includes(value)) {
    errors.push(`${field} must be one of: ${rule.allowedValues.join(', ')}`);
  }

  return errors;
}

export function validateAllFields(data: Record<string, any>): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  Object.keys(VALIDATION_RULES).forEach(field => {
    const fieldErrors = validateField(field, data[field]);
    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  });

  return errors;
}

export function hasValidationErrors(errors: Record<string, string[]>): boolean {
  return Object.values(errors).some(fieldErrors => fieldErrors.length > 0);
}

// Helper functions for specific validations
export function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

export function getCharacterCount(text: string): number {
  return text.length;
}

export function truncateToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

// Communication tone descriptions for UI
export const TONE_DESCRIPTIONS = {
  professional: 'Formal, clinical language appropriate for medical communications',
  warm: 'Friendly and caring tone that builds patient rapport',
  empathetic: 'Understanding and compassionate approach for sensitive topics',
  concise: 'Brief and direct communication that gets straight to the point'
};

// Reading level descriptions for UI
export const READING_LEVEL_DESCRIPTIONS = {
  elementary: 'Simple words and short sentences (Grade 3-5)',
  middle: 'Clear and straightforward language (Grade 6-8)',
  high: 'Detailed explanations with some medical terms (Grade 9-12)',
  college: 'Comprehensive medical terminology (College level)'
};

// Specialty focus descriptions for UI
export const SPECIALTY_DESCRIPTIONS = {
  general: 'General family medicine and primary care',
  cardiology: 'Heart and cardiovascular conditions',
  endocrinology: 'Diabetes, thyroid, and hormone disorders',
  pulmonology: 'Lung and respiratory conditions',
  psychiatry: 'Mental health and behavioral conditions',
  pediatrics: 'Children and adolescent medicine'
};
