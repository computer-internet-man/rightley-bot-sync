"use client";

import { useState, useEffect } from "react";
import { deletePatientBrief, toggleBriefLock, getBriefLockStatus } from "@/lib/patientBriefActions";
import { type User } from "@/db";

// Simplified component without sorting exports

interface PatientBriefListProps {
  briefs: any[];
  user: User;
  onEdit: (brief: any) => void;
  onUpdate: () => void;
  sortField: string;
  sortDirection: "asc" | "desc";
  onSort: (field: string) => void;
}

export function PatientBriefList({ 
  briefs, 
  user, 
  onEdit, 
  onUpdate, 
  sortField, 
  sortDirection, 
  onSort 
}: PatientBriefListProps) {
  const [locks, setLocks] = useState<{ [key: string]: any }>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lockingId, setLockingId] = useState<string | null>(null);

  // Check lock status for all briefs
  useEffect(() => {
    const checkLocks = async () => {
      const lockStatuses: { [key: string]: any } = {};
      await Promise.all(
        briefs.map(async (brief) => {
          const status = await getBriefLockStatus(brief.id);
          lockStatuses[brief.id] = status;
        })
      );
      setLocks(lockStatuses);
    };

    if (briefs.length > 0) {
      checkLocks();
    }
  }, [briefs]);

  const handleDelete = async (briefId: string) => {
    if (!confirm("Are you sure you want to delete this patient brief? This action cannot be undone.")) {
      return;
    }

    setDeletingId(briefId);
    try {
      const result = await deletePatientBrief(user, briefId);
      if (result.error) {
        alert(result.error);
      } else {
        onUpdate();
      }
    } catch (err) {
      alert("Failed to delete patient brief");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleLock = async (briefId: string, currentlyLocked: boolean) => {
    setLockingId(briefId);
    try {
      const action = currentlyLocked ? "unlock" : "lock";
      const result = await toggleBriefLock(user, briefId, action);
      if (result.error) {
        alert(result.error);
      } else {
        setLocks(prev => ({
          ...prev,
          [briefId]: {
            locked: result.locked,
            lockedBy: result.lockedBy,
            lockedAt: new Date(),
          }
        }));
      }
    } catch (err) {
      alert("Failed to toggle lock");
    } finally {
      setLockingId(null);
    }
  };

  const canEdit = (brief: any) => {
    if (user.role === "admin") return true;
    if (user.role === "doctor" && brief.doctorId === user.id) return true;
    return false;
  };

  const canDelete = () => user.role === "admin";

  const isLocked = (briefId: string) => locks[briefId]?.locked || false;
  const lockedBy = (briefId: string) => locks[briefId]?.lockedBy;

  const sortedBriefs = [...briefs].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortField) {
      case "patientName":
        aValue = a.patientName.toLowerCase();
        bValue = b.patientName.toLowerCase();
        break;
      case "doctor":
        aValue = a.doctor?.email?.toLowerCase() || "";
        bValue = b.doctor?.email?.toLowerCase() || "";
        break;
      case "updatedAt":
        aValue = new Date(a.updatedAt || a.createdAt);
        bValue = new Date(b.updatedAt || b.createdAt);
        break;
      default:
        aValue = a[sortField];
        bValue = b[sortField];
    }

    if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
    if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  // Sort functionality removed for deployment compatibility

  if (briefs.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6 text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Patient Briefs Found</h3>
        <p className="text-gray-500">
          {user.role === "doctor" 
            ? "You don't have any patient briefs assigned to you yet."
            : "No patient briefs are available in the system."
          }
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      {/* Table Header */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
          <div className="col-span-3">Patient Name</div>
          <div className="col-span-2">Doctor</div>
          <div className="col-span-2">Last Updated</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Actions</div>
        </div>
      </div>

      {/* Brief List */}
      <ul className="divide-y divide-gray-200">
        {sortedBriefs.map((brief) => {
          const locked = isLocked(brief.id);
          const lockOwner = lockedBy(brief.id);
          const canEditThis = canEdit(brief);
          const isMyLock = lockOwner === user.email;

          return (
            <li key={brief.id} className={`px-6 py-4 ${locked && !isMyLock ? "bg-yellow-50" : ""}`}>
              <div className="grid grid-cols-12 gap-4 items-start">
                <div className="col-span-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    {brief.patientName}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {brief.briefText}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {brief.doctor?.email || brief.doctorName || "External"}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {brief.doctor?.username || brief.doctorUsername || ""}
                  </p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-gray-900">
                    {new Date(brief.updatedAt || brief.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {new Date(brief.updatedAt || brief.createdAt).toLocaleTimeString()}
                  </p>
                </div>

                <div className="col-span-2">
                  {locked ? (
                    <div className="space-y-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Locked
                      </span>
                      <p className="text-xs text-gray-500">
                        by {lockOwner}
                      </p>
                    </div>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Available
                    </span>
                  )}
                </div>

                <div className="col-span-3">
                  <div className="flex space-x-2">
                    {/* View Details Button */}
                    <button 
                      onClick={() => onEdit(brief)}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      View Details
                    </button>

                    {/* Edit Button */}
                    {canEditThis && (
                      <>
                        {locked && !isMyLock ? (
                          <span className="text-gray-400 text-sm">
                            Locked
                          </span>
                        ) : (
                          <button
                            onClick={() => onEdit(brief)}
                            className="text-gray-600 hover:text-gray-900 text-sm"
                          >
                            Edit
                          </button>
                        )}

                        {/* Lock/Unlock Button */}
                        <button
                          onClick={() => handleToggleLock(brief.id, locked)}
                          disabled={lockingId === brief.id || (locked && !isMyLock)}
                          className={`text-sm ${
                            locked && isMyLock
                              ? "text-orange-600 hover:text-orange-900"
                              : "text-purple-600 hover:text-purple-900"
                          } disabled:text-gray-400`}
                        >
                          {lockingId === brief.id
                            ? "..."
                            : locked && isMyLock
                            ? "Unlock"
                            : locked
                            ? "Locked"
                            : "Lock"
                          }
                        </button>
                      </>
                    )}

                    {/* Delete Button (Admin only) */}
                    {canDelete() && (
                      <button
                        onClick={() => handleDelete(brief.id)}
                        disabled={deletingId === brief.id}
                        className="text-red-600 hover:text-red-900 text-sm disabled:text-red-400"
                      >
                        {deletingId === brief.id ? "Deleting..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              <div className="mt-4 bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-900 mb-2">Medical Summary</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Current Medications:</span>
                    <p className="text-gray-600">{brief.currentMedications || "None specified"}</p>
                  </div>
                  <div>
                    <span className="font-medium">Allergies:</span>
                    <p className="text-gray-600">{brief.allergies || "None specified"}</p>
                  </div>
                  <div>
                    <span className="font-medium">Doctor Notes:</span>
                    <p className="text-gray-600">{brief.doctorNotes || "No notes available"}</p>
                  </div>
                </div>
                {brief.medicalHistory && (
                  <div className="mt-3">
                    <span className="font-medium">Medical History:</span>
                    <p className="text-gray-600 mt-1">{brief.medicalHistory}</p>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

