# AI Concierge MVP - Manual Testing Guide

## Prerequisites

1. **Start Development Server**:
   ```bash
   cd /home/john/my-app
   pnpm run dev
   ```

2. **Verify Database**:
   ```bash
   pnpm run seed  # Ensure test data is loaded
   ```

3. **Check Application Access**:
   - Open browser to http://localhost:5173
   - Verify homepage loads

## Testing Mock JWT Authentication

Since this is a development environment, we'll test with mock JWT headers. You can use browser developer tools or a tool like Postman.

### Mock JWT Tokens for Testing:

```javascript
// Staff User (alice@clinic.com)
const staffToken = "header.eyJlbWFpbCI6ImFsaWNlQGNsaW5pYy5jb20ifQ.signature";

// Doctor User (smith@clinic.com)  
const doctorToken = "header.eyJlbWFpbCI6InNtaXRoQGNsaW5pYy5jb20ifQ.signature";

// Admin User (jane@clinic.com)
const adminToken = "header.eyJlbWFpbCI6ImphbmVAY2xpbmljLmNvbSJ9.signature";

// Auditor User (mike@clinic.com)
const auditorToken = "header.eyJlbWFpbCI6Im1pa2VAY2xpbmljLmNvbSJ9.signature";

// Reviewer User (carol@clinic.com)
const reviewerToken = "header.eyJlbWFpbCI6ImNhcm9sQGNsaW5pYy5jb20ifQ.signature";
```

### Browser Extension for JWT Testing

Install a browser extension like "ModHeader" to add the JWT header:
- Header Name: `Cf-Access-Jwt-Assertion`
- Header Value: Use one of the tokens above

---

## Test Plan 1: Complete Staff Workflow

### Step 1: Access Draft Workflow
1. Set JWT header to staff token
2. Navigate to http://localhost:5173/draft
3. ✅ **Expected**: Page loads with draft interface
4. ❌ **Failure**: If redirected or error, check role permissions

### Step 2: Generate AI Draft
1. On draft page, select a patient from dropdown
2. Enter patient inquiry: "I'm experiencing side effects from my medication"
3. Click "Generate Draft" button
4. ✅ **Expected**: AI generates contextual response
5. ❌ **Failure**: Check OpenAI API key configuration

### Step 3: Edit and Submit for Review
1. Edit the generated draft message
2. Click "Submit for Review" button
3. ✅ **Expected**: Success message, draft submitted to review queue
4. ❌ **Failure**: Check message workflow API

### Step 4: Verify Audit Log
1. Change JWT header to auditor token
2. Navigate to http://localhost:5173/admin/audit
3. ✅ **Expected**: See audit entry for draft generation and submission
4. ❌ **Failure**: Check audit logging implementation

---

## Test Plan 2: Role-Based Access Control

### Test 2.1: Staff User Permissions
Set JWT header to staff token and test access:

| URL | Expected Result | Test Result |
|-----|-----------------|-------------|
| /draft | ✅ Access Granted | |
| /doctor/settings | ❌ Access Denied | |
| /admin | ❌ Access Denied | |
| /admin/audit | ❌ Access Denied | |

### Test 2.2: Doctor User Permissions  
Set JWT header to doctor token and test access:

| URL | Expected Result | Test Result |
|-----|-----------------|-------------|
| /draft | ✅ Access Granted | |
| /doctor/settings | ✅ Access Granted | |
| /admin/briefs | ✅ Access Granted | |
| /admin | ❌ Access Denied | |

### Test 2.3: Admin User Permissions
Set JWT header to admin token and test access:

| URL | Expected Result | Test Result |
|-----|-----------------|-------------|
| /draft | ✅ Access Granted | |
| /doctor/settings | ✅ Access Granted | |
| /admin | ✅ Access Granted | |
| /admin/audit | ✅ Access Granted | |

### Test 2.4: Auditor User Permissions
Set JWT header to auditor token and test access:

