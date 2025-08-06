import React from 'react';
import { AppContext } from '@/worker';
import { Navigation } from '@/app/components/Navigation';

interface LoginPageProps {
  ctx: AppContext;
}

export default function LoginPage({ ctx }: LoginPageProps) {
  const { user } = ctx;

  // If user is already logged in, show a success message
  if (user) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation ctx={ctx} currentPath="/login" />
        <div className="flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Already Logged In
            </h2>
            <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Welcome back!</h3>
                <p className="mt-1 text-sm text-gray-500">
                  You are logged in as: <strong>{user.email}</strong>
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Role: <strong>{user.role}</strong>
                </p>
                <div className="mt-6">
                  <a
                    href="/draft"
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Go to Dashboard
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">AI Concierge MVP</h1>
          <h2 className="mt-6 text-center text-2xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Secure access via Cloudflare Access
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-900">Secure Authentication Required</h3>
              <p className="mt-1 text-sm text-gray-500">
                This application is protected by Cloudflare Access. Please authenticate to continue.
              </p>
            </div>
            
            <div className="rounded-md bg-blue-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    How to Access
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Navigate to the application URL</li>
                      <li>You'll be redirected to Cloudflare Access login</li>
                      <li>Authenticate with your corporate credentials</li>
                      <li>You'll be automatically redirected back to the application</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                If you're having trouble accessing the application, please contact your system administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
