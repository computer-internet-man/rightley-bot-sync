"use client";

import { useState, useEffect } from "react";
import { PatientBriefForm } from "./PatientBriefForm";
import { PatientBriefSearch } from "./PatientBriefSearch";
import { PatientBriefList } from "./PatientBriefList";
import { getPatientBriefs } from "@/lib/server-functions";
import { type User } from "@/db";

interface PatientBriefsPageClientProps {
  user: User;
  initialBriefs: any[];
}

export function PatientBriefsPageClient({ user, initialBriefs }: PatientBriefsPageClientProps) {
  const [briefs, setBriefs] = useState(initialBriefs);
  const [filteredBriefs, setFilteredBriefs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingBrief, setEditingBrief] = useState<any>(null);
  const [sortField, setSortField] = useState("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Track if user has performed a search
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    // Only show briefs after user has performed a search
    // Don't auto-populate on initial load
    if (hasSearched && filteredBriefs.length === 0 && briefs.length > 0) {
      setFilteredBriefs(briefs);
    }
  }, [briefs, filteredBriefs.length, hasSearched]);

  const handleFormSubmit = (brief: any) => {
    if (editingBrief) {
      // Update existing brief
      setBriefs(prev => prev.map(b => b.id === brief.id ? brief : b));
      setFilteredBriefs(prev => prev.map(b => b.id === brief.id ? brief : b));
    } else {
      // Add new brief
      setBriefs(prev => [brief, ...prev]);
      setFilteredBriefs(prev => [brief, ...prev]);
    }
    setEditingBrief(null);
  };

  const handleEdit = (brief: any) => {
    setEditingBrief(brief);
    setShowForm(true);
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const updatedBriefs = await getPatientBriefs(user);
      setBriefs(updatedBriefs);
      setFilteredBriefs(updatedBriefs);
    } catch (err) {
      setError("Failed to refresh patient briefs");
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleSearchResults = (results: any[]) => {
    setHasSearched(true);
    setFilteredBriefs(results);
  };

  const handleSearchError = (errorMessage: string) => {
    setHasSearched(true);
    setError(errorMessage);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBrief(null);
  };

  const displayBriefs = hasSearched ? (filteredBriefs.length > 0 ? filteredBriefs : []) : [];

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.864-.833-2.634 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <div className="mt-3">
                <button
                  onClick={() => setError("")}
                  className="text-sm text-red-600 hover:text-red-500"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header with Create Button */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold leading-6 text-gray-900">
            Patient Brief Management
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-gray-500">
            Manage patient medical briefs and communication context.
            Current user: {user?.email} ({user?.role})
          </p>
        </div>
        
        {(user.role === 'doctor' || user.role === 'admin') && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Add New Brief
          </button>
        )}
      </div>

      {/* Search and Filter */}
      <PatientBriefSearch
        user={user}
        onResults={handleSearchResults}
        onError={handleSearchError}
      />

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          {!hasSearched ? (
            <span className="text-gray-500 italic">Enter a patient name to search for briefs</span>
          ) : filteredBriefs.length > 0 ? (
            <>Showing {filteredBriefs.length} search result{filteredBriefs.length !== 1 ? 's' : ''}</>
          ) : (
            <span className="text-gray-500">No briefs found for your search</span>
          )}
        </div>
        
        {loading && (
          <div className="flex items-center text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            Refreshing...
          </div>
        )}
      </div>

      {/* Patient Brief List */}
      <PatientBriefList
        briefs={displayBriefs}
        user={user}
        onEdit={handleEdit}
        onUpdate={handleUpdate}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">{briefs.length}</span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Total Patients
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Active Briefs
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
                    {briefs.filter(brief => 
                      new Date(brief.updatedAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    ).length}
                  </span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Recent Updates
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    This Week
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
                    {user.role === "doctor" ? briefs.filter(b => b.doctorId === user.id).length : briefs.length}
                  </span>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {user.role === "doctor" ? "My Patients" : "All Briefs"}
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    Assigned
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Patient Brief Form Modal */}
      <PatientBriefForm
        isOpen={showForm}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        user={user}
        editingBrief={editingBrief}
      />
    </div>
  );
}
