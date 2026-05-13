#!/usr/bin/env python3
"""Patch finalize_upload.php to add the audit auto-trigger hook."""
import re

TARGET = '/var/www/html/finalize_upload.php'

with open(TARGET, 'r') as f:
    content = f.read()

# Remove any broken hook
marker = '// AUTO-AUDIT'
idx = content.find(marker)
if idx > 0:
    # Also remove the separator line before it
    sep_idx = content.rfind('// ===', 0, idx)
    if sep_idx > 0:
        content = content[:sep_idx].rstrip() + "\n"
    else:
        content = content[:idx].rstrip() + "\n"

# The correct hook
HOOK = '''
// ═══════════════════════════════════════════════════════════════
// AUTO-AUDIT: Fire credential audit when channels_map.json or .m3u8 uploaded
// ═══════════════════════════════════════════════════════════════
if (strpos($filename, 'channels_map') !== false || strpos($filename, '.m3u8') !== false) {
    $auditScript = __DIR__ . '/audit_credentials_vps.py';
    if (is_file($auditScript)) {
        $auditCmd = 'python3 ' . escapeshellarg($auditScript) . ' 2>&1';
        $auditOutput = shell_exec($auditCmd);
        $auditResult = @json_decode($auditOutput, true);
        if ($auditResult) {
            file_put_contents(
                __DIR__ . '/audit_report.json',
                json_encode($auditResult, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );
            error_log('[AUDIT] Auto-audit triggered by upload of ' . $filename . ' - Status: ' . ($auditResult['status'] ?? 'unknown'));
        }
    }
}
'''

content = content.rstrip() + "\n" + HOOK + "\n"

with open(TARGET, 'w') as f:
    f.write(content)

print('OK - Hook added successfully')
