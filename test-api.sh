#!/bin/bash

# Test script for job queue system

API_URL="http://localhost:3000"

echo "=== Testing Distributed Job Queue System ==="
echo ""

# Test 1: Create a job
echo "1. Creating job..."
JOB_RESPONSE=$(curl -s -X POST $API_URL/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "payload": {
      "to": "test@example.com",
      "subject": "Test Email",
      "body": "This is a test"
    },
    "idempotencyKey": "test-'$(date +%s)'",
    "priority": 10
  }')

echo "$JOB_RESPONSE" | jq .
JOB_ID=$(echo "$JOB_RESPONSE" | jq -r .id)
echo ""

# Test 2: Get job status
echo "2. Getting job status..."
sleep 2
curl -s $API_URL/jobs/$JOB_ID | jq .
echo ""

# Test 3: Create a delayed job
echo "3. Creating delayed job (5s delay)..."
curl -s -X POST $API_URL/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "webhook",
    "payload": {
      "url": "https://example.com/webhook"
    },
    "delay": 5000,
    "priority": 5
  }' | jq .
echo ""

# Test 4: Test idempotency
echo "4. Testing idempotency (duplicate request)..."
IDEM_KEY="idempotent-test-$(date +%s)"
echo "First request:"
FIRST=$(curl -s -X POST $API_URL/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data-processing",
    "payload": {"data": "test"},
    "idempotencyKey": "'$IDEM_KEY'"
  }')
echo "$FIRST" | jq .

echo ""
echo "Second request (should return same job):"
SECOND=$(curl -s -X POST $API_URL/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "data-processing",
    "payload": {"data": "test"},
    "idempotencyKey": "'$IDEM_KEY'"
  }')
echo "$SECOND" | jq .

FIRST_ID=$(echo "$FIRST" | jq -r .id)
SECOND_ID=$(echo "$SECOND" | jq -r .id)

if [ "$FIRST_ID" == "$SECOND_ID" ]; then
  echo "✓ Idempotency works! Same job ID: $FIRST_ID"
else
  echo "✗ Idempotency failed! Different IDs: $FIRST_ID vs $SECOND_ID"
fi

echo ""
echo "=== Tests Complete ==="
