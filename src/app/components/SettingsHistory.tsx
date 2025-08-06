"use client";

import React, { useState, useEffect } from 'react';

interface SettingsChange {
  id: string;
  timestamp: Date;
  field: string;
  oldValue: string;
  newValue: string;
  doctor: string;
}

interface SettingsHistoryProps {
  isVisible: boolean;
  onClose: () => void;
}

export function SettingsHistory({ isVisible, onClose }: SettingsHistoryProps) {
  const [changes, setChanges] = useState<SettingsChange[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock data for demonstration - in real app, fetch from database
  useEffect(() => {
    if (isVisible) {
      setLoading(true);
      
      // Simulate API call
      setTimeout(() => {
        const mockChanges: SettingsChange[] = [
          {
            id: '1',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
            field: 'communicationTone',
            oldValue: 'professional',
            newValue: 'warm',
            doctor: 'dr.smith@hospital.com'
          },
          {
            id: '2',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
            field: 'maxWords',
            oldValue: '200',
            newValue: '150',
            doctor: 'dr.smith@hospital.com'
          },
          {
            id: '3',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
            field: 'readingLevel',
            oldValue: 'high',
            newValue: 'middle',
            doctor: 'dr.smith@hospital.com'
          },
          {
            id: '4',
            timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 1 week ago
            field: 'signOff',
            oldValue: 'Best regards, Dr. Smith',
            newValue: 'Best regards,\nDr. Smith\nInternal Medicine',
            doctor: 'dr.smith@hospital.com'
          }
        ];
        
        setChanges(mockChanges);
        setLoading(false);
      }, 500);
    }
  }, [isVisible]);

  const formatFieldName = (field: string): string => {
    const fieldNames: Record<string, string> = {
      communicationTone: 'Communication Tone',
      maxWords: 'Maximum Words',
      readingLevel: 'Reading Level',
      specialtyFocus: 'Specialty Focus',
      signOff: 'Sign-off Message'
    };
    return fieldNames[field] || field;
  };

  const formatValue = (value: string): string => {
    // Format values for display
    const valueMap: Record<string, string> = {
      professional: 'Professional',
      warm: 'Warm & Friendly',
      empathetic: 'Empathetic',
      concise: 'Concise & Direct',
      elementary: 'Elementary (Grade 3-5)',
      middle: 'Middle School (Grade 6-8)',
      high: 'High School (Grade 9-12)',
      college: 'College Level',
      general: 'General Practice',
      cardiology: 'Cardiology',
      endocrinology: 'Endocrinology',
      pulmonology: 'Pulmonology',
      psychiatry: 'Psychiatry',
      pediatrics: 'Pediatrics'
    };
    return valueMap[value] || value;
  };

  const formatTimestamp = (timestamp: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return timestamp.toLocaleDateString();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Settings Change History</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {changes.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No settings changes found.</p>
            ) : (
              <div className="space-y-4">
                {changes.map((change) => (
                  <div key={change.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-sm font-medium text-gray-900">
                        {formatFieldName(change.field)}
                      </h4>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(change.timestamp)}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">From:</span>
                        <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-red-800">
                          {change.field === 'signOff' ? (
                            <pre className="whitespace-pre-wrap text-xs">{change.oldValue}</pre>
                          ) : (
                            formatValue(change.oldValue)
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-gray-600">To:</span>
                        <div className="mt-1 p-2 bg-green-50 border border-green-200 rounded text-green-800">
                          {change.field === 'signOff' ? (
                            <pre className="whitespace-pre-wrap text-xs">{change.newValue}</pre>
                          ) : (
                            formatValue(change.newValue)
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
