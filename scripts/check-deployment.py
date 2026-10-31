"""Public availability checks. Never needs production credentials."""
import argparse
import json
import time
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='https://www.trypreflight.dev')
args = parser.parse_args()
base = args.base_url.rstrip('/')
results = []
for path in ['/', '/api/health']:
    started = time.monotonic()
    request = urllib.request.Request(base + path, headers={'User-Agent': 'Preflight-availability-check'})
    with urllib.request.urlopen(request, timeout=15) as response:
        body = response.read(2_097_152)
        assert response.status == 200, 'Unexpected HTTP status'
        if path == '/api/health':
            assert json.loads(body)['status'] == 'ok', 'Database availability check failed'
        else:
            assert b'PreFlight' in body, 'Expected application content not found'
    results.append({'path': path, 'status': 200, 'elapsed_ms': round((time.monotonic() - started) * 1000)})
print(json.dumps({'available': True, 'checks': results}))
