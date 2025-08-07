"use client";

import { useState, useEffect } from "react";
import { type User } from "@/db";

interface Patient {
  id: string;
  name: string;
  condition: string;
  lastContact: Date;
  status: string;
}

interface PatientSelectionPanelProps {
  user: User;
  selectedPatient: Patient | null;
  onPatientSelect: (patient: Patient) => void;
  initialPatients: Patient[];
}

export function PatientSelectionPanel({ user, selectedPatient, onPatientSelect, initialPatients }: PatientSelectionPanelProps) {
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>(initialPatients);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [selectedForDetails, setSelectedForDetails] = useState<Patient | null>(null);

  useEffect(() => {
    // Update patients when initialPatients changes
    setPatients(initialPatients);
    setFilteredPatients(initialPatients);
  }, [initialPatients]);

  useEffect(() => {
    // Filter patients based on search query
    if (searchQuery) {
      const filtered = patients.filter(patient =>
        patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        patient.condition.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredPatients(filtered);
    } else {
      setFilteredPatients(patients);
    }
  }, [searchQuery, patients]);

  const handlePatientClick = (patient: Patient) => {
    onPatientSelect(patient);
  };

  const handleViewDetails = (patient: Patient, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForDetails(patient);
    setShowPatientModal(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending_review':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Select Patient
            </h3>
            <span className="text-sm text-gray-500">
              {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Search Box */}
          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patients by name or condition..."
                className="block w-full pr-10 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Patient List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredPatients.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                {searchQuery ? "No patients found matching your search" : "No assigned patients found"}
              </div>
            ) : (
              filteredPatients.map((patient) => (
                <div
                  key={patient.id}
                  onClick={() => handlePatientClick(patient)}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors duration-150 ${
                    selectedPatient?.id === patient.id
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500'
                      : 'hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{patient.name}</div>
                      <div className="text-sm text-gray-500 mt-1">{patient.condition}</div>
                      <div className="flex items-center mt-2 text-xs text-gray-400">
                        <span>Last contact: {patient.lastContact.toLocaleString()}</span>
                        <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(patient.status)}`}>
                          {patient.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleViewDetails(patient, e)}
                      className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Actions */}
          {selectedPatient && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-blue-900">
                    Selected: {selectedPatient.name}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    {selectedPatient.condition}
                  </div>
                </div>
                <button
                  onClick={() => onPatientSelect(null as any)}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Patient Details Modal */}
      {showPatientModal && selectedForDetails && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Patient Details
              </h3>
              <button
                onClick={() => setShowPatientModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <p className="text-gray-900">{selectedForDetails.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Condition</label>
                  <p className="text-gray-900">{selectedForDetails.condition}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedForDetails.status)}`}>
                    {selectedForDetails.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Last Contact</label>
                  <p className="text-gray-900">{selectedForDetails.lastContact.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowPatientModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handlePatientClick(selectedForDetails);
                  setShowPatientModal(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Select Patient
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
