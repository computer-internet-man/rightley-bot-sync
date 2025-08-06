"use client";

import React, { useMemo } from 'react';
import { DoctorSettingsFormData, generateSampleMessage } from '@/app/actions/doctorSettingsActions';

interface SettingsPreviewProps {
  settings: Partial<DoctorSettingsFormData>;
  isVisible: boolean;
}

export function SettingsPreview({ settings, isVisible }: SettingsPreviewProps) {
  const scenarios = ['medication', 'appointment', 'followup'];
  
  const sampleMessages = useMemo(() => {
    return scenarios.map(scenario => ({
      scenario,
      message: generateSampleMessage(settings, scenario)
    }));
  }, [settings]);

  const readingLevelExamples = {
    elementary: "Your medicine is working. Keep taking it every day.",
    middle: "Your blood pressure medication is helping. Continue taking it as your doctor told you.",
    high: "Your antihypertensive medication shows good therapeutic response. Maintain current dosage regimen.",
    college: "The pharmacological intervention demonstrates optimal efficacy in managing your hypertensive condition."
  };

  const toneExamples = {
    professional: "Your test results indicate satisfactory progress with current treatment protocol.",
    warm: "I'm so pleased to see your test results showing great improvement! You're doing wonderfully.",
    empathetic: "I understand waiting for results can be stressful. I'm happy to share that everything looks positive.",
    concise: "Test results normal. Continue current treatment."
  };

  if (!isVisible) return null;

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
          Settings Preview & Testing
        </h3>

        {/* Sample Messages */}
        <div className="mb-8">
          <h4 className="text-md font-medium text-gray-800 mb-4">Sample Generated Messages</h4>
          <div className="space-y-4">
            {sampleMessages.map(({ scenario, message }) => (
              <div key={scenario} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-gray-700 capitalize">
                    {scenario} Message
                  </h5>
                  <span className="text-xs text-gray-500">
                    {message.split(' ').length} words
                  </span>
                </div>
                <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 whitespace-pre-line">
                  {message}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reading Level Examples */}
        <div className="mb-8">
          <h4 className="text-md font-medium text-gray-800 mb-4">
            Reading Level Comparison
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(readingLevelExamples).map(([level, example]) => (
              <div 
                key={level} 
                className={`border rounded-lg p-3 ${
                  settings.readingLevel === level 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200'
                }`}
              >
                <h5 className="text-sm font-medium text-gray-700 capitalize mb-2">
                  {level === 'elementary' ? 'Elementary (Grade 3-5)' :
                   level === 'middle' ? 'Middle School (Grade 6-8)' :
                   level === 'high' ? 'High School (Grade 9-12)' :
                   'College Level'}
                </h5>
                <p className="text-sm text-gray-600 italic">
                  "{example}"
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Communication Tone Examples */}
        <div className="mb-8">
          <h4 className="text-md font-medium text-gray-800 mb-4">
            Communication Tone Comparison
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(toneExamples).map(([tone, example]) => (
              <div 
                key={tone} 
                className={`border rounded-lg p-3 ${
                  settings.communicationTone === tone 
                    ? 'border-green-500 bg-green-50' 
                    : 'border-gray-200'
                }`}
              >
                <h5 className="text-sm font-medium text-gray-700 capitalize mb-2">
                  {tone === 'warm' ? 'Warm & Friendly' : 
                   tone === 'concise' ? 'Concise & Direct' :
                   tone.charAt(0).toUpperCase() + tone.slice(1)}
                </h5>
                <p className="text-sm text-gray-600 italic">
                  "{example}"
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Word Count Demonstration */}
        <div className="mb-8">
          <h4 className="text-md font-medium text-gray-800 mb-4">
            Word Count Impact
          </h4>
          <div className="space-y-3">
            {[50, 100, 200, 300].map(wordCount => {
              const testMessage = generateSampleMessage(
                { ...settings, maxWords: wordCount }, 
                'medication'
              );
              return (
                <div 
                  key={wordCount}
                  className={`border rounded-lg p-3 ${
                    settings.maxWords === wordCount 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <h5 className="text-sm font-medium text-gray-700">
                      {wordCount} words max
                    </h5>
                    <span className="text-xs text-gray-500">
                      Actual: {testMessage.split(' ').length} words
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {testMessage}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Settings Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-800 mb-2">Current Settings Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Tone:</span>
              <span className="ml-2 font-medium">{settings.communicationTone || 'Not set'}</span>
            </div>
            <div>
              <span className="text-gray-600">Max Words:</span>
              <span className="ml-2 font-medium">{settings.maxWords || 'Not set'}</span>
            </div>
            <div>
              <span className="text-gray-600">Reading Level:</span>
              <span className="ml-2 font-medium">{settings.readingLevel || 'Not set'}</span>
            </div>
            <div>
              <span className="text-gray-600">Specialty:</span>
              <span className="ml-2 font-medium">{settings.specialtyFocus || 'Not set'}</span>
            </div>
          </div>
          {settings.signOff && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <span className="text-gray-600 text-sm">Sign-off:</span>
              <div className="mt-1 bg-white p-2 rounded text-sm font-medium whitespace-pre-line">
                {settings.signOff}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
