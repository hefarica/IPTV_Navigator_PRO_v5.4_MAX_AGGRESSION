#!/bin/bash
# Test finalize endpoint

echo '{"upload_id":"fulltest_001","filename":"test.m3u8"}' > /tmp/finalize.json
cat /tmp/finalize.json
echo ""
echo "Testing finalize..."
curl -s -X POST http://localhost/finalize_upload.php \
  -H 'Content-Type: application/json' \
  -d @/tmp/finalize.json
echo ""
