import React from 'react';
import { AppContext } from '@/worker';
import { 
  canAccessPatientBriefs, 
  canAccessDoctorSettings, 
  canAccessAuditLogs,
  canAccessDraftWorkflow 
} from '@/lib/server-functions';

interface NavigationProps {
  ctx: AppContext;
  currentPath?: string;
}

export function Navigation({ ctx, currentPath = "/" }: NavigationProps) {
  const { user } = ctx;

  if (!user) {
    return (
      <nav className="bg-white shadow border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">AI Concierge MVP</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/login"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  const navItems = [
    {
      href: "/",
      label: "Home",
      show: true,
    },
    {
      href: "/draft",
      label: "Message Workflow",
      show: canAccessDraftWorkflow(user),
    },
    {
      href: "/doctor/settings",
      label: "Doctor Settings",
      show: canAccessDoctorSettings(user),
    },
    {
      href: "/admin/briefs",
      label: "Patient Briefs",
      show: canAccessPatientBriefs(user),
    },
    {
      href: "/admin/audit",
      label: "Audit Logs",
      show: canAccessAuditLogs(user),
    },
  ].filter(item => item.show);

  return (
    <nav className="bg-white shadow border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-semibold text-gray-900">AI Concierge MVP</h1>
            <div className="hidden md:flex space-x-8">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`${
                    currentPath === item.href
                      ? "border-blue-500 text-gray-900"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Logged in as:</span>
              <span className="text-sm font-medium text-gray-900">{user.email}</span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                user.role === 'doctor' ? 'bg-blue-100 text-blue-800' :
                user.role === 'auditor' ? 'bg-green-100 text-green-800' :
                user.role === 'reviewer' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {user.role}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className="md:hidden">
        <div className="pt-2 pb-3 space-y-1 sm:px-3">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`${
                currentPath === item.href
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-300"
              } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
