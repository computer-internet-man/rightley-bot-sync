import React from 'react';
import { AppContext } from '@/worker';
import { Navigation } from '@/app/components/Navigation';

interface HomeProps {
  ctx: AppContext;
}

export function Home({ ctx }: HomeProps) {
  const { user } = ctx;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation ctx={ctx} currentPath="/" />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-b border-gray-200 pb-5">
            <h1 className="text-3xl font-bold leading-6 text-gray-900">
              AI Concierge MVP - Dashboard
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-gray-500">
              Welcome to the AI Concierge MVP. This system helps healthcare staff provide AI-powered patient communication.
            </p>
          </div>

          {user ? (
            <div className="mt-8">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Welcome, {user.email}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    You are logged in with the role: <span className="font-semibold">{user.role}</span>
                  </p>
                  
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-6">
                    {(user.role === 'staff' || user.role === 'reviewer' || user.role === 'doctor' || user.role === 'admin') && (
                      <a
                        href="/draft"
                        className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <span className="rounded-lg inline-flex p-3 bg-blue-50 text-blue-600 ring-4 ring-white">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                          </span>
                        </div>
                        <div className="mt-8">
                          <h3 className="text-base font-medium text-gray-900">
                            Message Workflow
                          </h3>
                          <p className="mt-2 text-sm text-gray-500">
                            Create and manage AI-powered patient communications
                          </p>
                        </div>
                        <span className="pointer-events-none absolute top-6 right-6 text-gray-300 group-hover:text-gray-400">
                          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20 4h1a1 1 0 00-1-1v1zm-1 12a1 1 0 102 0h-2zM8 3a1 1 0 000 2V3zM3.293 19.293a1 1 0 101.414 1.414l-1.414-1.414zM19 4v12h2V4h-2zm1-1H8v2h12V3zm-.707.293l-16 16 1.414 1.414 16-16-1.414-1.414z"></path>
                          </svg>
                        </span>
                      </a>
                    )}

                    {user.role === 'doctor' && (
                      <a
                        href="/doctor/settings"
                        className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <span className="rounded-lg inline-flex p-3 bg-green-50 text-green-600 ring-4 ring-white">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                            </svg>
                          </span>
                        </div>
                        <div className="mt-8">
                          <h3 className="text-base font-medium text-gray-900">
                            Doctor Settings
                          </h3>
                          <p className="mt-2 text-sm text-gray-500">
                            Configure AI communication preferences
                          </p>
                        </div>
                      </a>
                    )}

                    {(user.role === 'doctor' || user.role === 'admin') && (
                      <a
                        href="/admin/briefs"
                        className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <span className="rounded-lg inline-flex p-3 bg-purple-50 text-purple-600 ring-4 ring-white">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                            </svg>
                          </span>
                        </div>
                        <div className="mt-8">
                          <h3 className="text-base font-medium text-gray-900">
                            Patient Briefs
                          </h3>
                          <p className="mt-2 text-sm text-gray-500">
                            Manage patient medical information and context
                          </p>
                        </div>
                      </a>
                    )}

                    {(user.role === 'auditor' || user.role === 'admin' || user.role === 'doctor') && (
                      <a
                        href="/admin/audit"
                        className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div>
                          <span className="rounded-lg inline-flex p-3 bg-yellow-50 text-yellow-600 ring-4 ring-white">
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                            </svg>
                          </span>
                        </div>
                        <div className="mt-8">
                          <h3 className="text-base font-medium text-gray-900">
                            Audit Logs
                          </h3>
                          <p className="mt-2 text-sm text-gray-500">
                            Review communication activities and compliance
                          </p>
                        </div>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Role-specific Information */}
              <div className="mt-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Your Role: {user.role}
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          {user.role === 'staff' && 
                            "As staff, you can create draft messages and view assigned patients."}
                          {user.role === 'reviewer' && 
                            "As a reviewer, you can create drafts and send messages directly."}
                          {user.role === 'doctor' && 
                            "As a doctor, you have access to patient briefs, settings, and audit logs for your patients."}
                          {user.role === 'auditor' && 
                            "As an auditor, you can review all communication activities for compliance purposes."}
                          {user.role === 'admin' && 
                            "As an admin, you have full access to all system features and data."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6 text-center">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Please log in to access the system
                  </h3>
                  <a
                    href="/login"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Go to Login
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
