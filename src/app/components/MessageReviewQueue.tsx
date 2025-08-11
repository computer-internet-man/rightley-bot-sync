"use client";

import { useState, useEffect } from "react";
import { type User } from "@/db";
import { hasRole } from "@/lib/auth";

interface PendingMessage {
  id: string;
  patientName: string;
  finalMessage: string;
  generatedDraft: string;
  requestText: string;
  createdAt: string;
  user: {
    username: string;
    role: string;
  };
  messageQueue?: {
    deliveryMethod: string;
    priority: string;
    recipientEmail?: string;
  };
}

interface MessageReviewQueueProps {
  user: User;
}

export function MessageReviewQueue({ user }: MessageReviewQueueProps) {
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<PendingMessage | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editedMessage, setEditedMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canReview = hasRole(user, 'reviewer');

  useEffect(() => {
    if (canReview) {
      loadPendingMessages();
    }
  }, [canReview]);

  useEffect(() => {
    if (selectedMessage) {
      setEditedMessage(selectedMessage.finalMessage);
      setReviewNotes("");
    }
  }, [selectedMessage]);

  const loadPendingMessages = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/message-workflow/pending-review');
      const result = await response.json() as { success: boolean; messages?: any[]; error?: string };
      
      if (result.success) {
        setPendingMessages(result.messages || []);
      } else {
        setError(result.error || 'Failed to load pending messages');
      }
    } catch (err) {
      console.error('Error loading pending messages:', err);
      setError('Failed to load pending messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewAction = async (action: 'approve' | 'reject') => {
    if (!selectedMessage) return;

    setIsProcessing(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch('/api/message-workflow/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditLogId: selectedMessage.id,
          action,
          reviewNotes: reviewNotes.trim() || undefined,
          finalMessage: editedMessage !== selectedMessage.finalMessage ? editedMessage : undefined
        })
      });

      const result = await response.json() as { success: boolean; error?: string };
      
      if (result.success) {
        setSuccess(`Message ${action}d successfully`);
        
        // Remove from pending list
        setPendingMessages(prev => prev.filter(msg => msg.id !== selectedMessage.id));
        setSelectedMessage(null);
        setReviewNotes("");
        setEditedMessage("");
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(result.error || `Failed to ${action} message`);
      }
    } catch (err) {
      console.error(`Error ${action}ing message:`, err);
      setError(`Failed to ${action} message`);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'normal': return 'text-blue-600 bg-blue-100';
      case 'low': return 'text-gray-600 bg-gray-100';
      default: return 'text-blue-600 bg-blue-100';
    }
  };

  if (!canReview) {
    return (
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6 text-center">
          <div className="text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="mt-2">You don't have permission to review messages</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">Loading pending messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg leading-6 font-medium text-gray-900">
              Message Review Queue
            </h2>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {pendingMessages.length} message{pendingMessages.length !== 1 ? 's' : ''} pending
              </span>
              <button
                onClick={loadPendingMessages}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
              <div className="text-sm text-red-600">{error}</div>
            </div>
          )}

          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-md p-3">
              <div className="text-sm text-green-600">{success}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message List */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Pending Messages</h3>
            
            {pendingMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m14 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m14 0H6m0 0l3-3m-3 3l3 3m8-6l-3-3m3 3l-3 3" />
                </svg>
                <p className="mt-2">No messages pending review</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingMessages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => setSelectedMessage(message)}
                    className={`cursor-pointer border rounded-lg p-3 transition-colors ${
                      selectedMessage?.id === message.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {message.patientName}
                          </h4>
                          {message.messageQueue?.priority && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(message.messageQueue.priority)}`}>
                              {message.messageQueue.priority.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          From: {message.user.username} ({message.user.role})
                        </p>
                        <p className="text-xs text-gray-500">
                          Submitted: {formatDate(message.createdAt)}
                        </p>
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                          {message.finalMessage.substring(0, 100)}...
                        </p>
                      </div>
                      <div className="text-xs text-gray-400 ml-2">
                        {message.messageQueue?.deliveryMethod?.toUpperCase() || 'EMAIL'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message Review Panel */}
        {selectedMessage ? (
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">
                Review Message for {selectedMessage.patientName}
              </h3>

              <div className="space-y-4">
                {/* Original Request */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide">
                    Original Patient Inquiry
                  </label>
                  <div className="mt-1 p-3 bg-gray-50 rounded border text-sm text-gray-700">
                    {selectedMessage.requestText}
                  </div>
                </div>

                {/* AI Generated Draft */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide">
                    AI Generated Draft
                  </label>
                  <div className="mt-1 p-3 bg-blue-50 rounded border text-sm text-gray-700">
                    {selectedMessage.generatedDraft}
                  </div>
                </div>

                {/* Final Message for Review */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide">
                    Final Message (Editable)
                  </label>
                  <textarea
                    rows={6}
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  {editedMessage !== selectedMessage.finalMessage && (
                    <p className="mt-1 text-xs text-amber-600">
                      * Message has been modified from staff submission
                    </p>
                  )}
                </div>

                {/* Review Notes */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide">
                    Review Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="Add notes about your review decision..."
                  />
                </div>

                {/* Delivery Info */}
                {selectedMessage.messageQueue && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                      Delivery Information
                    </h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><span className="font-medium">Method:</span> {selectedMessage.messageQueue.deliveryMethod}</p>
                      <p><span className="font-medium">Priority:</span> {selectedMessage.messageQueue.priority}</p>
                      {selectedMessage.messageQueue.recipientEmail && (
                        <p><span className="font-medium">Email:</span> {selectedMessage.messageQueue.recipientEmail}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex space-x-3 pt-4 border-t">
                  <button
                    onClick={() => handleReviewAction('approve')}
                    disabled={isProcessing || !editedMessage.trim()}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isProcessing ? (
                      <span className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </span>
                    ) : (
                      "Approve & Send"
                    )}
                  </button>
                  
                  <button
                    onClick={() => handleReviewAction('reject')}
                    disabled={isProcessing}
                    className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isProcessing ? (
                      <span className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </span>
                    ) : (
                      "Reject"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6 text-center">
              <div className="text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4z" />
                </svg>
                <p className="mt-2">Select a message to review</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
