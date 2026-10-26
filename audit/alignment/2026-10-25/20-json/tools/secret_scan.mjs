#!/usr/bin/env node
// Secret / credential / signed-URL scanner for JSON artifacts.
// Reports KEY NAMES, PATH LOCATIONS and COUNTS only. NEVER prints values.
import fs from 'node:fs';

const files = process.argv.slice(2);
const SECRET_KEYS = /^(password|pass|passwd|pwd|token|access_token|refresh_token|secret|client_secret|api_key|apikey|api_secret|username|user|auth|authorization|credential|credentials|cookie|session_id|private_key|key)$/i;
const SIGNED_PARAM_RE = /(?:^|[?&])(hdnts|token|expires|exp|signature|sig|auth_key|hmac|md5|st|e|X-Amz-Signature|Policy|Key-Pair-Id)=/i;
const USERINFO_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s]+:[^/@\s]+@/i;
const JWT_RE = /^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/;
const LONGHEX_RE = /\b[a-f0-9]{32,}\b/i;

const report = {};
for (const f of files) {
  const st = fs.statSync(f);
  const raw = fs.readFileSync(f);
  let doc = null, parse = 'ok';
  try { doc = JSON.parse(raw.toString('utf8')); } catch (e) { parse = 'FAIL:' + e.message.slice(0, 80); }
  const r = {
    bytes: st.size, mtime: st.mtime.toISOString(), parse,
    secret_key_hits: {},            // keyName -> count
    secret_key_paths: [],           // first 12 JSON paths (no values)
    value_userinfo: [],             // paths whose value embeds user:pass@ (no value)
    signed_url_paths: [],           // paths whose value carries a signed param (param names only)
    signed_param_counts: {},        // param -> count
    jwt_value_paths: [], bearer_paths: [], longhex_paths: [],
    url_hosts: {},                  // host -> count  (hosts are not secrets)
  };
  const walk = (node, path, depth) => {
    if (depth > 12 || node === null) return;
    if (Array.isArray(node)) { node.slice(0, 4000).forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1)); return; }
    if (typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (SECRET_KEYS.test(k)) {
        r.secret_key_hits[k] = (r.secret_key_hits[k] || 0) + 1;
        if (r.secret_key_paths.length < 12) r.secret_key_paths.push(p);
      }
      if (typeof v === 'string') {
        if (USERINFO_RE.test(v)) { if (r.value_userinfo.length < 12) r.value_userinfo.push(p); }
        const q = v.indexOf('?');
        if (q > -1) {
          for (const part of v.slice(q + 1).split('&')) {
            const name = part.split('=')[0];
            if (SIGNED_PARAM_RE.test('?' + part)) {
              r.signed_param_counts[name] = (r.signed_param_counts[name] || 0) + 1;
              if (r.signed_url_paths.length < 12 && !r.signed_url_paths.includes(p)) r.signed_url_paths.push(p);
            }
          }
        }
        if (/^https?:\/\//i.test(v)) {
          const host = v.replace(/^https?:\/\//i, '').split(/[/:]/)[0].toLowerCase();
          r.url_hosts[host] = (r.url_hosts[host] || 0) + 1;
        }
        if (JWT_RE.test(v) && r.jwt_value_paths.length < 12) r.jwt_value_paths.push(p);
        if (BEARER_RE.test(v) && r.bearer_paths.length < 12) r.bearer_paths.push(p);
        if (LONGHEX_RE.test(v) && v.length <= 80 && r.longhex_paths.length < 12) r.longhex_paths.push(p);
      }
      walk(v, p, depth + 1);
    }
  };
  if (doc) walk(doc, '', 0);
  // raw-text fallbacks (counts only, even when JSON is huge/invalid)
  r.raw_counts = {
    occurrences_of_password_key: (raw.toString('utf8').match(/"password"\s*:/g) || []).length,
    occurrences_of_username_key: (raw.toString('utf8').match(/"username"\s*:/g) || []).length,
    occurrences_of_token_param: (raw.toString('utf8').match(/[?&]token=/g) || []).length,
    occurrences_of_bearer: (raw.toString('utf8').match(/Bearer\s/g) || []).length,
  };
  report[f] = r;
}
console.log(JSON.stringify(report, null, 2));
if (process.env.SECRET_SCAN_OUT) fs.writeFileSync(process.env.SECRET_SCAN_OUT, JSON.stringify(report, null, 2));
