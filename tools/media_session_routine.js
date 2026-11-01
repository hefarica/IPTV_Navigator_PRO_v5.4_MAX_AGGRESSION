#!/usr/bin/env node
/**
 * Read-only MediaSession routine for the authorized ONN device.
 *
 * It never sends media keys, changes volume, force-stops or creates a session.
 * OTT Navigator owns the active session; this only observes it.
 *
 * Usage:
 *   node tools/media_session_routine.js --serial 192.168.1.7:5555 --samples 3 --interval 10
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const serial = arg('serial', process.env.ANDROID_SERIAL || '');
const samples = Math.max(2, Number(arg('samples', '3')));
const interval = Math.max(5, Number(arg('interval', '10')));
const outDir = path.resolve(arg('out', 'artifacts/media_session'));
const postVps = process.argv.includes('--vps');
const vpsBase = arg('vps-base', 'https://iptv-ape.duckdns.org').replace(/\/+$/, '');
const deviceId = arg('device', 'onn4k-media-session');

function adb(args) {
  const bin = process.env.ADB || 'adb';
  const full = serial ? ['-s', serial, ...args] : args;
  return execFileSync(bin, full, { encoding: 'utf8', timeout: 20000 });
}

function parseSessions(raw) {
  const out = [];
  let cur = null;
  for (const line of String(raw).split(/\r?\n/)) {
    const head = line.match(/^\s{4}(.+?)\s+([A-Za-z0-9_.]+)\/(.+?)\s+\(userId=(\d+)\)\s*$/);
    if (head) {
      if (cur) out.push(cur);
      cur = { tag: head[1], package: head[2], owner: head[3], userId: Number(head[4]) };
      continue;
    }
    if (!cur) continue;
    const m = (re) => { const x = line.match(re); return x ? x[1] : undefined; };
    if (/^\s+active=/.test(line)) cur.active = /active=true/.test(line);
    if (/^\s+state=PlaybackState/.test(line)) {
      cur.state = m(/state=([A-Z_]+)\(/);
      cur.position = Number(m(/position=(-?\d+)/));
      cur.buffered_position = Number(m(/buffered position=(-?\d+)/));
      cur.speed = Number(m(/speed=([\d.]+)/));
      cur.updated = Number(m(/updated=(\d+)/));
      cur.error = m(/error=([^,}]+)/);
    }
    if (/^\s+metadata:/.test(line)) {
      cur.metadata = line.replace(/^\s+metadata:\s*/, '').trim();
      const desc = cur.metadata.match(/(?:description|title)=([^,]+)/);
      cur.title = desc ? desc[1].trim() : (cur.metadata.split(',')[0] || '').trim();
    }
  }
  if (cur) out.push(cur);
  return out.filter(s => s.package && s.package !== 'com.android.bluetooth');
}

function snapshot() {
  const raw = adb(['shell', 'dumpsys media_session']);
  const sessions = parseSessions(raw);
  const active = sessions.filter(s => s.active === true);
  return { at: new Date().toISOString(), active, sessions };
}

async function postQoe(session, index) {
  if (!postVps || !session || !session.title) return null;
  var sid = 'ms-' + crypto.createHash('sha256').update(String(session.package) + '|' + String(session.title)).digest('hex').slice(0, 20);
  var cid = String(session.title).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'media-session';
  var payload = {
    version: '1.0',
    session_id: sid,
    device_id: deviceId,
    player: 'OTT_Navigator',
    channel: { id: cid, name: String(session.title).slice(0, 120) },
    event_type: 'quality_change',
    timestamp_ms: Date.now(),
    data: {
      position_ms: Number(session.position) || 0,
      buffered_position_ms: Number(session.buffered_position) || 0,
      media_session_state: session.state || 'unknown',
      media_session_sample: index,
      source: 'media_session_routine'
    }
  };
  try {
    var r = await fetch(vpsBase + '/prisma/api/conviva-event.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    var txt = await r.text();
    var body = {};
    try { body = JSON.parse(txt); } catch (_) { body = { raw: txt.slice(0, 120) }; }
    return { http: r.status, body: body };
  } catch (e) {
    return { http: 0, error: e && e.message ? e.message : String(e) };
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `media_session_${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  const fd = fs.openSync(file, 'a');
  const rows = [];
  for (let i = 0; i < samples; i++) {
    const s = snapshot();
    if (s.active[0]) s.qoe = await postQoe(s.active[0], i);
    fs.writeSync(fd, JSON.stringify(s) + '\n');
    rows.push(s);
    console.log(`[${s.at}] active=${s.active.length} ` + s.active.map(x => `${x.package} state=${x.state} position=${x.position} title=${x.title || ''}`).join(' | ') + (s.qoe ? ` qoe_http=${s.qoe.http}` : ''));
    if (i < samples - 1) await new Promise(r => setTimeout(r, interval * 1000));
  }
  fs.closeSync(fd);

  const first = rows[0].active[0] || null;
  const last = rows[rows.length - 1].active[0] || null;
  const problems = [];
  const warnings = [];
  if (!first || !last) problems.push('no_active_media_session');
  if (last && last.state !== 'PLAYING') problems.push('state_not_playing:' + last.state);
  if (last && !last.title) problems.push('metadata_missing');
  if (first && last && Number.isFinite(first.position) && Number.isFinite(last.position)) {
    if (last.position < first.position) problems.push('position_regressed');
    if (last.position === first.position) warnings.push('position_static_live_or_stalled');
  }
  if (last && /false/i.test(String(last.active))) problems.push('active_flag_false');
  const strict = process.argv.includes('--strict');
  if (strict && warnings.length) problems.push(...warnings);

  const summary = {
    generated_at: new Date().toISOString(),
    serial: serial || 'default',
    samples,
    interval_s: interval,
    active_package: last ? last.package : null,
    active_state: last ? last.state : null,
    active_title: last ? last.title : null,
    start_position: first ? first.position : null,
    end_position: last ? last.position : null,
    advanced: !!(first && last && last.position > first.position),
    warnings,
    strict,
    problems,
    qoe: rows.map(r => r.qoe || null),
    ok: problems.length === 0
  };
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  return summary.ok ? 0 : 1;
}

main().then(code => { process.exitCode = code; }).catch(e => {
  console.error('MEDIA_SESSION_ROUTINE_ERROR ' + (e && e.message ? e.message : e));
  process.exitCode = 2;
});
