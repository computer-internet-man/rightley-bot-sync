import { updateDoctorSettings } from '@/lib/server-functions';
import { AppContext } from '@/worker';

export interface DoctorSettingsFormData {
  communicationTone: string;
  signOff: string;
  maxWords: number;
  readingLevel: string;
  specialtyFocus: string;
  medicationTemplate: string;
  emergencyTemplate: string;
}

export async function updateDoctorSettingsAction(
  ctx: AppContext,
  formData: DoctorSettingsFormData
) {
  const { user } = ctx;
  
  if (!user || user.role !== 'doctor') {
    throw new Error('Access denied - Only doctors can update settings');
  }

  // Validate input data
  const errors = validateDoctorSettingsData(formData);
  if (errors.length > 0) {
    throw new Error(`Validation errors: ${errors.join(', ')}`);
  }

  try {
    const updatedSettings = await updateDoctorSettings(user, {
      communicationTone: formData.communicationTone,
      signOff: formData.signOff,
      maxWords: formData.maxWords,
      readingLevel: formData.readingLevel,
      specialtyFocus: formData.specialtyFocus,
    });

    return { success: true, data: updatedSettings };
  } catch (error) {
    console.error('Error updating doctor settings:', error);
    throw new Error('Failed to update settings. Please try again.');
  }
}

export function validateDoctorSettingsData(data: DoctorSettingsFormData): string[] {
  const errors: string[] = [];

  // Communication tone validation
  const validTones = ['professional', 'warm', 'empathetic', 'concise'];
  if (!validTones.includes(data.communicationTone)) {
    errors.push('Invalid communication tone selected');
  }

  // Sign-off validation
  if (!data.signOff || data.signOff.trim().length < 10) {
    errors.push('Sign-off must be at least 10 characters long');
  }
  if (data.signOff && data.signOff.length > 200) {
    errors.push('Sign-off must not exceed 200 characters');
  }

  // Max words validation
  if (!data.maxWords || data.maxWords < 50 || data.maxWords > 500) {
    errors.push('Max words must be between 50 and 500');
  }

  // Reading level validation
  const validLevels = ['elementary', 'middle', 'high', 'college'];
  if (!validLevels.includes(data.readingLevel)) {
    errors.push('Invalid reading level selected');
  }

  // Specialty focus validation
  const validSpecialties = ['general', 'cardiology', 'endocrinology', 'pulmonology', 'psychiatry', 'pediatrics'];
  if (!validSpecialties.includes(data.specialtyFocus)) {
    errors.push('Invalid specialty focus selected');
  }

  return errors;
}

// Generate sample messages for preview
export function generateSampleMessage(settings: Partial<DoctorSettingsFormData>, scenario: string): string {
  const toneStyles = {
    professional: 'formal and clinical',
    warm: 'friendly and caring',
    empathetic: 'understanding and compassionate',
    concise: 'brief and direct'
  };

  const readingLevelStyles = {
    elementary: 'simple words and short sentences',
    middle: 'clear and straightforward language',
    high: 'detailed explanations with medical terms',
    college: 'comprehensive medical terminology'
  };

  const scenarios = {
    medication: 'Your test results show that your blood pressure medication is working well. Please continue taking it as prescribed.',
    appointment: 'Your upcoming appointment has been scheduled for next Tuesday at 2 PM. Please arrive 15 minutes early.',
    followup: 'Based on your recent visit, I recommend scheduling a follow-up appointment in 3 months to monitor your progress.'
  };

  const baseMessage = scenarios[scenario as keyof typeof scenarios] || scenarios.medication;
  const tone = settings.communicationTone || 'professional';
  const readingLevel = settings.readingLevel || 'middle';
  const maxWords = settings.maxWords || 150;
  const signOff = settings.signOff || 'Best regards,\nDr. Smith';

  // Simulate message adaptation based on settings
  let adaptedMessage = baseMessage;
  
  if (tone === 'warm') {
    adaptedMessage = `I hope you're doing well! ${adaptedMessage} Please don't hesitate to reach out if you have any questions.`;
  } else if (tone === 'empathetic') {
    adaptedMessage = `I understand this may be concerning. ${adaptedMessage} I'm here to support you through this process.`;
  } else if (tone === 'concise') {
    adaptedMessage = adaptedMessage.split('.')[0] + '.';
  }

  // Simulate reading level adaptation
  if (readingLevel === 'elementary') {
    adaptedMessage = adaptedMessage.replace(/medication/g, 'medicine').replace(/prescribed/g, 'told to take');
  } else if (readingLevel === 'college') {
    adaptedMessage = adaptedMessage.replace(/blood pressure medication/g, 'antihypertensive pharmaceutical');
  }

  // Truncate to max words
  const words = adaptedMessage.split(' ');
  if (words.length > maxWords) {
    adaptedMessage = words.slice(0, maxWords).join(' ') + '...';
  }

  return `${adaptedMessage}\n\n${signOff}`;
}
