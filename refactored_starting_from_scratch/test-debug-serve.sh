#!/bin/bash
# Test script for debug-serve.js
# Makes a few test requests to verify logging is working

if [ -z "$1" ]; then
  echo "Usage: ./test-debug-serve.sh <output-directory>"
  echo "Example: ./test-debug-serve.sh ./output/photopea.com-123456/"
  exit 1
fi

OUTPUT_DIR="$1"
PORT=3333
BASE_URL="http://localhost:$PORT"

echo "Testing debug-serve.js with $OUTPUT_DIR"
echo ""
echo "Start the debug server in another terminal:"
echo "  node debug-serve.js $OUTPUT_DIR"
echo ""
echo "Press Enter when server is running..."
read

echo ""
echo "Making test requests..."
echo ""

# Test 1: Root
echo "1. Testing root (/)..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/"
sleep 0.5

# Test 2: Index.html
echo "2. Testing index.html..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/index.html"
sleep 0.5

# Test 3: Status endpoint
echo "3. Testing /__status__..."
curl -s "$BASE_URL/__status__" | head -5
sleep 0.5

# Test 4: Missing resource (will 404 or proxy)
echo "4. Testing missing resource..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/missing-file.png"
sleep 0.5

# Test 5: Manifest (common miss)
echo "5. Testing manifest.json..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/manifest.json"
sleep 0.5

# Test 6: Favicon (common miss)
echo "6. Testing favicon.ico..."
curl -s -o /dev/null -w "Status: %{http_code}\n" "$BASE_URL/favicon.ico"
sleep 0.5

echo ""
echo "Test complete! Check the debug server output to see the logged requests."
echo "Press Ctrl+C in the server terminal to see the summary."
