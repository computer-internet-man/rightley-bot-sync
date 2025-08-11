"use client";

import { useState, useEffect } from "react";
import { type User } from "@/db";
import { canSendMessages } from "@/lib/server-functions";

interface MessageFinalizationPanelProps {
  user: User;
  auditLogId: string;
  initialMessage: string;
  patientName: string;
  onWorkflowComplete: (result: { success: boolean; message: string; nextStep?: string }) => void;
}

interface RecipientInfo {
  email?: string;
  phone?: string;
  deliveryMethod: 'email' | 'sms' | 'portal';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  scheduledFor?: Date;
}

export function MessageFinalizationPanel({ 
  user, 
  auditLogId, 
  initialMessage, 
  patientName,
  onWorkflowComplete 
}: MessageFinalizationPanelProps) {
  const [finalMessage, setFinalMessage] = useState(initialMessage);
  const [recipientInfo, setRecipientInfo] = useState<RecipientInfo>({
    deliveryMethod: 'email',
    priority: 'normal'
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);

  const canUserSendDirectly = canSendMessages(user);

  useEffect(() => {
    const words = finalMessage.trim().split(/\s+/).length;
    setWordCount(words);
    setHasChanges(finalMessage !== initialMessage);
  }, [finalMessage, initialMessage]);

  const handleSubmitForReview = async () => {
    if (!finalMessage.trim()) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/message-workflow/submit-for-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditLogId,
          finalMessage,
          recipientEmail: recipientInfo.email,
          recipientPhone: recipientInfo.phone,
          deliveryMethod: recipientInfo.deliveryMethod,
          priority: recipientInfo.priority,
          scheduledFor: recipientInfo.scheduledFor
        })
      });

      const result = await response.json() as { success: boolean; error?: string };
      
      if (result.success) {
        onWorkflowComplete({
          success: true,
          message: "Message submitted for review successfully",
          nextStep: "pending_review"
        });
      } else {
        onWorkflowComplete({
          success: false,
          message: result.error || "Failed to submit message for review"
        });
      }
    } catch (error) {
      console.error('Error submitting for review:', error);
      onWorkflowComplete({
        success: false,
        message: "Failed to submit message for review"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendDirectly = async () => {
    if (!finalMessage.trim() || !recipientInfo.email) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/message-workflow/send-directly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auditLogId,
          finalMessage,
          recipientEmail: recipientInfo.email,
          recipientPhone: recipientInfo.phone,
          deliveryMethod: recipientInfo.deliveryMethod,
          priority: recipientInfo.priority,
          scheduledFor: recipientInfo.scheduledFor
        })
      });

      const result = await response.json() as { success: boolean; error?: string };
      
      if (result.success) {
        onWorkflowComplete({
          success: true,
          message: "Message sent successfully and queued for delivery",
          nextStep: "sent"
        });
      } else {
        onWorkflowComplete({
          success: false,
          message: result.error || "Failed to send message"
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      onWorkflowComplete({
        success: false,
        message: "Failed to send message"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isReadyToProcess = finalMessage.trim() && 
    (canUserSendDirectly ? recipientInfo.email : true);

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Finalize Message for {patientName}
        </h3>

        {/* Message Editor */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Final Message
            </label>
            <textarea
              rows={8}
              value={finalMessage}
              onChange={(e) => setFinalMessage(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Edit the final message before sending..."
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>{wordCount} words</span>
              {hasChanges && <span className="text-amber-600">• Modified from original</span>}
            </div>
          </div>

          {/* Recipient Information */}
          {(showRecipientForm || canUserSendDirectly) && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Delivery Information</h4>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email Address {canUserSendDirectly && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="email"
                    value={recipientInfo.email || ''}
                    onChange={(e) => setRecipientInfo(prev => ({ ...prev, email: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="patient@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={recipientInfo.phone || ''}
                    onChange={(e) => setRecipientInfo(prev => ({ ...prev, phone: e.target.value }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Delivery Method
                  </label>
                  <select
                    value={recipientInfo.deliveryMethod}
                    onChange={(e) => setRecipientInfo(prev => ({ 
                      ...prev, 
                      deliveryMethod: e.target.value as 'email' | 'sms' | 'portal' 
                    }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="portal">Patient Portal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Priority
                  </label>
                  <select
                    value={recipientInfo.priority}
                    onChange={(e) => setRecipientInfo(prev => ({ 
                      ...prev, 
                      priority: e.target.value as 'low' | 'normal' | 'high' | 'urgent' 
                    }))}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="border-t pt-4">
            <div className="flex space-x-3">
              {!canUserSendDirectly && (
                <button
                  onClick={() => {
                    if (!showRecipientForm) {
                      setShowRecipientForm(true);
                    } else {
                      handleSubmitForReview();
                    }
                  }}
                  disabled={isProcessing || !finalMessage.trim()}
                  className="flex-1 bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Submitting...
                    </span>
                  ) : showRecipientForm ? (
                    "Submit for Review"
                  ) : (
                    "Prepare for Review"
                  )}
                </button>
              )}

              {canUserSendDirectly && (
                <button
                  onClick={() => {
                    if (!showRecipientForm) {
                      setShowRecipientForm(true);
                    } else {
                      handleSendDirectly();
                    }
                  }}
                  disabled={isProcessing || !isReadyToProcess}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Sending...
                    </span>
                  ) : showRecipientForm ? (
                    "Send Message"
                  ) : (
                    "Send Directly"
                  )}
                </button>
              )}

              {showRecipientForm && (
                <button
                  onClick={() => setShowRecipientForm(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Workflow Information */}
            <div className="mt-3 text-xs text-gray-500">
              {canUserSendDirectly ? (
                <p>
                  <span className="font-medium">Direct Send:</span> Your role allows sending messages directly to patients.
                </p>
              ) : (
                <p>
                  <span className="font-medium">Review Workflow:</span> Messages will be submitted to reviewers for approval before delivery.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
