#!/usr/bin/env node
/**
 * session-guard.js — coordinación entre sesiones de agente sobre el mismo repo.
 *
 * No pretende ser un lock de kernel: es un protocolo cooperativo con estado en
 * `.session/locks.json`. Sirve para que dos sesiones NO se pisen y dejen aviso.
 *
 * Uso:
 *   node tools/session-guard.js status
 *   node tools/session-guard.js claim <path> --task t44 --reason "censo X-APE-AI"
 *   node tools/session-guard.js release <path>
 *   node tools/session-guard.js check <path...>        # exit 1 si otro lo tiene
 *   node tools/session-guard.js heartbeat --note "texto"
 *   node tools/session-guard.js guard <path...>         # check + heartbeat
 *
 * Owner: --owner <id> | env DSH_SESSION_ID | 'dsh-lead'
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIR = path.join(ROOT, '.session');
const LOCKS = path.join(DIR, 'locks.json');
const args = process.argv.slice(2);
const cmd = args[0] || 'status';

function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
function positional() {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) { i++; continue; }
    out.push(args[i]);
  }
  return out;
}
const OWNER = arg('owner', process.env.DSH_SESSION_ID || 'dsh-lead');
const now = () => new Date().toISOString();

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(LOCKS)) fs.writeFileSync(LOCKS, JSON.stringify({ locks: [], sessions: {} }, null, 2));
}
function read() {
  ensure();
  try { return JSON.parse(fs.readFileSync(LOCKS, 'utf8')); }
  catch (e) { return { locks: [], sessions: {} }; }
}
function write(db) {
  ensure();
  db.updatedAt = now();
  fs.writeFileSync(LOCKS, JSON.stringify(db, null, 2));
}
function norm(p) {
  return path.relative(ROOT, path.resolve(ROOT, p)).replace(/\\/g, '/');
}
function covered(file, lockPath) {
  file = norm(file); lockPath = norm(lockPath);
  if (file === lockPath) return true;
  if (lockPath.endsWith('/**') || lockPath.endsWith('/*')) {
    const base = lockPath.replace(/\*\*?$/, '');
    return file.startsWith(base);
  }
  return file.startsWith(lockPath.replace(/\/$/, '') + '/');
}

function cmdStatus() {
  const db = read();
  console.log('=== LOCKS ===');
  if (!db.locks.length) console.log('  (ninguno)');
  for (const l of db.locks) {
    console.log(`  ${l.path}  ← ${l.owner}  [${l.task || '-'}]  desde ${l.since}`);
    if (l.reason) console.log(`      motivo: ${l.reason}`);
  }
  console.log('\n=== SESIONES (heartbeat) ===');
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json') && f !== 'locks.json') : [];
  if (!files.length) console.log('  (sin heartbeats)');
  for (const f of files) {
    const s = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const age = Math.round((Date.now() - Date.parse(s.at)) / 1000);
    console.log(`  ${s.owner}  ${s.at}  (${age}s)  cwd=${s.cwd}`);
    if (s.note) console.log(`      nota: ${s.note}`);
    if (s.modified && s.modified.length) console.log('      modificados: ' + s.modified.slice(0, 12).join(', ') + (s.modified.length > 12 ? ` … (+${s.modified.length - 12})` : ''));
  }
  console.log('\n=== CONFLICTOS POSIBLES ===');
  const sess = files.map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  let conflicts = 0;
  for (const s of sess) {
    if (s.owner === OWNER) continue;
    const age = (Date.now() - Date.parse(s.at)) / 1000;
    if (age > 900) continue; // heartbeat rancia (>15 min) no cuenta
    for (const m of (s.modified || [])) {
      for (const l of db.locks) {
        if (l.owner !== s.owner && covered(m, l.path)) { console.log(`  ${m} ← tocado por ${s.owner}, bloqueado por ${l.owner}`); conflicts++; }
      }
    }
  }
  if (!conflicts) console.log('  (ninguno detectado)');
}
function cmdClaim() {
  const p = positional()[0];
  if (!p) { console.error('falta <path>'); process.exit(2); }
  const db = read();
  db.locks = db.locks.filter(l => norm(l.path) !== norm(p));
  db.locks.push({ path: norm(p), owner: OWNER, task: arg('task', ''), reason: arg('reason', ''), since: now() });
  write(db);
  console.log(`claim OK: ${norm(p)} ← ${OWNER}`);
}
function cmdRelease() {
  const p = positional()[0];
  if (!p) { console.error('falta <path>'); process.exit(2); }
  const db = read();
  const before = db.locks.length;
  db.locks = db.locks.filter(l => !(norm(l.path) === norm(p) && l.owner === OWNER));
  write(db);
  console.log(before === db.locks.length ? `no había lock de ${OWNER} en ${norm(p)}` : `release OK: ${norm(p)}`);
}
function cmdCheck() {
  const db = read();
  const targets = positional();
  if (!targets.length) { console.log('nada que comprobar'); return 0; }
  let bad = 0;
  for (const t of targets) {
    for (const l of db.locks) {
      if (l.owner !== OWNER && covered(t, l.path)) {
        console.error(`BLOQUEADO: ${norm(t)} ← ${l.owner} [${l.task || '-'}] ${l.reason || ''}`);
        bad++;
      }
    }
  }
  if (bad) { console.error(`\n${bad} conflicto(s). No escribas: espera, o reclama el archivo en COORDENADAS_SESIONES.md.`); process.exit(1); }
  console.log('check OK: ningún lock ajeno cubre esos paths');
  return 0;
}
function cmdHeartbeat() {
  ensure();
  const { execSync } = require('child_process');
  let modified = [];
  try {
    const out = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    modified = out.split('\n').map(l => l.slice(3).trim()).filter(Boolean).slice(0, 80);
  } catch (e) { /* repo sin git */ }
  const s = { owner: OWNER, at: now(), cwd: ROOT, pid: process.pid, note: arg('note', ''), modified };
  fs.writeFileSync(path.join(DIR, OWNER + '.json'), JSON.stringify(s, null, 2));
  console.log(`heartbeat: ${OWNER} @ ${s.at} (${modified.length} archivos modificados en git)`);
}
function cmdGuard() {
  const rc = (() => { try { cmdCheck(); return 0; } catch (e) { return 1; } })();
  if (rc) process.exit(rc);
  cmdHeartbeat();
}

switch (cmd) {
  case 'status': cmdStatus(); break;
  case 'claim': cmdClaim(); break;
  case 'release': cmdRelease(); break;
  case 'check': process.exit(cmdCheck()); break;
  case 'heartbeat': cmdHeartbeat(); break;
  case 'guard': cmdGuard(); break;
  default:
    console.error('comandos: status | claim <path> | release <path> | check <path...> | heartbeat | guard <path...>');
    process.exit(2);
}
