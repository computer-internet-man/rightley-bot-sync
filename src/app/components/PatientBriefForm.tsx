"use client";

import { useState, useEffect } from "react";
import { createPatientBrief, updatePatientBrief, getAvailableDoctors } from "@/lib/patientBriefActions";
import { type User } from "@/db";

interface PatientBriefFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (brief: any) => void;
  user: User;
  editingBrief?: any;
}

export function PatientBriefForm({ isOpen, onClose, onSubmit, user, editingBrief }: PatientBriefFormProps) {
  const [formData, setFormData] = useState({
    patientName: "",
    briefText: "",
    medicalHistory: "",
    currentMedications: "",
    allergies: "",
    doctorNotes: "",
    doctorId: user.id,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);

  useEffect(() => {
    if (editingBrief) {
      setFormData({
        patientName: editingBrief.patientName || "",
        briefText: editingBrief.briefText || "",
        medicalHistory: editingBrief.medicalHistory || "",
        currentMedications: editingBrief.currentMedications || "",
        allergies: editingBrief.allergies || "",
        doctorNotes: editingBrief.doctorNotes || "",
        doctorId: editingBrief.doctorId || user.id,
      });
    } else {
      setFormData({
        patientName: "",
        briefText: "",
        medicalHistory: "",
        currentMedications: "",
        allergies: "",
        doctorNotes: "",
        doctorId: user.id,
      });
    }
  }, [editingBrief, user.id]);

  useEffect(() => {
    if (isOpen && user.role === "admin") {
      // Fetch available doctors for admin users
      getAvailableDoctors().then((result) => {
        if (result.success) {
          setAvailableDoctors(result.doctors);
        }
      });
    }
  }, [isOpen, user.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let result;
      if (editingBrief) {
        result = await updatePatientBrief(user, editingBrief.id, formData);
      } else {
        result = await createPatientBrief(user, formData);
      }

      if (result.error) {
        setError(result.error);
      } else {
        onSubmit(result.brief);
        onClose();
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {editingBrief ? "Edit Patient Brief" : "Create New Patient Brief"}
          </h3>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="text-sm text-red-600">{error}</div>
            </div>
          )}

          <div>
            <label htmlFor="patientName" className="block text-sm font-medium text-gray-700">
              Patient Name *
            </label>
            <input
              type="text"
              id="patientName"
              name="patientName"
              required
              value={formData.patientName}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {user.role === "admin" && (
            <div>
              <label htmlFor="doctorId" className="block text-sm font-medium text-gray-700">
                Assigned Doctor *
              </label>
              <select
                id="doctorId"
                name="doctorId"
                required
                value={formData.doctorId}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.email} ({doctor.username})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="briefText" className="block text-sm font-medium text-gray-700">
              Brief Text *
            </label>
            <textarea
              id="briefText"
              name="briefText"
              required
              rows={3}
              value={formData.briefText}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="medicalHistory" className="block text-sm font-medium text-gray-700">
              Medical History
            </label>
            <textarea
              id="medicalHistory"
              name="medicalHistory"
              rows={3}
              value={formData.medicalHistory}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="currentMedications" className="block text-sm font-medium text-gray-700">
              Current Medications
            </label>
            <textarea
              id="currentMedications"
              name="currentMedications"
              rows={2}
              value={formData.currentMedications}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="allergies" className="block text-sm font-medium text-gray-700">
              Allergies
            </label>
            <textarea
              id="allergies"
              name="allergies"
              rows={2}
              value={formData.allergies}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="doctorNotes" className="block text-sm font-medium text-gray-700">
              Doctor Notes
            </label>
            <textarea
              id="doctorNotes"
              name="doctorNotes"
              rows={3}
              value={formData.doctorNotes}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                loading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {loading ? "Saving..." : editingBrief ? "Update Brief" : "Create Brief"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
