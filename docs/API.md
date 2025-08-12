# API Documentation

## Table of Contents
- [Overview](#overview)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Core APIs](#core-apis)
- [Message Workflow APIs](#message-workflow-apis)
- [Patient Data APIs](#patient-data-apis)
- [Audit & Compliance APIs](#audit--compliance-apis)
- [Queue Management APIs](#queue-management-apis)
- [Debug APIs](#debug-apis)
- [Webhooks](#webhooks)
- [Response Schemas](#response-schemas)

## Overview

The RedwoodSDK Cloudflare API provides a comprehensive set of endpoints for healthcare communication workflows. All APIs are secured with JWT authentication and role-based access control.

**Base URL**: `https://your-worker.your-subdomain.workers.dev`
**API Version**: v1
**Content-Type**: `application/json`

## Authentication

All API endpoints require authentication via Cloudflare Access JWT tokens.

### Headers
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Roles
- `staff`: Basic access to draft generation
- `reviewer`: Can review and approve messages
- `doctor`: Full access to patient workflows
- `admin`: Administrative access to all features
- `auditor`: Read-only access to audit logs and compliance

### Example Authentication
```bash
curl -H "Authorization: Bearer eyJ..." \
     -H "Content-Type: application/json" \
     https://your-worker.workers.dev/api/generate-draft
```

## Rate Limiting

| Role | Endpoint | Limit | Window |
|------|----------|--------|--------|
| All | General API | 500/min | 1 minute |
| All | IP-based | 100/min | 1 minute |
| Staff | Draft Generation | 50/day | 24 hours |
| Doctor | Draft Generation | 100/day | 24 hours |
| Admin | Draft Generation | 1000/day | 24 hours |

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 85
X-RateLimit-Reset: 1704067200
```

## Error Handling

### Error Response Format
```json
{
  "error": "string",
  "message": "string",
  "code": "string",
  "details": {},
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### HTTP Status Codes
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Core APIs

### Generate Draft Message

Generate an AI-powered message draft for patient communication.

**Endpoint**: `POST /api/generate-draft`
**Auth**: Required (staff, reviewer, doctor, admin)
**Rate Limit**: Role-based daily limits

#### Request
```json
{
  "patientInquiry": "Patient is experiencing chest pain for 3 days",
  "patientId": "patient-123",
  "userId": "user-456"
}
```

#### Response
```json
{
  "success": true,
  "draft": "Based on your symptoms, I recommend scheduling an appointment...",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 200,
    "totalTokens": 350
  },
  "wordCount": 45,
  "model": "gpt-4",
  "isStubbed": false,
  "cost": 0.007,
  "rateLimitInfo": {
    "remaining": 49,
    "resetTime": 1704067200
  }
}
```

#### Example cURL
```bash
curl -X POST https://your-worker.workers.dev/api/generate-draft \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "patientInquiry": "Patient experiencing chest pain",
    "patientId": "patient-123",
    "userId": "user-456"
  }'
```

### Test Endpoint

Basic connectivity and authentication test.

**Endpoint**: `GET /test`
**Auth**: Required

#### Response
```json
{
  "message": "Test route works! User: doctor@example.com (doctor)",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### Example cURL
```bash
curl -H "Authorization: Bearer <token>" \
     https://your-worker.workers.dev/test
```

## Message Workflow APIs

### Submit for Review

Submit a message for approval workflow.

**Endpoint**: `POST /api/message-workflow/submit-for-review`
**Auth**: Required (staff, reviewer, doctor, admin)

#### Request
```json
{
  "messageId": "msg-123",
  "finalMessage": "Your appointment has been scheduled...",
  "patientId": "patient-123",
  "deliveryMethod": "email",
  "recipientEmail": "patient@example.com",
  "recipientPhone": "+1234567890"
}
```

#### Response
```json
{
  "success": true,
  "reviewId": "review-456",
  "message": "Message submitted for review",
  "estimatedReviewTime": "2024-01-01T12:00:00Z"
}
```

#### Example cURL
```bash
curl -X POST https://your-worker.workers.dev/api/message-workflow/submit-for-review \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "msg-123",
    "finalMessage": "Your appointment has been scheduled",
    "patientId": "patient-123",
    "deliveryMethod": "email",
    "recipientEmail": "patient@example.com"
  }'
```

### Review Message

Review and approve/reject a submitted message.

**Endpoint**: `POST /api/message-workflow/review`
**Auth**: Required (reviewer, doctor, admin)

#### Request
```json
{
  "reviewId": "review-456",
  "action": "approve",
  "comments": "Approved with minor edits",
  "editedMessage": "Your appointment has been scheduled for..."
}
```

#### Response
```json
{
  "success": true,
  "action": "approved",
  "deliveryScheduled": true,
  "estimatedDelivery": "2024-01-01T13:00:00Z"
}
```

### Send Directly

Send message directly without review (doctor/admin only).

**Endpoint**: `POST /api/message-workflow/send-directly`
**Auth**: Required (doctor, admin)

#### Request
```json
{
  "messageId": "msg-789",
  "finalMessage": "Emergency: Please call immediately",
  "patientId": "patient-123",
  "deliveryMethod": "sms",
  "recipientPhone": "+1234567890",
  "priority": "high"
}
```

#### Response
```json
{
  "success": true,
  "deliveryId": "delivery-123",
  "estimatedDelivery": "2024-01-01T10:05:00Z",
  "method": "sms"
}
```

### Get Pending Reviews

Get messages awaiting review.

**Endpoint**: `GET /api/message-workflow/pending-review`
**Auth**: Required (reviewer, doctor, admin)

#### Query Parameters
- `limit` (optional): Number of results (default: 20)
- `offset` (optional): Pagination offset (default: 0)

#### Response
```json
{
  "pendingReviews": [
    {
      "reviewId": "review-456",
      "messageId": "msg-123",
      "submittedBy": "staff@example.com",
      "submittedAt": "2024-01-01T10:00:00Z",
      "patientId": "patient-123",
      "priority": "normal",
      "deliveryMethod": "email"
    }
  ],
  "total": 5,
  "hasMore": false
}
```

#### Example cURL
```bash
curl -H "Authorization: Bearer <token>" \
     "https://your-worker.workers.dev/api/message-workflow/pending-review?limit=10"
```

## Patient Data APIs

### Update Patient Inquiry

Update patient inquiry information.

**Endpoint**: `PUT /api/patient-inquiry`
**Auth**: Required

#### Request
```json
{
  "patientId": "patient-123",
  "patientInquiry": "Updated symptoms: chest pain and shortness of breath"
}
```

#### Response
```json
{
  "success": true,
  "patientId": "patient-123",
  "updatedAt": "2024-01-01T10:00:00Z"
}
```

### Get Patient Inquiry

Retrieve patient inquiry data.

**Endpoint**: `GET /api/patient-inquiry`
**Auth**: Required (doctors can only access their patients)

#### Query Parameters
- `patientId` (required): Patient identifier

#### Response
```json
{
  "success": true,
  "patientInquiry": "Patient experiencing chest pain for 3 days",
  "lastUpdated": "2024-01-01T09:00:00Z"
}
```

#### Example cURL
```bash
curl -H "Authorization: Bearer <token>" \
     "https://your-worker.workers.dev/api/patient-inquiry?patientId=patient-123"
```

## Audit & Compliance APIs

### Get Audit Logs

Retrieve audit logs with filtering and pagination.

**Endpoint**: `GET /api/audit-logs`
**Auth**: Required

#### Query Parameters
- `startDate` (optional): Filter start date (ISO format)
- `endDate` (optional): Filter end date (ISO format)
- `userId` (optional): Filter by user ID
- `actionType` (optional): Filter by action type
- `deliveryStatus` (optional): Filter by delivery status
- `patientName` (optional): Filter by patient name
- `limit` (optional): Results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

#### Response
```json
{
  "auditLogs": [
    {
      "id": "audit-123",
      "timestamp": "2024-01-01T10:00:00Z",
      "userId": "user-456",
      "userEmail": "doctor@example.com",
      "userRole": "doctor",
      "actionType": "message_sent",
      "resourceType": "patient_message",
      "resourceId": "msg-123",
      "details": {
        "patientId": "patient-123",
        "deliveryMethod": "email",
        "messageLength": 150
      },
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0..."
    }
  ],
  "pagination": {
    "total": 1250,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Example cURL
```bash
curl -H "Authorization: Bearer <token>" \
     "https://your-worker.workers.dev/api/audit-logs?actionType=message_sent&limit=20"
```

### Export Audit Logs

Export audit logs as CSV file.

**Endpoint**: `GET /api/audit-export`
**Auth**: Required (auditor, admin)

#### Query Parameters
Same as audit logs endpoint

#### Response
CSV file download with headers:
```csv
Timestamp,User Email,User Role,Action Type,Resource Type,Resource ID,Details,IP Address
2024-01-01T10:00:00Z,doctor@example.com,doctor,message_sent,patient_message,msg-123,"{""patientId"":""patient-123""}",192.168.1.1
```

#### Example cURL
```bash
curl -H "Authorization: Bearer <token>" \
     "https://your-worker.workers.dev/api/audit-export?startDate=2024-01-01&endDate=2024-01-31" \
     -o audit-logs.csv
```

## Queue Management APIs

### Enqueue Job

Programmatically enqueue background jobs.

**Endpoint**: `POST /api/enqueue-job`
**Auth**: Required

#### Email Job Request
```json
{
  "type": "email_send",
  "messageId": "msg-123",
  "recipient": "patient@example.com",
  "subject": "Appointment Reminder",
  "content": "Your appointment is scheduled for...",
  "priority": "normal",
  "metadata": {
    "patientId": "patient-123",
    "doctorId": "doctor-456"
  }
}
```

#### SMS Job Request
```json
{
  "type": "sms_send",
  "messageId": "msg-124",
  "recipient": "+1234567890",
  "content": "Appointment reminder: Tomorrow at 2 PM",
  "priority": "high",
  "metadata": {
    "patientId": "patient-123"
  }
}
```

#### Response
```json
{
  "success": true,
  "jobId": "job-789",
  "queuePosition": 3,
  "estimatedProcessingTime": "2024-01-01T10:05:00Z"
}
```

#### Example cURL
```bash
curl -X POST https://your-worker.workers.dev/api/enqueue-job \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email_send",
    "messageId": "msg-123",
    "recipient": "patient@example.com",
    "subject": "Test Message",
    "content": "This is a test message"
  }'
```

### Mark as Sent

Mark message as sent for audit trail.

**Endpoint**: `POST /api/mark-as-sent`
**Auth**: Required

#### Request
```json
{
  "messageId": "msg-123",
  "finalMessage": "Your appointment has been confirmed...",
  "deliveryMethod": "email"
}
```

#### Response
```json
{
  "success": true,
  "auditLogId": "audit-456",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

## Debug APIs

These endpoints are available for development and testing purposes.

### Environment Check

**Endpoint**: `GET /debug/env`
**Auth**: Required

#### Response
```json
{
  "environment": "local",
  "version": "1.0.0",
  "hasDatabase": true,
  "timestamp": "2024-01-01T10:00:00Z",
  "user": {
    "email": "user@example.com",
    "role": "doctor"
  }
}
```

### Queue Status

**Endpoint**: `GET /debug/queue-status`
**Auth**: Required

#### Response
```json
{
  "queueHealth": "healthy",
  "pendingJobs": 15,
  "processingJobs": 3,
  "completedToday": 245,
  "failedToday": 2,
  "averageProcessingTime": "2.3s"
}
```

### Performance Metrics

**Endpoint**: `GET /debug/performance`
**Auth**: Required

#### Response
```json
{
  "responseTime": "45ms",
  "databaseQueries": 3,
  "averageQueryTime": "8ms",
  "memoryUsage": "15MB",
  "cpuUsage": "12%"
}
```

## Webhooks

### Delivery Status Webhook

Receives delivery status updates from external providers.

**Endpoint**: `POST /api/message-workflow/delivery-status`
**Auth**: Webhook signature validation

#### Request
```json
{
  "auditLogId": "audit-123",
  "status": "delivered",
  "timestamp": "2024-01-01T10:15:00Z",
  "provider": "sendgrid",
  "webhookData": {
    "messageId": "sg-msg-456",
    "event": "delivered",
    "timestamp": 1704067200
  }
}
```

#### Response
```json
{
  "success": true,
  "processed": true
}
```

#### Webhook Security
- Requires valid webhook signature in `X-Webhook-Signature` header
- Signature validation using HMAC-SHA256
- Replay attack prevention with timestamp validation

#### Example Webhook Setup
```bash
# SendGrid webhook configuration
curl -X POST "https://api.sendgrid.com/v3/user/webhooks/event" \
  -H "Authorization: Bearer <sendgrid-api-key>" \
  -d '{
    "url": "https://your-worker.workers.dev/api/message-workflow/delivery-status",
    "enabled": true,
    "event_webhook": {
      "events": ["delivered", "bounce", "dropped"]
    }
  }'
```

## Response Schemas

### Standard Success Response
```json
{
  "success": true,
  "data": {},
  "timestamp": "2024-01-01T10:00:00Z"
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {},
  "timestamp": "2024-01-01T10:00:00Z"
}
```

### Pagination Response
```json
{
  "data": [],
  "pagination": {
    "total": 1000,
    "limit": 50,
    "offset": 0,
    "hasMore": true,
    "nextOffset": 50
  }
}
```

## SDK Examples

### JavaScript/TypeScript
```typescript
class ConciergeAPI {
  constructor(private baseUrl: string, private token: string) {}

  async generateDraft(request: DraftRequest): Promise<DraftResponse> {
    const response = await fetch(`${this.baseUrl}/api/generate-draft`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    return response.json();
  }
}

// Usage
const api = new ConciergeAPI('https://your-worker.workers.dev', 'your-jwt-token');
const draft = await api.generateDraft({
  patientInquiry: 'Patient has fever',
  patientId: 'patient-123',
  userId: 'user-456'
});
```

### Python
```python
import requests
from typing import Dict, Any

class ConciergeAPI:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def generate_draft(self, request: Dict[str, Any]) -> Dict[str, Any]:
        response = requests.post(
            f'{self.base_url}/api/generate-draft',
            headers=self.headers,
            json=request
        )
        response.raise_for_status()
        return response.json()

# Usage
api = ConciergeAPI('https://your-worker.workers.dev', 'your-jwt-token')
draft = api.generate_draft({
    'patientInquiry': 'Patient has fever',
    'patientId': 'patient-123',
    'userId': 'user-456'
})
```

## Rate Limit Best Practices

1. **Implement Exponential Backoff**: When rate limited, wait exponentially longer between retries
2. **Cache Responses**: Cache API responses when appropriate to reduce calls
3. **Batch Operations**: Use batch endpoints when available
4. **Monitor Usage**: Track your rate limit usage and plan accordingly
5. **Handle 429 Responses**: Always handle rate limit errors gracefully

## Security Best Practices

1. **Token Management**: Store JWT tokens securely and refresh them regularly
2. **HTTPS Only**: Always use HTTPS for API calls
3. **Input Validation**: Validate all input data before sending to API
4. **Error Handling**: Don't expose sensitive information in error messages
5. **Audit Logging**: Log all API interactions for security auditing
