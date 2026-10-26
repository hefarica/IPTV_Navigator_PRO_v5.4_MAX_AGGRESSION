#!/usr/bin/env node
// Bounded credential-scope classifier for TRACKED files (read-only).
// Never prints a secret: reports path, counts, and how many (user,pass) pairs MATCH the SSOT set.
// The SSOT set is built from frontend/channels_map.json in memory and never serialized.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO = 'C:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION';
const SSOT = `${REPO}/IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json`;
const OUT = process.argv[2] || `${REPO}/audit/alignment/2026-10-25/80-seguridad/tools/credential_scope.json`;

const XTREAM = /https?:\/\/[^/\s"'<>]+\/live\/([^/\s"'<>]+)\/([^/\s"'<>]+)\/(\d+)\.(?:m3u8|ts)/g;
const JSON_PW = /"password"\s*:\s*"([^"]{3,})"/g;
const JSON_UN = /"username"\s*:\s*"([^"]{3,})"/g;
const URLINFO = /([a-z][a-z0-9+.-]*:\/\/)([^/@"'\s:]+):([^/@"'\s]+)@/gi;

// ---- 1. Build SSOT credential set (in memory only) -------------------------
const ssotPairs = new Set(), ssotHosts = new Set();
let ssotPasswords = 0, ssotUrls = 0;
{
  const dec = new TextDecoder('utf8');
  const fd = fs.openSync(SSOT, 'r');
  const buf = Buffer.alloc(8 * 1024 * 1024);
  let carry = '';
  let n;
  const scan = (s) => {
    for (const m of s.matchAll(XTREAM)) { ssotPairs.add(`${m[1]}\u0000${m[2]}`); ssotHosts.add(m[1].toLowerCase()); ssotUrls++; }
    for (const m of s.matchAll(JSON_PW)) { ssotPasswords++; }
  };
  while ((n = fs.readSync(fd, buf, 0, buf.length)) > 0) {
    const s = carry + dec.decode(buf.subarray(0, n), { stream: true });
    // keep a tail to avoid splitting matches across chunks
    const cut = Math.max(0, s.length - 512);
    scan(s.slice(0, cut));
    carry = s.slice(cut);
  }
  scan(carry);
  fs.closeSync(fd);
}

// ---- 2. Enumerate candidate tracked files (from git) ----------------------
const tracked = execSync('git ls-files', { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\n').filter(Boolean);
const CODE_EXT = /\.(php|js|mjs|cjs|py|lua|sh|json|md|ps1|txt|m3u|m3u8|conf|yml|yaml|ini|env|spec\.[a-z]+)$/i;
const EXCLUDE_DIR = /^(\.git|node_modules)\//;
const candidates = tracked.filter((f) => CODE_EXT.test(f) && !EXCLUDE_DIR.test(f));

const results = [];
let scanned = 0, skippedBig = 0;
const MAX_BYTES = 40 * 1024 * 1024;

for (const rel of candidates) {
  const abs = path.join(REPO, rel);
  let st;
  try { st = fs.statSync(abs); } catch { results.push({ path: rel, status: 'MISSING_IN_WORKTREE' }); continue; }
  if (st.size > MAX_BYTES) { skippedBig++; results.push({ path: rel, status: 'SKIPPED_GT_40MB', bytes: st.size }); continue; }
  let text;
  try { text = fs.readFileSync(abs, 'utf8'); } catch { results.push({ path: rel, status: 'UNREADABLE_AS_UTF8', bytes: st.size }); continue; }
  scanned++;
  const pairs = new Set(), hosts = new Set();
  let xtream = 0, pw = 0, un = 0, urlinfo = 0, urlinfoMasked = 0;
  for (const m of text.matchAll(XTREAM)) { xtream++; pairs.add(`${m[1]}\u0000${m[2]}`); hosts.add(m[1].toLowerCase()); }
  for (const _ of text.matchAll(JSON_PW)) pw++;
  for (const _ of text.matchAll(JSON_UN)) un++;
  for (const m of text.matchAll(URLINFO)) {
    urlinfo++;
    if (/^\$|\{\{|%[A-Z_]+%|CHANGE|EXAMPLE|PLACEHOLDER|YOUR|xxx|XXX|pass@|user:pass/i.test(m[2] + ':' + m[3])) urlinfoMasked++;
  }
  if (!xtream && !pw && !un && !urlinfo) continue;
  let matchedPairs = 0;
  for (const p of pairs) if (ssotPairs.has(p)) matchedPairs++;
  let matchedHosts = 0;
  for (const h of hosts) if (ssotHosts.has(h)) matchedHosts++;
  results.push({
    path: rel, bytes: st.size,
    counts: { xtream_urls_with_userpass: xtream, json_password_keys: pw, json_username_keys: un, url_userinfo: urlinfo },
    distinct_pairs: pairs.size,
    pairs_matching_ssot_channels_map: matchedPairs,
    distinct_hosts: hosts.size,
    hosts_matching_ssot_channels_map: matchedHosts,
    userinfo_looks_placeholder: urlinfo ? urlinfoMasked : null,
    classification: matchedPairs > 0 ? 'REAL_SSOT_CREDENTIALS' : (xtream || pw || un ? 'PRESENT_NOT_MATCHING_SSOT' : (urlinfo && urlinfoMasked === urlinfo ? 'PLACEHOLDER_ONLY' : 'URL_USERINFO_UNKNOWN')),
  });
}

const out = {
  generated_at: new Date().toISOString(),
  ssot_reference: { path: 'IPTV_v5.4_MAX_AGGRESSION/frontend/channels_map.json', password_keys: ssotPasswords, xtream_urls: ssotUrls, distinct_pairs: ssotPairs.size, distinct_hosts: ssotHosts.size, values_printed: false },
  scope: { tracked_files: tracked.length, code_like_candidates: candidates.length, scanned, skipped_gt_40mb: skippedBig, files_with_hits: results.filter((r) => r.counts).length },
  by_classification: results.filter((r) => r.classification).reduce((a, r) => { a[r.classification] = (a[r.classification] || 0) + 1; return a; }, {}),
  files: results.filter((r) => r.counts || r.status).sort((a, b) => (b.counts?.xtream_urls_with_userpass || 0) - (a.counts?.xtream_urls_with_userpass || 0)),
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('written', OUT);
console.log('SSOT distinct pairs:', ssotPairs.size, '| hosts:', ssotHosts.size, '| password keys:', ssotPasswords, '| xtream urls:', ssotUrls);
console.log('scanned', scanned, 'of', candidates.length, 'candidates; files with hits:', out.files_with_hits);
console.log('classifications:', JSON.stringify(out.by_classification));
for (const r of out.files.slice(0, 25)) {
  console.log(`${(r.classification || r.status).padEnd(26)} ${String(r.counts?.xtream_urls_with_userpass ?? '-').padStart(7)} xtream | ${String(r.counts?.json_password_keys ?? '-').padStart(6)} pw | matchedPairs=${String(r.pairs_matching_ssot_channels_map ?? '-').padStart(5)} | ${r.path}`);
}
