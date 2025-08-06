"use client";

import { useState, useEffect } from "react";
import { PatientSelectionPanel } from "./PatientSelectionPanel";
import { DraftMessagePanel } from "./DraftMessagePanel";
import { MessageFinalizationPanel } from "./MessageFinalizationPanel";
import { getAssignedPatients, canSendMessages } from "@/lib/server-functions";
import { type User } from "@/db";

interface Patient {
  id: string;
  name: string;
  condition: string;
  lastContact: Date;
  status: string;
}

interface DraftWorkflowPageClientProps {
  user: User;
  initialPatients: Patient[];
}

export function DraftWorkflowPageClient({ user, initialPatients }: DraftWorkflowPageClientProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [pendingDraft, setPendingDraft] = useState<{
    auditLogId: string;
    finalMessage: string;
    patientName: string;
  } | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<{
    success: boolean;
    message: string;
    nextStep?: string;
  } | null>(null);

  const canUserSendMessages = canSendMessages(user);

  useEffect(() => {
    // Generate mock recent activity based on patients
    if (initialPatients.length > 0) {
      const activity = initialPatients.slice(0, 3).map((patient, index) => ({
        id: `activity-${index}`,
        type: index === 0 ? "medication_refill" : index === 1 ? "symptom_followup" : "education_request",
        patientName: patient.name,
        status: patient.status,
        timestamp: new Date(Date.now() - (index + 1) * 3600000), // Hours ago
        description: index === 0 
          ? `Medication refill response - ${patient.name}`
          : index === 1 
          ? `Symptom follow-up - ${patient.name}`
          : `Education request - ${patient.name}`,
      }));
      setRecentActivity(activity);
    }

    // Listen for draft creation events
    const handleDraftCreated = (event: CustomEvent) => {
      setPendingDraft(event.detail);
      setWorkflowStatus(null);
    };

    const handleWorkflowComplete = (event: CustomEvent) => {
      setWorkflowStatus(event.detail);
      if (event.detail.success) {
        setPendingDraft(null);
      }
    };

    window.addEventListener('draftCreated', handleDraftCreated as EventListener);
    window.addEventListener('workflowComplete', handleWorkflowComplete as EventListener);

    return () => {
      window.removeEventListener('draftCreated', handleDraftCreated as EventListener);
      window.removeEventListener('workflowComplete', handleWorkflowComplete as EventListener);
    };
  }, [initialPatients]);

  const handlePatientSelect = (patient: Patient | null) => {
    setSelectedPatient(patient);
    // Clear any pending drafts when switching patients
    setPendingDraft(null);
    setWorkflowStatus(null);
  };

  const handleWorkflowComplete = (result: { success: boolean; message: string; nextStep?: string }) => {
    setWorkflowStatus(result);
    if (result.success) {
      setPendingDraft(null);
    }
    
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('workflowComplete', { detail: result }));
  };

  const getRoleInformation = () => {
    switch (user.role) {
      case 'staff':
        return "As a staff member, you can create draft messages but need approval before sending.";
      case 'reviewer':
        return "As a reviewer, you can create drafts and send messages directly without additional approval.";
      case 'doctor':
        return "As a doctor, you have full access to create, edit, and send messages for your patients.";
      case 'admin':
        return "As an admin, you have full access to all message workflow features.";
      default:
        return "Contact your administrator for access permissions.";
    }
  };

  const getActivityStatus = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Sent', color: 'bg-green-100 text-green-800' };
      case 'pending_review':
        return { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800' };
      default:
        return { label: 'Draft', color: 'bg-gray-100 text-gray-800' };
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-gray-200 pb-5">
        <h1 className="text-3xl font-bold leading-6 text-gray-900">
          Message Draft Workflow
        </h1>
        <p className="mt-2 max-w-4xl text-sm text-gray-500">
          Create and review patient communication messages using AI assistance.
          Current user: {user?.email} ({user?.role})
        </p>
      </div>

      {/* Workflow Status */}
      {workflowStatus && (
        <div className={`border rounded-lg p-4 ${
          workflowStatus.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {workflowStatus.success ? (
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${
                workflowStatus.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {workflowStatus.message}
              </p>
              {workflowStatus.nextStep && (
                <p className={`text-xs mt-1 ${
                  workflowStatus.success ? 'text-green-600' : 'text-red-600'
                }`}>
                  Next: {workflowStatus.nextStep.replace(/_/g, ' ').toUpperCase()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Patient Selection Panel */}
        <PatientSelectionPanel
          user={user}
          selectedPatient={selectedPatient}
          onPatientSelect={handlePatientSelect}
        />

        {/* Message Draft Panel */}
        <DraftMessagePanel
          user={user}
          selectedPatient={selectedPatient}
        />
      </div>

      {/* Message Finalization Panel */}
      {pendingDraft && (
        <div className="space-y-6">
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Finalize Message
            </h2>
            <MessageFinalizationPanel
              user={user}
              auditLogId={pendingDraft.auditLogId}
              initialMessage={pendingDraft.finalMessage}
              patientName={pendingDraft.patientName}
              onWorkflowComplete={handleWorkflowComplete}
            />
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity) => {
                const statusInfo = getActivityStatus(activity.status);
                return (
                  <div key={activity.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                    <div>
                      <div className="font-medium text-gray-900">
                        {activity.description}
                      </div>
                      <div className="text-sm text-gray-500">
                        Generated {Math.floor((Date.now() - activity.timestamp.getTime()) / (1000 * 60 * 60))} hours ago
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-4 text-gray-500">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Workflow Statistics */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">{initialPatients.length}</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Assigned Patients
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Total
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {initialPatients.filter(p => p.status === 'active').length}
                  </span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Active Patients
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Ready
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {initialPatients.filter(p => p.status === 'pending_review').length}
                  </span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Pending Review
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Waiting
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">{recentActivity.length}</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Recent Drafts
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Today
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Role-specific Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Role Information
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>{getRoleInformation()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
