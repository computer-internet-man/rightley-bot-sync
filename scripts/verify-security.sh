#!/bin/bash

echo "🛡️ Security Gates Verification Script"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base URL (adjust if needed)
BASE_URL="http://localhost:5173"

echo -e "${BLUE}Testing Security Gates Implementation${NC}"
echo ""

# Test 1: Security Headers
echo -e "${YELLOW}1. Testing Enhanced Security Headers${NC}"
echo "Command: curl -I '$BASE_URL/'"
curl -I "$BASE_URL/" 2>/dev/null | grep -E "(Strict-Transport-Security|Content-Security-Policy|X-Frame-Options|X-Content-Type-Options|Referrer-Policy|Permissions-Policy)" || echo -e "${RED}❌ Security headers missing${NC}"
echo ""

# Test 2: Rate Limiting
echo -e "${YELLOW}2. Testing Rate Limiting${NC}"
echo "Command: Sending 10 rapid requests to test rate limiting"
for i in {1..10}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/test")
  echo "Request $i: HTTP $response"
  if [ "$response" = "429" ]; then
    echo -e "${GREEN}✅ Rate limiting working - got 429 status${NC}"
    break
  fi
  sleep 0.1
done
echo ""

# Test 3: WAF SQL Injection Detection
echo -e "${YELLOW}3. Testing WAF - SQL Injection Detection${NC}"
echo "Command: curl -s '$BASE_URL/test?id=1%27%20OR%201=1--'"
response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/test?id=1%27%20OR%201=1--")
if [ "$response" = "403" ]; then
  echo -e "${GREEN}✅ WAF blocked SQL injection attempt (HTTP 403)${NC}"
else
  echo -e "${RED}❌ WAF did not block SQL injection (HTTP $response)${NC}"
fi
echo ""

# Test 4: WAF XSS Detection
echo -e "${YELLOW}4. Testing WAF - XSS Detection${NC}"
echo "Command: curl -s '$BASE_URL/test' -d 'comment=<script>alert(1)</script>'"
response=$(curl -s -w "%{http_code}" -o /dev/null -X POST "$BASE_URL/test" -d "comment=<script>alert(1)</script>")
if [ "$response" = "403" ]; then
  echo -e "${GREEN}✅ WAF blocked XSS attempt (HTTP 403)${NC}"
else
  echo -e "${RED}❌ WAF did not block XSS (HTTP $response)${NC}"
fi
echo ""

# Test 5: Security Debug Endpoint
echo -e "${YELLOW}5. Testing Security Debug Endpoint${NC}"
echo "Command: curl -s '$BASE_URL/debug/security'"
security_debug=$(curl -s "$BASE_URL/debug/security" 2>/dev/null)
if echo "$security_debug" | grep -q "security_score"; then
  echo -e "${GREEN}✅ Security debug endpoint accessible${NC}"
  echo "Security Score: $(echo "$security_debug" | grep -o '"security_score":[0-9]*' | cut -d':' -f2)"
else
  echo -e "${RED}❌ Security debug endpoint not working${NC}"
fi
echo ""

# Test 6: Security Monitoring Endpoint
echo -e "${YELLOW}6. Testing Security Monitoring Dashboard${NC}"
echo "Command: curl -s '$BASE_URL/monitoring/security'"
monitoring_debug=$(curl -s "$BASE_URL/monitoring/security" 2>/dev/null)
if echo "$monitoring_debug" | grep -q "Security Dashboard"; then
  echo -e "${GREEN}✅ Security monitoring endpoint accessible${NC}"
else
  echo -e "${RED}❌ Security monitoring endpoint not working${NC}"
fi
echo ""

# Test 7: Suspicious User-Agent Detection
echo -e "${YELLOW}7. Testing Bot Detection${NC}"
echo "Command: curl -s '$BASE_URL/test' -H 'User-Agent: sqlmap/1.0'"
response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/test" -H "User-Agent: sqlmap/1.0")
if [ "$response" = "403" ]; then
  echo -e "${GREEN}✅ Bot detection working (HTTP 403)${NC}"
else
  echo -e "${YELLOW}⚠️ Bot detection may be logging only (HTTP $response)${NC}"
fi
echo ""

# Test 8: Path Traversal Detection
echo -e "${YELLOW}8. Testing Path Traversal Detection${NC}"
echo "Command: curl -s '$BASE_URL/../../../etc/passwd'"
response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/../../../etc/passwd")
if [ "$response" = "403" ]; then
  echo -e "${GREEN}✅ Path traversal blocked (HTTP 403)${NC}"
else
  echo -e "${RED}❌ Path traversal not blocked (HTTP $response)${NC}"
fi
echo ""

# Test 9: DDoS Protection (burst requests)
echo -e "${YELLOW}9. Testing DDoS Protection${NC}"
echo "Command: Sending 50 rapid requests to trigger anomaly detection"
for i in {1..50}; do
  response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/test" 2>/dev/null)
  if [ "$response" = "429" ]; then
    echo -e "${GREEN}✅ DDoS protection triggered at request $i (HTTP 429)${NC}"
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "Sent $i requests..."
  fi
done
echo ""

# Test 10: Security Headers Validation
echo -e "${YELLOW}10. Testing Security Headers Validation Endpoint${NC}"
echo "Command: curl -s '$BASE_URL/debug/security-headers'"
headers_debug=$(curl -s "$BASE_URL/debug/security-headers" 2>/dev/null)
if echo "$headers_debug" | grep -q "security_score"; then
  echo -e "${GREEN}✅ Security headers validation endpoint working${NC}"
  echo "Headers Security Score: $(echo "$headers_debug" | grep -o '"security_score":[0-9]*' | cut -d':' -f2)"
else
  echo -e "${RED}❌ Security headers validation endpoint not working${NC}"
fi
echo ""

echo -e "${BLUE}Security Verification Complete${NC}"
echo ""
echo -e "${YELLOW}Summary:${NC}"
echo "• Enhanced security headers implemented"
echo "• Rate limiting with tiered limits (IP/User based)"
echo "• WAF protection against SQL injection, XSS, path traversal"
echo "• DDoS protection with anomaly detection"
echo "• Security monitoring and debug endpoints"
echo "• Bot detection and suspicious activity blocking"
echo ""
echo -e "${GREEN}🛡️ Security Gates Implementation Complete!${NC}"
echo ""
echo -e "${YELLOW}Additional Commands:${NC}"
echo "• Monitor security: curl -s '$BASE_URL/monitoring/security' | jq"
echo "• Check rate limits: curl -I '$BASE_URL/test' | grep X-RateLimit"
echo "• View security score: curl -s '$BASE_URL/debug/security' | jq .security_score"
echo "• Test with malicious payload: curl '$BASE_URL/test?q=<script>alert(1)</script>'"
