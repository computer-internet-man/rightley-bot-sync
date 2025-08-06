import React from 'react';
import { AppContext } from '@/worker';
import { Navigation } from '@/app/components/Navigation';
import { PatientBriefsPageClient } from '@/app/components/PatientBriefsPageClient';
import { getPatientBriefs } from '@/lib/server-functions';

interface PatientBriefsPageProps {
  ctx: AppContext;
}

export default async function PatientBriefsPage({ ctx }: PatientBriefsPageProps) {
  const { user } = ctx;
  
  if (!user) {
    return <div>Access denied</div>;
  }

  // Fetch patient briefs based on user role
  const patientBriefs = await getPatientBriefs(user);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation ctx={ctx} currentPath="/admin/briefs" />
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <PatientBriefsPageClient 
            user={user} 
            initialBriefs={patientBriefs} 
          />
        </div>
      </div>
    </div>
  );
}
