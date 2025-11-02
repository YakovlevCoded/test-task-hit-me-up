#!/bin/bash

# Test script for iMessage bot

BOT_URL="http://localhost:3001"

echo "========================================="
echo "  iMessage Bot Testing Script"
echo "========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "GET $BOT_URL/health"
echo ""
curl -s "$BOT_URL/health" | jq '.' 2>/dev/null || curl -s "$BOT_URL/health"
echo ""
echo ""

# Test 2: Bot info
echo -e "${YELLOW}Test 2: Bot Info${NC}"
echo "GET $BOT_URL/api/info"
echo ""
curl -s "$BOT_URL/api/info" | jq '.' 2>/dev/null || curl -s "$BOT_URL/api/info"
echo ""
echo ""

# Test 3: Send message
echo -e "${YELLOW}Test 3: Send Message${NC}"
echo -e "${RED}⚠️  IMPORTANT: Edit this script and replace +1234567890 with your real test number!${NC}"
echo ""

# Get phone number from user
read -p "Enter test phone number (or press Enter to skip): " PHONE_NUMBER

if [ -z "$PHONE_NUMBER" ]; then
  echo "Skipping send test (no phone number provided)"
else
  echo ""
  echo "Sending message to $PHONE_NUMBER..."
  echo "POST $BOT_URL/api/send"
  echo ""

  curl -s -X POST "$BOT_URL/api/send" \
    -H "Content-Type: application/json" \
    -d "{\"to\": \"$PHONE_NUMBER\", \"message\": \"Test message from iMessage bot! Timestamp: $(date)\"}" \
    | jq '.' 2>/dev/null || curl -s -X POST "$BOT_URL/api/send" \
    -H "Content-Type: application/json" \
    -d "{\"to\": \"$PHONE_NUMBER\", \"message\": \"Test message from iMessage bot!\"}"

  echo ""
  echo ""
  echo -e "${GREEN}✓ Check Messages.app to verify the message was sent!${NC}"
fi

echo ""
echo "========================================="
echo "  Testing Complete"
echo "========================================="
