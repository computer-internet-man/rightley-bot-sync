"use client";

import { useState, useEffect } from "react";
import { getAvailableDoctors } from "@/lib/patientBriefActions";
import { type User } from "@/db";

interface PatientBriefSearchProps {
  user: User;
  onResults: (briefs: any[]) => void;
  onError: (error: string) => void;
}

export function PatientBriefSearch({ user, onResults, onError }: PatientBriefSearchProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    doctorId: "",
    startDate: "",
    endDate: "",
  });
  const [loading, setLoading] = useState(false);
  const [availableDoctors, setAvailableDoctors] = useState<any[]>([]);

  useEffect(() => {
    if (user.role === "admin") {
      getAvailableDoctors().then((result) => {
        if (result.success) {
          setAvailableDoctors(result.doctors);
        }
      });
    }
  }, [user.role]);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/search-patient-briefs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          filters
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        onResults(result.briefs || []);
      } else {
        onError(result.error || "Search failed");
      }
    } catch (err) {
      console.error("Search error:", err);
      onError("An unexpected error occurred during search");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setFilters({
      doctorId: "",
      startDate: "",
      endDate: "",
    });
    onResults([]);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    // Auto-search when query or filters change (with debounce)
    const timeoutId = setTimeout(() => {
      if (query.trim() || Object.values(filters).some(f => f && f.trim())) {
        handleSearch();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [query, filters]);

  return (
    <div className="bg-white shadow rounded-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Search & Filter</h3>
        <button
          onClick={handleClear}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Clear All
        </button>
      </div>

      <div className="space-y-4">
        {/* Search Query */}
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-700">
            Search Patients
          </label>
          <div className="mt-1 relative">
            <input
              type="text"
              id="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by patient name, brief text, medications, or allergies..."
              className="block w-full pr-10 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              ) : (
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Doctor Filter (Admin only) */}
          {user.role === "admin" && (
            <div>
              <label htmlFor="doctorId" className="block text-sm font-medium text-gray-700">
                Filter by Doctor
              </label>
              <select
                id="doctorId"
                name="doctorId"
                value={filters.doctorId}
                onChange={handleFilterChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Doctors</option>
                {availableDoctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range Filters */}
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
              From Date
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
              To Date
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex space-x-2">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
          
          <button
            onClick={() => setQuery("")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Clear Search
          </button>
        </div>
      </div>
    </div>
  );
}
