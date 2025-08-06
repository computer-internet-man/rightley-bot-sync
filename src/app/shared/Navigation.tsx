import React from 'react';
import { AppContext } from '@/worker';
import { hasRole } from '@/lib/auth';

interface NavigationProps {
  ctx: AppContext;
  currentPath?: string;
}

export default function Navigation({ ctx, currentPath }: NavigationProps) {
  const { user } = ctx;

  if (!user) {
    return null;
  }

  const navigationItems = [
    // Draft workflow - Staff and above
    {
      name: 'Draft Messages',
      href: '/draft',
      icon: '✏️',
      requiredRole: 'staff' as const,
      description: 'Create and manage patient communication drafts'
    },
    // Doctor settings - Doctor and above
    {
      name: 'Doctor Settings',
      href: '/doctor/settings',
      icon: '⚙️',
      requiredRole: 'doctor' as const,
      description: 'Configure AI communication preferences'
    },
    // Patient briefs - Doctor and above
    {
      name: 'Patient Briefs',
      href: '/admin/briefs',
      icon: '📋',
      requiredRole: 'doctor' as const,
      description: 'Manage patient medical briefs'
    },
    // Audit logs - Auditor and above
    {
      name: 'Audit Logs',
      href: '/admin/audit',
      icon: '📊',
      requiredRole: 'auditor' as const,
      description: 'Review compliance and audit trails'
    }
  ];

  const visibleItems = navigationItems.filter(item => 
    hasRole(user, item.requiredRole)
  );

  return (
    <div className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and title */}
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-gray-900">
                AI Concierge
              </h1>
            </div>
            <div className="ml-4 text-sm text-gray-500">
              Medical Communications Platform
            </div>
          </div>

          {/* Navigation links */}
          <nav className="flex space-x-8">
            {visibleItems.map((item) => {
              const isActive = currentPath === item.href;
              return (
                <a
                  key={item.name}
                  href={item.href}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                  title={item.description}
                >
                  <span className="mr-2">{item.icon}</span>
                  {item.name}
                </a>
              );
            })}
          </nav>

          {/* User info and logout */}
          <div className="flex items-center space-x-4">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{user.email}</div>
              <div className="text-gray-500 capitalize">
                Role: {user.role}
              </div>
            </div>
            <button
              onClick={() => {
                // In a real app, this would handle logout
                window.location.href = '/login';
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
