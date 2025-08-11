"use client";

import { useState, useEffect } from "react";
import { type User } from "@/db";
import { hasRole } from "@/lib/auth";

interface AuditLog {
  id: string;
  patientName: string;
  actionType: string;
  deliveryStatus: string;
  createdAt: string;
  updatedAt: string;
  user: {
    username: string;
    role: string;
    email: string;
  };
  retryCount: number;
  tokensConsumed?: number;
  contentHash?: string;
  ipAddress?: string;
  reviewerId?: string;
  reviewNotes?: string;
}

interface EnhancedAuditLogPageProps {
  user: User;
}

export function EnhancedAuditLogPage({ user }: EnhancedAuditLogPageProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState({
    dateRange: "7",
    actionType: "",
    deliveryStatus: "",
    patientName: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);

  const canExport = hasRole(user, 'auditor');
  const canViewAll = hasRole(user, 'auditor');

  useEffect(() => {
    loadAuditLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, auditLogs]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/audit-logs');
      const result = await response.json() as { success: boolean; logs?: any[]; error?: string };
      
      if (result.success) {
        setAuditLogs(result.logs || []);
      } else {
        setError(result.error || 'Failed to load audit logs');
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
      setError('Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...auditLogs];

    // Date range filter
    if (filters.dateRange && filters.dateRange !== "all") {
      const days = parseInt(filters.dateRange);
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(log => new Date(log.createdAt) >= cutoffDate);
    }

    // Action type filter
    if (filters.actionType) {
      filtered = filtered.filter(log => log.actionType === filters.actionType);
    }

    // Delivery status filter
    if (filters.deliveryStatus) {
      filtered = filtered.filter(log => log.deliveryStatus === filters.deliveryStatus);
    }

    // Patient name filter
    if (filters.patientName) {
      filtered = filtered.filter(log => 
        log.patientName.toLowerCase().includes(filters.patientName.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  };

  const handleExport = async (format: 'csv' | 'json' | 'pdf', options: any = {}) => {
    if (!canExport) return;

    setIsExporting(true);
    try {
      const exportFilters = {
        ...filters,
        logIds: selectedLogs.length > 0 ? selectedLogs : undefined
      };

      const response = await fetch('/api/audit-export/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          filters: exportFilters,
          includeContent: options.includeContent || false,
          includeEditHistory: options.includeEditHistory || false,
          includeMetadata: options.includeMetadata || false
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || `audit_export.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        setShowExportModal(false);
        setSelectedLogs([]);
      } else {
        setError('Failed to export audit logs');
      }
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export audit logs');
    } finally {
      setIsExporting(false);
    }
  };

  const generateComplianceReport = async () => {
    if (!canExport) return;

    setIsExporting(true);
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

      const response = await fetch('/api/audit-export/compliance-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRange: { start: startDate, end: endDate }
        })
      });

      const result = await response.json() as { success: boolean; report?: any; error?: string };
      
      if (result.success) {
        // Display compliance report in a modal or new page
        console.log('Compliance report:', result.report);
        // For now, just alert - in production you'd show a modal or navigate to a report page
        alert('Compliance report generated successfully. Check console for details.');
      } else {
        setError(result.error || 'Failed to generate compliance report');
      }
    } catch (err) {
      console.error('Compliance report error:', err);
      setError('Failed to generate compliance report');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleLogSelection = (logId: string) => {
    setSelectedLogs(prev => 
      prev.includes(logId) 
        ? prev.filter(id => id !== logId)
        : [...prev, logId]
    );
  };

  const selectAllLogs = () => {
    setSelectedLogs(filteredLogs.map(log => log.id));
  };

  const clearSelection = () => {
    setSelectedLogs([]);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'rejected': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getActionTypeDisplay = (actionType: string) => {
    return actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Calculate statistics
  const stats = {
    total: filteredLogs.length,
    delivered: filteredLogs.filter(log => log.deliveryStatus === 'delivered').length,
    pending: filteredLogs.filter(log => log.deliveryStatus === 'pending').length,
    failed: filteredLogs.filter(log => log.deliveryStatus === 'failed').length,
    successRate: filteredLogs.length > 0 
      ? Math.round((filteredLogs.filter(log => log.deliveryStatus === 'delivered').length / filteredLogs.length) * 100) 
      : 0
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading audit logs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="border-b border-gray-200 pb-5 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold leading-6 text-gray-900">
                  Enhanced Audit Log & Compliance
                </h1>
                <p className="mt-2 max-w-4xl text-sm text-gray-500">
                  Comprehensive audit trail with export and compliance reporting capabilities.
                  Current user: {user.email} ({user.role})
                </p>
              </div>
              
              {canExport && (
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                  >
                    Export Data
                  </button>
                  <button
                    onClick={generateComplianceReport}
                    disabled={isExporting}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm disabled:opacity-50"
                  >
                    {isExporting ? 'Generating...' : 'Compliance Report'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-3">
              <div className="text-sm text-red-600">{error}</div>
            </div>
          )}

          {/* Filters */}
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Filters & Search
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date Range</label>
                  <select
                    value={filters.dateRange}
                    onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="all">All time</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Action Type</label>
                  <select
                    value={filters.actionType}
                    onChange={(e) => setFilters(prev => ({ ...prev, actionType: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">All actions</option>
                    <option value="draft_generated">Draft Generated</option>
                    <option value="draft_edited">Draft Edited</option>
                    <option value="submitted_for_review">Submitted for Review</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="sent">Sent</option>
                    <option value="delivery_confirmed">Delivery Confirmed</option>
                    <option value="delivery_failed">Delivery Failed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <select
                    value={filters.deliveryStatus}
                    onChange={(e) => setFilters(prev => ({ ...prev, deliveryStatus: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Patient Name</label>
                  <input
                    type="text"
                    value={filters.patientName}
                    onChange={(e) => setFilters(prev => ({ ...prev, patientName: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Search patient..."
                  />
                </div>

                <div>
                  <button
                    onClick={loadAuditLogs}
                    className="mt-6 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {/* Selection Controls */}
              {canExport && filteredLogs.length > 0 && (
                <div className="mt-4 flex items-center space-x-4 text-sm">
                  <span className="text-gray-600">{selectedLogs.length} selected</span>
                  <button
                    onClick={selectAllLogs}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    Clear Selection
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4 mb-6">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-medium">{stats.total}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total Records</dt>
                      <dd className="text-lg font-medium text-gray-900">Filtered</dd>
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
                      <span className="text-white text-xs font-medium">{stats.delivered}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Delivered</dt>
                      <dd className="text-lg font-medium text-gray-900">Messages</dd>
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
                      <span className="text-white text-xs font-medium">{stats.pending}</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                      <dd className="text-lg font-medium text-gray-900">Review</dd>
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
                      <span className="text-white text-xs font-medium">{stats.successRate}%</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                      <dd className="text-lg font-medium text-gray-900">Delivery</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Audit Log Entries
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Showing {filteredLogs.length} of {auditLogs.length} total entries
              </p>
            </div>
            
            {filteredLogs.length === 0 ? (
              <div className="p-6 text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Audit Logs Found</h3>
                <p className="text-gray-500">
                  No audit logs match your current filter criteria.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {canExport && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={selectedLogs.length === filteredLogs.length}
                            onChange={() => selectedLogs.length === filteredLogs.length ? clearSelection() : selectAllLogs()}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Metadata
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredLogs.map((log) => (
                      <tr key={log.id} className={selectedLogs.includes(log.id) ? 'bg-blue-50' : ''}>
                        {canExport && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedLogs.includes(log.id)}
                              onChange={() => toggleLogSelection(log.id)}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <div>{formatDate(log.createdAt)}</div>
                            {log.updatedAt !== log.createdAt && (
                              <div className="text-xs text-gray-500">
                                Updated: {formatDate(log.updatedAt)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.patientName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getActionTypeDisplay(log.actionType)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(log.deliveryStatus)}`}>
                            {log.deliveryStatus}
                          </span>
                          {log.retryCount > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              Retries: {log.retryCount}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <div>{log.user.username}</div>
                            <div className="text-xs text-gray-500">{log.user.role}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="space-y-1">
                            {log.tokensConsumed && (
                              <div className="text-xs">Tokens: {log.tokensConsumed}</div>
                            )}
                            {log.contentHash && (
                              <div className="text-xs">Hash: {log.contentHash.substring(0, 8)}...</div>
                            )}
                            {log.ipAddress && (
                              <div className="text-xs">IP: {log.ipAddress}</div>
                            )}
                            {log.reviewerId && (
                              <div className="text-xs">Reviewer: {log.reviewerId}</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Export Modal */}
          {showExportModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Export Audit Logs</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Export Format
                      </label>
                      <div className="space-y-2">
                        <button
                          onClick={() => handleExport('csv')}
                          disabled={isExporting}
                          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          CSV (Spreadsheet)
                        </button>
                        <button
                          onClick={() => handleExport('json')}
                          disabled={isExporting}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          JSON (Data)
                        </button>
                        <button
                          onClick={() => handleExport('pdf')}
                          disabled={isExporting}
                          className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm"
                        >
                          PDF (Report)
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600">
                      {selectedLogs.length > 0 
                        ? `Exporting ${selectedLogs.length} selected records` 
                        : `Exporting ${filteredLogs.length} filtered records`
                      }
                    </div>

                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => setShowExportModal(false)}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
