import React from 'react';
import { AppContext } from '@/worker';
import { Navigation } from '@/app/components/Navigation';
import { DraftWorkflowPageClient } from '@/app/components/DraftWorkflowPageClient';
import { getAssignedPatients } from '@/lib/server-functions';

interface DraftWorkflowPageProps {
  ctx: AppContext;
}

export default async function DraftWorkflowPage({ ctx }: DraftWorkflowPageProps) {
  const { user } = ctx;
  
  if (!user) {
    return <div>Access denied</div>;
  }
  
  // Fetch assigned patients for the current user
  const assignedPatients = await getAssignedPatients(user);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation ctx={ctx} currentPath="/draft" />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <DraftWorkflowPageClient 
            user={user} 
            initialPatients={assignedPatients} 
          />
        </div>
      </div>
    </div>
  );
}
