#!/usr/bin/env node
// Addendum: (a) the two extension-less .wrangler blobs, (b) placeholder heuristics for _vps_stage.
// Masking rule: hosts and credentials are reduced to 3 chars + '***'. Values are NEVER printed.
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const SSOT = `${REPO}/IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json`;
const TARGETS = [
  'IPTV_v5.4_MAX_AGGRESSION/frontend/.wrangler/state/v3/r2/apelistv2/blobs/614147d52282ffb553e0dea375ca9c4279295d05811fc14e27b46db20b588f620000019ba90bdfb7',
  'IPTV_v5.4_MAX_AGGRESSION/backup_master_v5.4_phantom_engine/frontend/.wrangler/state/v3/r2/apelistv2/blobs/614147d52282ffb553e0dea375ca9c4279295d05811fc14e27b46db20b588f620000019ba90bdfb7',
  'OMEGA_UPDATE/fallback_proxy_production.php',
  '.claude/settings.json',
  '_vps_stage/media/ape-ingest.sh',
  '_vps_stage/scripts/smoke.sh',
  '_vps_stage/lua/ape_caps.lua',
  '_vps_stage/tests/fanout_concurrency.sh',
  'docs/CDN_REWRAP_WIRING.md',
  'stream_health_monitor.sh',
  'IPTV_v5.4_MAX_AGGRESSION/backend/generate_test_m3u8.py',
  'IPTV_v5.4_MAX_AGGRESSION/backend/generate_test_m3u8.js',
  'docs/RECOVERY_CONFIG_PERSISTENCIA.md',
  'IPTV_v5.4_MAX_AGGRESSION/backend/health/config_retry.json',
  'IPTV_v5.4_MAX_AGGRESSION/backend/health/config.example.json',
  'IPTV_v5.4_MAX_AGGRESSION/lab-vba/extension/fixture_mini.json',
];
const OUT = `${REPO}/audit/alignment/2026-10-25/80-seguridad/tools/credential_addendum.json`;

const XTREAM = /https?:\/\/[^/\s"'<>]+\/live\/([^/\s"'<>]+)\/([^/\s"'<>]+)\/(\d+)\.(?:m3u8|ts)/g;
const URLINFO = /([a-z][a-z0-9+.-]*:\/\/)([^/@"'\s:]{1,80}):([^/@"'\s]{1,80})@/gi;
const mask3 = (s) => (typeof s === 'string' && s.length > 3 ? s.slice(0, 3) + '***' : s === '' ? '' : '***');
const PLACEHOLDER = /^(user|username|pass|password|demo|test|example|foo|bar|abc|123|xxx|your[_-]?\w*|change[_-]?me|user1|admin)$/i;

// SSOT pair set
const ssotPairs = new Set();
{
  const dec = new TextDecoder('utf8');
  const fd = fs.openSync(SSOT, 'r'); const buf = Buffer.alloc(8 * 1024 * 1024); let carry = ''; let n;
  const scan = (s) => { for (const m of s.matchAll(XTREAM)) ssotPairs.add(`${m[1]}\u0000${m[2]}`); };
  while ((n = fs.readSync(fd, buf, 0, buf.length)) > 0) { const s = carry + dec.decode(buf.subarray(0, n), { stream: true }); const cut = Math.max(0, s.length - 512); scan(s.slice(0, cut)); carry = s.slice(cut); }
  scan(carry); fs.closeSync(fd);
}

function classify(r) {
  if (r.pairs_matching_ssot > 0) return 'SSOT_CREDENTIALS';
  if (r.xtream_urls > 0 && r.placeholder_like_pairs === r.distinct_pairs) return 'PLACEHOLDER_LIKE';
  if (r.xtream_urls > 0) return 'NON_SSOT_CREDENTIALS';
  if (r.url_userinfo > 0) return r.placeholder_like_userinfo === r.url_userinfo ? 'PLACEHOLDER_USERINFO' : 'USERINFO_NON_SSOT';
  return 'NONE';
}

const rows = [];
for (const rel of TARGETS) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) { rows.push({ path: rel, status: 'ABSENT_IN_WORKTREE' }); continue; }
  const st = fs.statSync(abs);
  let text;
  try { text = fs.readFileSync(abs, 'latin1'); } catch { rows.push({ path: rel, status: 'UNREADABLE', bytes: st.size }); continue; }
  const pairs = new Set(), hosts = new Set(); let xtream = 0, urlinfo = 0, placeholderUserinfo = 0, placeholderPairs = 0, ssotMatch = 0, sameUserPass = 0;
  for (const m of text.matchAll(XTREAM)) { xtream++; const p = `${m[1]}\u0000${m[2]}`; pairs.add(p); hosts.add(m[1].toLowerCase()); if (PLACEHOLDER.test(m[1]) || PLACEHOLDER.test(m[2])) placeholderPairs++; if (m[1] === m[2]) sameUserPass++; if (ssotPairs.has(p)) ssotMatch++; }
  for (const m of text.matchAll(URLINFO)) { urlinfo++; if (PLACEHOLDER.test(m[2]) || PLACEHOLDER.test(m[3]) || /\$\{|\$[A-Z_]+|%[A-Z_]+%/.test(m[2] + m[3])) placeholderUserinfo++; }
  rows.push({
    path: rel, bytes: st.size, xtream_urls: xtream, url_userinfo: urlinfo,
    distinct_pairs: pairs.size, distinct_hosts: hosts.size,
    pairs_matching_ssot: ssotMatch, placeholder_like_pairs: placeholderPairs, user_equals_pass: sameUserPass,
    placeholder_like_userinfo: placeholderUserinfo,
    hosts_masked: [...hosts].slice(0, 6).map(mask3),
    pairs_masked: [...pairs].slice(0, 5).map((p) => { const [u, pw] = p.split('\u0000'); return `${mask3(u)}/${mask3(pw)}`; }),
  });
  rows[rows.length - 1].classification = classify(rows[rows.length - 1]);
}

fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), masking: '3 chars + ***', rows }, null, 2));
console.log('written', OUT);
for (const r of rows) {
  if (r.status) { console.log(r.status, r.path); continue; }
  console.log(`${String(r.classification).padEnd(22)} xtream=${String(r.xtream_urls).padStart(6)} urlinfo=${String(r.url_userinfo).padStart(3)} pairs=${String(r.distinct_pairs).padStart(3)} hosts=${String(r.distinct_hosts).padStart(2)} ssotMatch=${String(r.pairs_matching_ssot).padStart(2)} ph=${String(r.placeholder_like_pairs).padStart(3)} hosts~${JSON.stringify(r.hosts_masked)} ${r.path}`);
}