| URL | Expected Result | Test Result |
|-----|-----------------|-------------|
| /admin/audit | ✅ Access Granted | |
| /admin | ❌ Access Denied | |
| /draft | ✅ Access Granted | |

---

## Test Plan 3: API Security Testing

### Test 3.1: Unauthorized API Access
Remove JWT header and test API endpoints:

```bash
# Test without authentication
curl -X POST http://localhost:5173/api/generate-draft \
  -H "Content-Type: application/json" \
  -d '{"patientId":"test","requestText":"test"}'

# Expected: 401 Unauthorized
```

### Test 3.2: Role-Specific API Access
Test API endpoints with different user roles:

```bash
# Staff accessing draft generation (should work)
curl -X POST http://localhost:5173/api/generate-draft \
  -H "Cf-Access-Jwt-Assertion: header.eyJlbWFpbCI6ImFsaWNlQGNsaW5pYy5jb20ifQ.signature" \
  -H "Content-Type: application/json" \
  -d '{"patientInquiry":"test","patientId":"sample-id","userId":"staff-user-id"}'

# Staff accessing audit export (should fail)
curl -X POST http://localhost:5173/api/audit-export/export \
  -H "Cf-Access-Jwt-Assertion: header.eyJlbWFpbCI6ImFsaWNlQGNsaW5pYy5jb20ifQ.signature" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv"}'

# Auditor accessing audit export (should work)
curl -X POST http://localhost:5173/api/audit-export/export \
  -H "Cf-Access-Jwt-Assertion: header.eyJlbWFpbCI6Im1pa2VAY2xpbmljLmNvbSJ9.signature" \
  -H "Content-Type: application/json" \
  -d '{"format":"csv"}'
```

---

## Test Plan 4: Doctor Workflow

### Step 1: Configure Doctor Settings
1. Set JWT header to doctor token
2. Navigate to http://localhost:5173/doctor/settings
3. Update communication preferences:
   - Communication Tone: "Professional and empathetic"
   - Max Words: 150
   - Reading Level: "High School"
   - Sign Off: "Dr. Smith, Internal Medicine"
4. Save settings
5. ✅ **Expected**: Settings saved successfully

### Step 2: Manage Patient Briefs
1. Navigate to http://localhost:5173/admin/briefs
2. Create new patient brief with medical history
3. Edit existing patient brief
4. ✅ **Expected**: CRUD operations work correctly

### Step 3: Direct Message Sending
1. Generate a draft for a patient
2. Use "Send Directly" option (bypassing review)
3. ✅ **Expected**: Message sent without reviewer approval

---

## Test Plan 5: Reviewer Workflow

### Step 1: Access Review Queue
1. Set JWT header to reviewer token
2. Navigate to http://localhost:5173/review
3. ✅ **Expected**: See pending messages for review

### Step 2: Review and Approve
1. Select a pending message
2. Review content for appropriateness
3. Add reviewer notes
4. Approve message
5. ✅ **Expected**: Message approved and moved to delivery queue

### Step 3: Review and Reject
1. Select another pending message
2. Add rejection reason
3. Reject message
4. ✅ **Expected**: Message rejected and returned to draft

---

## Test Plan 6: Input Validation Testing

### Test 6.1: Invalid API Requests
Test with malformed or missing data:

```bash
# Missing required fields
curl -X POST http://localhost:5173/api/generate-draft \
  -H "Cf-Access-Jwt-Assertion: header.eyJlbWFpbCI6ImFsaWNlQGNsaW5pYy5jb20ifQ.signature" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Bad Request

# Malformed JSON
curl -X POST http://localhost:5173/api/generate-draft \
  -H "Cf-Access-Jwt-Assertion: header.eyJlbWFpbCI6ImFsaWNlQGNsaW5pYy5jb20ifQ.signature" \
  -H "Content-Type: application/json" \
  -d 'invalid json'

# Expected: 400 Bad Request
```

