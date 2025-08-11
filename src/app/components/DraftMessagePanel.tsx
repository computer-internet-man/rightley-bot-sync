"use client";

import { useState, useEffect } from "react";
import { canSendMessages } from "@/lib/server-functions";
import { type User } from "@/db";
import { draftService } from "@/lib/draftService";

interface Patient {
  id: string;
  name: string;
  condition: string;
  lastContact: Date;
  status: string;
}

interface DraftMessagePanelProps {
  user: User;
  selectedPatient: Patient | null;
}

export function DraftMessagePanel({ user, selectedPatient }: DraftMessagePanelProps) {
  const [patientInquiry, setPatientInquiry] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [readingLevel, setReadingLevel] = useState("");
  const [validationIssues, setValidationIssues] = useState<string[]>([]);
  const [isSavingInquiry, setIsSavingInquiry] = useState(false);
  const [inquirySaveStatus, setInquirySaveStatus] = useState("");

  const canUserSendMessages = canSendMessages(user);

  // Load patient inquiry when patient changes
  useEffect(() => {
    if (selectedPatient) {
      // Clear form and load existing inquiry
      setAiResponse("");
      setError("");
      setSuccess("");
      setWordCount(0);
      setReadingLevel("");
      setValidationIssues([]);
      setInquirySaveStatus("");
      
      // Load existing patient inquiry
      loadPatientInquiry(selectedPatient.id);
    } else {
      setPatientInquiry("");
    }
  }, [selectedPatient]);

  const loadPatientInquiry = async (patientId: string) => {
    try {
      const response = await fetch(`/api/patient-inquiry?patientId=${patientId}`);
      const result = await response.json() as { success: boolean; patientInquiry?: string; error?: string };
      
      if (result.success) {
        setPatientInquiry(result.patientInquiry || "");
      }
    } catch (error) {
      console.error("Failed to load patient inquiry:", error);
    }
  };

  const savePatientInquiry = async (patientId: string, inquiryText: string) => {
    if (!patientId) return;
    
    setIsSavingInquiry(true);
    try {
      const response = await fetch('/api/patient-inquiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          patientInquiry: inquiryText
        })
      });
      
      const result = await response.json() as { success: boolean; error?: string };
      
      if (result.success) {
        setInquirySaveStatus("Saved");
        setTimeout(() => setInquirySaveStatus(""), 2000);
      } else {
        setInquirySaveStatus("Error saving");
        setTimeout(() => setInquirySaveStatus(""), 3000);
      }
    } catch (error) {
      console.error("Failed to save patient inquiry:", error);
      setInquirySaveStatus("Error saving");
      setTimeout(() => setInquirySaveStatus(""), 3000);
    } finally {
      setIsSavingInquiry(false);
    }
  };

  // Debounced save for patient inquiry
  useEffect(() => {
    if (!selectedPatient || !patientInquiry) return;
    
    const timeoutId = setTimeout(() => {
      savePatientInquiry(selectedPatient.id, patientInquiry);
    }, 1000); // Save after 1 second of no typing
    
    return () => clearTimeout(timeoutId);
  }, [patientInquiry, selectedPatient]);

  // Update analysis when response changes
  useEffect(() => {
    if (aiResponse) {
      const words = aiResponse.trim().split(/\s+/).length;
      setWordCount(words);
      setReadingLevel(draftService.analyzeReadingLevel(aiResponse));
      
      // Validate against doctor settings (assuming max 300 words for now)
      const validation = draftService.validateDraft(aiResponse, 300);
      setValidationIssues(validation.issues);
    } else {
      setWordCount(0);
      setReadingLevel("");
      setValidationIssues([]);
    }
  }, [aiResponse]);

  const generateDraft = async () => {
    if (!selectedPatient || !patientInquiry.trim()) {
      setError("Please select a patient and enter an inquiry");
      return;
    }

    setIsGenerating(true);
    setError("");
    setAiResponse("");

    try {
      const response = await draftService.generateDraft({
        patientInquiry: patientInquiry.trim(),
        patientId: selectedPatient.id,
        userId: user.id
      });

      if (response.success && response.draft) {
        setAiResponse(response.draft);
        setSuccess("Draft generated successfully!");
        setTimeout(() => setSuccess(""), 3000); // Clear success message after 3 seconds
      } else {
        setError(response.error || "Failed to generate draft");
      }
    } catch (err) {
      console.error("Draft generation error:", err);
      setError("Failed to generate AI response. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };



  const handleSendMessage = async () => {
    if (!aiResponse.trim()) {
      setError("Please generate a draft first");
      return;
    }

    setIsSending(true);
    setError("");
    setSuccess("");

    try {
      // Create audit log entry for the generated draft
      if (!selectedPatient) {
        setError("No patient selected");
        return;
      }

      const auditResponse = await fetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: selectedPatient.name,
          patientId: selectedPatient.id,
          requestText: patientInquiry,
          generatedDraft: aiResponse,
          finalMessage: aiResponse,
          actionType: 'draft_generated',
          deliveryStatus: 'draft'
        })
      });

      const auditResult = await auditResponse.json() as { success: boolean; auditLog?: { id: string }; error?: string };
      
      if (auditResult.success && auditResult.auditLog) {
        if (canUserSendMessages) {
          setSuccess("Draft created! Ready to finalize and send.");
        } else {
          setSuccess("Draft created! Ready to submit for review.");
        }
        
        // Store the audit log ID for finalization
        localStorage.setItem(`draft_${selectedPatient.id}`, JSON.stringify({
          auditLogId: auditResult.auditLog.id,
          finalMessage: aiResponse,
          patientName: selectedPatient.name,
          createdAt: new Date().toISOString()
        }));
        
        // Trigger finalization workflow
        window.dispatchEvent(new CustomEvent('draftCreated', {
          detail: {
            auditLogId: auditResult.auditLog.id,
            finalMessage: aiResponse,
            patientName: selectedPatient.name
          }
        }));
      } else {
        setError(auditResult.error || "Failed to create draft");
      }
    } catch (err) {
      console.error('Error creating draft:', err);
      setError("Failed to create draft");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Draft Message
        </h3>

        {!selectedPatient ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="mt-2">Select a patient to start drafting a message</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Patient Context */}
            <div className="bg-blue-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-blue-900">Selected Patient</h4>
              <p className="text-sm text-blue-700">{selectedPatient.name}</p>
              <p className="text-xs text-blue-600">{selectedPatient.condition}</p>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="text-sm text-red-600">{error}</div>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <div className="text-sm text-green-600">{success}</div>
              </div>
            )}

            {/* Patient Inquiry Input */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Patient Inquiry
                </label>
                <div className="flex items-center space-x-2">
                  {isSavingInquiry && (
                    <div className="flex items-center text-xs text-gray-500">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400 mr-1"></div>
                      Saving...
                    </div>
                  )}
                  {inquirySaveStatus && (
                    <span className={`text-xs ${
                      inquirySaveStatus === "Saved" 
                        ? "text-green-600" 
                        : "text-red-600"
                    }`}>
                      {inquirySaveStatus}
                    </span>
                  )}
                </div>
              </div>
              <textarea
                rows={3}
                value={patientInquiry}
                onChange={(e) => setPatientInquiry(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter patient's message or inquiry... (auto-saves as you type)"
              />
            </div>
            
            {/* AI Generated Response */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                AI Generated Response
              </label>
              <div className="mt-1 relative">
                <textarea
                  rows={8}
                  value={aiResponse}
                  onChange={(e) => setAiResponse(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="AI-generated response will appear here based on patient context and doctor preferences."
                />
                {isGenerating && (
                  <div className="absolute inset-0 bg-gray-50 bg-opacity-75 flex items-center justify-center rounded-md">
                    <div className="flex items-center text-sm text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                      Generating response...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Validation and Analysis */}
            {aiResponse && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Word Count:</span>
                  <span className={wordCount > 300 ? "text-red-600 font-medium" : "text-gray-900"}>
                    {wordCount}/300 words
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Reading Level:</span>
                  <span className="text-gray-900">{readingLevel}</span>
                </div>
                {validationIssues.length > 0 && (
                  <div className="mt-2">
                    <h5 className="text-sm font-medium text-red-800 mb-1">Validation Issues:</h5>
                    <ul className="text-sm text-red-600 space-y-1">
                      {validationIssues.map((issue, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-red-500 mr-1">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={generateDraft}
                disabled={isGenerating || !selectedPatient || !patientInquiry.trim()}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Generating...
                  </span>
                ) : (
                  "Generate Draft"
                )}
              </button>
              
              <button
                onClick={handleSendMessage}
                disabled={isSending || !aiResponse.trim()}
                className={`flex-1 text-white px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  canUserSendMessages
                    ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                    : "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500"
                }`}
              >
                {isSending ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {canUserSendMessages ? "Sending..." : "Submitting..."}
                  </span>
                ) : (
                canUserSendMessages ? "Create Draft" : "Create Draft"
                )}
              </button>
            </div>

            {/* Character Count */}
            <div className="text-right text-xs text-gray-500">
              {aiResponse.length} characters • {wordCount} words
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
