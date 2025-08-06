import React from 'react';
import { AppContext } from '@/worker';
import { Navigation } from '@/app/components/Navigation';
import { getDoctorSettings } from '@/lib/server-functions';
import { DoctorSettingsFormWrapper } from '@/app/components/DoctorSettingsFormWrapper';

interface DoctorSettingsPageProps {
  ctx: AppContext;
}

export default async function DoctorSettingsPage({ ctx }: DoctorSettingsPageProps) {
  const { user } = ctx;
  
  if (!user || user.role !== 'doctor') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only doctors can access this page.</p>
        </div>
      </div>
    );
  }

  // Fetch current doctor settings
  const doctorSettings = await getDoctorSettings(user);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation ctx={ctx} currentPath="/doctor/settings" />
      <div className="max-w-6xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-b border-gray-200 pb-5 mb-8">
            <h1 className="text-3xl font-bold leading-6 text-gray-900">
              Doctor Communication Settings
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-gray-500">
              Configure how AI generates patient communication messages. 
              Current user: {user?.email} ({user?.role})
            </p>
          </div>

          {/* Interactive Settings Form */}
          <DoctorSettingsFormWrapper 
            ctx={ctx}
            initialSettings={doctorSettings}
          />

          {/* Usage Guidelines */}
          <div className="mt-8">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-gray-800">
                    Settings Usage Information
                  </h3>
                  <div className="mt-2 text-sm text-gray-600">
                    <p>
                      These settings control how the AI generates patient communication messages in your name. 
                      All messages generated will follow these preferences and include your standard sign-off. 
                      You can update these settings at any time, and changes will apply to all future message generations.
                      Use the preview feature to see how your settings affect message generation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