### Test 6.2: UI Input Validation
1. Try submitting forms with empty required fields
2. Enter oversized content (beyond word limits)
3. Test special characters and Unicode
4. ✅ **Expected**: Proper validation errors displayed

---

## Test Plan 7: Data Export and Compliance

### Step 1: Export Audit Data
1. Set JWT header to auditor token
2. Navigate to http://localhost:5173/admin/audit
3. Use export functionality to download:
   - CSV format
   - JSON format
   - PDF compliance report
4. ✅ **Expected**: Files download successfully with proper data

### Step 2: Verify Data Integrity
1. Use integrity verification feature
2. Check content hashes
3. ✅ **Expected**: Data integrity verified

---

## Test Plan 8: Performance Testing

### Test 8.1: Concurrent Users
Open multiple browser tabs with different user roles simultaneously:
1. Staff user generating drafts
2. Doctor user managing settings
3. Auditor user viewing logs
4. ✅ **Expected**: All operations work without conflicts

### Test 8.2: Large Data Sets
1. Create multiple patient briefs (10+)
2. Generate multiple audit log entries
3. Test pagination and filtering
4. ✅ **Expected**: Performance remains acceptable

---

## Test Plan 9: Error Handling

### Test 9.1: Network Failures
1. Disconnect internet while generating AI draft
2. ✅ **Expected**: Graceful error message, retry option

### Test 9.2: Database Errors
1. Test with invalid database queries
2. ✅ **Expected**: Proper error handling, no data corruption

---

## Verification Checklist

### ✅ Complete Workflow Testing
- [ ] Staff workflow: Draft → Edit → Submit → Review → Send
- [ ] Doctor workflow: Settings → Briefs → Direct Send
- [ ] Reviewer workflow: Review → Approve/Reject
- [ ] Admin workflow: Manage Data → View Audit → Export
- [ ] Auditor workflow: Access Logs → Generate Reports

### ✅ Role-Based Access Control
- [ ] Staff can only access permitted areas
- [ ] Doctors can access settings and patient briefs
- [ ] Admins have full access
- [ ] Auditors can access audit logs only
- [ ] Unauthorized access properly blocked

### ✅ API Security
- [ ] Unauthorized requests rejected
- [ ] Role-specific API access enforced
- [ ] Input validation working
- [ ] No sensitive data exposure

### ✅ Data Integrity
- [ ] Audit logs created for all actions
- [ ] Data export functionality working
- [ ] Content hash verification working
- [ ] No data corruption observed

### ✅ Performance
- [ ] Response times acceptable
- [ ] Concurrent users supported
- [ ] Large data sets handled properly
- [ ] No memory leaks detected

### ✅ Error Handling
- [ ] Network failures handled gracefully
- [ ] Invalid input rejected properly
- [ ] Database errors handled correctly
- [ ] User-friendly error messages

---

## Issue Reporting Template

If you find issues during testing, report them using this format:

**Issue #**: [Sequential number]
**Severity**: [Critical/High/Medium/Low]
**Component**: [UI/API/Database/Security/Performance]
**Description**: [What happened]
**Steps to Reproduce**: [Detailed steps]
**Expected Result**: [What should happen]
**Actual Result**: [What actually happened]
**User Role**: [Which role was being tested]
**Browser/Tool**: [Testing environment]
**Screenshot**: [If applicable]

---

## Post-Testing Actions

1. **Document Results**: Fill in test result columns
2. **Report Issues**: Use issue template above
3. **Update Configuration**: Fix any configuration issues found
4. **Verify Fixes**: Re-test any issues found
5. **Approve for Production**: If all tests pass

---

**Happy Testing!** 🧪

This comprehensive manual testing guide covers all critical functionality of the AI Concierge MVP. Follow each test plan systematically to ensure the application is ready for production deployment.
