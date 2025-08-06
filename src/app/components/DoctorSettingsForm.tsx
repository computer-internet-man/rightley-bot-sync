"use client";

import React, { useState, useEffect } from 'react';
import { DoctorSettingsFormData, validateDoctorSettingsData } from '@/app/actions/doctorSettingsActions';
import { SettingsPreview } from './SettingsPreview';
import { SettingsHistory } from './SettingsHistory';
import { 
  TONE_DESCRIPTIONS, 
  READING_LEVEL_DESCRIPTIONS, 
  SPECIALTY_DESCRIPTIONS,
  validateField 
} from '@/lib/validation/doctorSettingsSchema';

interface DoctorSettingsFormProps {
  initialSettings?: any;
  onSave: (data: DoctorSettingsFormData) => Promise<void>;
}

interface FormErrors {
  [key: string]: string;
}

export function DoctorSettingsForm({ initialSettings, onSave }: DoctorSettingsFormProps) {
  const [formData, setFormData] = useState<DoctorSettingsFormData>({
    communicationTone: initialSettings?.communicationTone || 'professional',
    signOff: initialSettings?.signOff || '',
    maxWords: initialSettings?.maxWords || 150,
    readingLevel: initialSettings?.readingLevel || 'middle',
    specialtyFocus: initialSettings?.specialtyFocus || 'general',
    medicationTemplate: 'Please take your medication as prescribed. If you experience any side effects, contact our office immediately.',
    emergencyTemplate: 'For urgent matters, please call our office during business hours (8 AM - 5 PM). For after-hours emergencies, call 911.'
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Real-time validation
  useEffect(() => {
    const validationErrors = validateDoctorSettingsData(formData);
    const errorMap: FormErrors = {};
    
    validationErrors.forEach(error => {
      if (error.includes('communication tone')) errorMap.communicationTone = error;
      if (error.includes('Sign-off')) errorMap.signOff = error;
      if (error.includes('Max words')) errorMap.maxWords = error;
      if (error.includes('reading level')) errorMap.readingLevel = error;
      if (error.includes('specialty')) errorMap.specialtyFocus = error;
    });
    
    setErrors(errorMap);
  }, [formData]);

  const handleInputChange = (field: keyof DoctorSettingsFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setSaveStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateDoctorSettingsData(formData);
    if (validationErrors.length > 0) {
      alert('Please fix validation errors before saving.');
      return;
    }

    setIsSubmitting(true);
    setSaveStatus('saving');
    
    try {
      await onSave(formData);
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      alert('Failed to save settings. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      communicationTone: initialSettings?.communicationTone || 'professional',
      signOff: initialSettings?.signOff || '',
      maxWords: initialSettings?.maxWords || 150,
      readingLevel: initialSettings?.readingLevel || 'middle',
      specialtyFocus: initialSettings?.specialtyFocus || 'general',
      medicationTemplate: 'Please take your medication as prescribed. If you experience any side effects, contact our office immediately.',
      emergencyTemplate: 'For urgent matters, please call our office during business hours (8 AM - 5 PM). For after-hours emergencies, call 911.'
    });
    setIsDirty(false);
    setSaveStatus('idle');
  };

  const getCharacterCount = (text: string) => text.length;
  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(word => word.length > 0).length;

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Doctor Communication Settings</h2>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
              Communication Preferences
            </h3>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Communication Tone */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Communication Tone *
                </label>
                <select 
                  value={formData.communicationTone}
                  onChange={(e) => handleInputChange('communicationTone', e.target.value)}
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.communicationTone ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="professional">Professional</option>
                  <option value="warm">Warm & Friendly</option>
                  <option value="empathetic">Empathetic</option>
                  <option value="concise">Concise & Direct</option>
                </select>
                {errors.communicationTone && (
                  <p className="mt-1 text-sm text-red-600">{errors.communicationTone}</p>
                )}
              </div>

              {/* Reading Level */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Reading Level *
                </label>
                <select 
                  value={formData.readingLevel}
                  onChange={(e) => handleInputChange('readingLevel', e.target.value)}
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.readingLevel ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="elementary">Elementary (Grade 3-5)</option>
                  <option value="middle">Middle School (Grade 6-8)</option>
                  <option value="high">High School (Grade 9-12)</option>
                  <option value="college">College Level</option>
                </select>
                {errors.readingLevel && (
                  <p className="mt-1 text-sm text-red-600">{errors.readingLevel}</p>
                )}
              </div>

              {/* Maximum Words */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Maximum Words *
                </label>
                <input
                  type="number"
                  min="50"
                  max="500"
                  value={formData.maxWords}
                  onChange={(e) => handleInputChange('maxWords', parseInt(e.target.value) || 150)}
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.maxWords ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Range: 50-500 words. Recommended: 100-200 for most communications
                </p>
                {errors.maxWords && (
                  <p className="mt-1 text-sm text-red-600">{errors.maxWords}</p>
                )}
              </div>

              {/* Specialty Focus */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Specialty Focus *
                </label>
                <select 
                  value={formData.specialtyFocus}
                  onChange={(e) => handleInputChange('specialtyFocus', e.target.value)}
                  className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                    errors.specialtyFocus ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="general">General Practice</option>
                  <option value="cardiology">Cardiology</option>
                  <option value="endocrinology">Endocrinology</option>
                  <option value="pulmonology">Pulmonology</option>
                  <option value="psychiatry">Psychiatry</option>
                  <option value="pediatrics">Pediatrics</option>
                </select>
                {errors.specialtyFocus && (
                  <p className="mt-1 text-sm text-red-600">{errors.specialtyFocus}</p>
                )}
              </div>
            </div>

            {/* Sign-off */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700">
                Standard Sign-off *
              </label>
              <textarea
                rows={3}
                value={formData.signOff}
                onChange={(e) => handleInputChange('signOff', e.target.value)}
                className={`mt-1 block w-full border rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${
                  errors.signOff ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your standard message sign-off..."
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>Characters: {getCharacterCount(formData.signOff)}/200</span>
                <span>This will be automatically added to all generated messages</span>
              </div>
              {errors.signOff && (
                <p className="mt-1 text-sm text-red-600">{errors.signOff}</p>
              )}
            </div>
          </div>
        </div>

        {/* Message Templates */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
              Message Templates & Guidelines
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Medication Instructions Template
                </label>
                <textarea
                  rows={4}
                  value={formData.medicationTemplate}
                  onChange={(e) => handleInputChange('medicationTemplate', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Words: {getWordCount(formData.medicationTemplate)}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Emergency Contact Instructions
                </label>
                <textarea
                  rows={3}
                  value={formData.emergencyTemplate}
                  onChange={(e) => handleInputChange('emergencyTemplate', e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Words: {getWordCount(formData.emergencyTemplate)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || isSubmitting}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Reset
            </button>
            
            <button
              type="submit"
              disabled={isSubmitting || Object.keys(errors).length > 0}
              className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Save Status */}
          <div className="text-sm">
            {saveStatus === 'saving' && (
              <span className="text-blue-600">Saving...</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-green-600">✓ Settings saved successfully</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-red-600">✗ Error saving settings</span>
            )}
            {isDirty && saveStatus === 'idle' && (
              <span className="text-yellow-600">Unsaved changes</span>
            )}
          </div>
        </div>
      </form>

      {/* Settings Preview Component */}
      <SettingsPreview settings={formData} isVisible={showPreview} />
      
      {/* Settings History Modal */}
      <SettingsHistory 
        isVisible={showHistory} 
        onClose={() => setShowHistory(false)} 
      />
    </div>
  );
}
