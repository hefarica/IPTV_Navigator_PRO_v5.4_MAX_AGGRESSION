#!/usr/bin/env node
/**
 * external-claim.js — coordinación sobre recursos FUERA del repo.
 *
 * POR QUÉ EXISTE
 * `tools/session-guard.js` resuelve rutas relativas al `cwd` del repo. Pero el trabajo real de
 * Desktop Commander en la sesión 2026-11-07 ocurre en `C:\Users\HFRC\Downloads`:
 *   - `APE_M3U8_LAB_v8_FIXED.xlsm`  ← SSOT del pipeline LAB -> JSON -> lista
 *   - `APE_LISTA_*.m3u8` (~300 salidas, las nuevas de 1,29 GB)
 * y sobre el DEVICE ADB. Ninguno de esos vive en el repo, así que `session-guard.js` no los ve
 * y dos sesiones pueden escribir el mismo .xlsm sin enterarse. Excel abre el archivo en exclusiva:
 * el segundo que llegue corrompe el primero (ver skill `iptv-excel-safe-mode`, regla 1).
 *
 * CUATRO CAPAS DE SEÑAL (ninguna sola basta)
 *   1. `.session/external-claims.json`   estado máquina, con TTL y heartbeat
 *   2. `<recurso>.APE_LOCK`              marca física junto al recurso, la ve cualquiera que liste el dir
 *   3. `COORDENADAS_SESIONES.md`         ledger humano que el repo ya declara "leer primero"
 *   4. `docs/coordination/README.md`     tablero legible + cómo reclamar
 *
 * DISEÑO: cooperativo, no kernel-lock. Un TTL vencido NO se renueva solo: se reporta STALE y
 * exige --force con motivo, igual que la doctrina de locks del repo.
 *
 * Uso:
 *   node tools/coord/external-claim.js status
 *   node tools/coord/external-claim.js claim lab   --task apk-align --reason "auditoria SSOT" [--ttl 120]
 *   node tools/coord/external-claim.js claim lists --task ...
 *   node tools/coord/external-claim.js claim adb   --task ...
 *   node tools/coord/external-claim.js release lab
 *   node tools/coord/external-claim.js check lab        # exit 1 si otro lo tiene vivo
 *   node tools/coord/external-claim.js heartbeat --note "sigo leyendo hoja 6"
 *
 * Owner: --owner <id> | env DSH_SESSION_ID | 'dsh-lead'
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT  = process.env.APE_REPO_ROOT || process.cwd();
const DIR   = path.join(ROOT, '.session');
const STORE = path.join(DIR, 'external-claims.json');

const args = process.argv.slice(2);
const cmd  = args[0] || 'status';

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
const TTL   = parseInt(arg('ttl', '90'), 10);   // minutos

// ── Registro de recursos externos (explícito: sin comodines silenciosos) ────────
const HOME = os.homedir();
const RESOURCES = {
  lab: {
    label: 'LAB SSOT (.xlsm) — Excel lo abre en EXCLUSIVA',
    glob: path.join(HOME, 'Downloads', 'APE_M3U8_LAB_v8_FIXED.xlsm'),
    marker: path.join(HOME, 'Downloads', 'APE_M3U8_LAB_v8_FIXED.xlsm.APE_LOCK'),
    writes: false,
    why: 'skill iptv-excel-safe-mode regla 1: dos COM sobre el mismo libro = corrupción'
  },
  lists: {
    label: 'Salidas APE_LISTA_*.m3u8 en Downloads',
    glob: path.join(HOME, 'Downloads', 'APE_LISTA_*.m3u8'),
    marker: path.join(HOME, 'Downloads', '.APE_LISTS.APE_LOCK'),
    writes: false,
    why: 'regenerar una lista mientras otra sesión la lee produce una lectura truncada'
  },
  adb: {
    label: 'Device ADB (install/validate de la APK)',
    glob: null,
    marker: path.join(DIR, 'ADB.APE_LOCK'),
    writes: true,
    why: 'un install/am start concurrente reinicia el agente bajo los pies del otro'
  }
};

function now() { return Date.now(); }
function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch { return { claims: {}, sessions: {}, updatedAt: null }; }
}
function save(db) {
  db.updatedAt = new Date().toISOString();
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(db, null, 2) + '\n');
}
function mins(ms) { return Math.round(ms / 60000); }

function markerWrite(res, claim) {
  if (!res.marker) return null;
  try {
    fs.mkdirSync(path.dirname(res.marker), { recursive: true });
    fs.writeFileSync(res.marker, [
      'APE_LOCK — NO TOCAR mientras esta marca exista',
      `recurso : ${res.glob || res.label}`,
      `owner   : ${claim.owner}`,
      `task    : ${claim.task || '-'}`,
      `reason  : ${claim.reason || '-'}`,
      `desde   : ${claim.since}`,
      `expira  : ${claim.expires}`,
      '',
      `por que: ${res.why}`,
      'liberar : node tools/coord/external-claim.js release ' + claim.key,
      'estado  : node tools/coord/external-claim.js status'
    ].join('\n') + '\n');
    return res.marker;
  } catch (e) { return { error: e.message }; }
}
function markerRemove(res) {
  if (!res.marker) return null;
  try { if (fs.existsSync(res.marker)) { fs.unlinkSync(res.marker); return 'removed'; } return 'absent'; }
  catch (e) { return 'error: ' + e.message; }
}

// ── status ────────────────────────────────────────────────────────────────────
if (cmd === 'status') {
  const db = load();
  console.log('=== RECURSOS EXTERNOS (fuera del repo) ===');
  for (const key of Object.keys(RESOURCES)) {
    const r = RESOURCES[key];
    const c = db.claims[key];
    let state = 'LIBRE';
    if (c) {
      const left = (Date.parse(c.expires) - now()) / 60000;
      state = left > 0 ? `TOMADO por ${c.owner} (${Math.round(left)} min restantes)`
                       : `STALE — ${c.owner} expiró hace ${Math.abs(Math.round(left))} min`;
    }
    const marker = r.marker && fs.existsSync(r.marker) ? 'marca SI' : 'marca no';
    console.log(`  ${key.padEnd(6)} ${state.padEnd(52)} ${marker}`);
    console.log(`         ${r.label}`);
    if (c && c.reason) console.log(`         motivo: ${c.reason}`);
  }
  console.log('\n=== ESCRITURA ===');
  console.log('  "writes": false significa SOLO LECTURA para quien reclama; el dueño del recurso');
  console.log('  (el operador / Desktop Commander) puede escribir. Reclamar NO autoriza a escribir.');
  console.log('\n=== SESIONES (heartbeat externo) ===');
  const ss = Object.entries(db.sessions || {});
  if (!ss.length) console.log('  (ninguna)');
  for (const [id, s] of ss) {
    console.log(`  ${id}  ${s.at}  (${mins(now() - Date.parse(s.at))} min)  ${s.note || ''}`);
  }
  process.exit(0);
}

// ── heartbeat ─────────────────────────────────────────────────────────────────
if (cmd === 'heartbeat') {
  const db = load();
  db.sessions = db.sessions || {};
  db.sessions[OWNER] = { at: new Date().toISOString(), note: arg('note', '') };
  save(db);
  console.log(`heartbeat: ${OWNER}`);
  process.exit(0); // exit-ok: rama heartbeat, salida exitosa explicita del subcomando
}

// ── claim ─────────────────────────────────────────────────────────────────────
if (cmd === 'claim') {
  const key = positional()[0];
  const r = RESOURCES[key];
  if (!r) { console.error(`recurso desconocido: ${key}. Validos: ${Object.keys(RESOURCES).join(', ')}`); process.exit(2); }

  const db = load();
  const c = db.claims[key];
  const force = args.includes('--force');
  if (c) {
    const left = (Date.parse(c.expires) - now()) / 60000;
    if (left > 0 && c.owner !== OWNER) {
      console.error(`RECHAZADO: "${key}" lo tiene ${c.owner} (${Math.round(left)} min restantes).`);
      console.error(`  motivo: ${c.reason || '-'}`);
      console.error('  espera, coordina, o usa --force con --reason explicando por que.');
      process.exit(1);
    }
    if (left <= 0 && !force) {
      console.error(`RECHAZADO: "${key}" tiene un claim STALE de ${c.owner} (expiró hace ${Math.abs(Math.round(left))} min).`);
      console.error('  El TTL vencido NO se renueva solo. Usa --force --reason "..." si asumes el riesgo.');
      process.exit(1);
    }
  }
  const since = new Date();
  const claim = {
    key, owner: OWNER,
    task: arg('task', '-'),
    reason: arg('reason', ''),
    since: since.toISOString(),
    expires: new Date(since.getTime() + TTL * 60000).toISOString(),
    writes: r.writes
  };
  db.claims[key] = claim;
  db.sessions = db.sessions || {};
  db.sessions[OWNER] = { at: since.toISOString(), note: claim.reason };
  save(db);
  const m = markerWrite(r, claim);
  console.log(`CLAIM OK  ${key}  owner=${OWNER}  ttl=${TTL}min${force ? '  (FORCE)' : ''}`);
  if (m && typeof m === 'string') console.log(`  marca fisica: ${m}`);
  else if (m && m.error) console.log(`  AVISO: no se pudo escribir la marca (${m.error}) — el estado maquina basta`);
  process.exit(0);
}

// ── release ───────────────────────────────────────────────────────────────────
if (cmd === 'release') {
  const key = positional()[0];
  const r = RESOURCES[key];
  if (!r) { console.error(`recurso desconocido: ${key}`); process.exit(2); }
  const db = load();
  const c = db.claims[key];
  if (!c) { console.log(`"${key}" ya estaba libre`); process.exit(0); }
  if (c.owner !== OWNER && !args.includes('--force')) {
    console.error(`RECHAZADO: "${key}" lo tiene ${c.owner}, no tu. Usa --force solo si sabes que murio.`);
    process.exit(1);
  }
  delete db.claims[key];
  save(db);
  const m = markerRemove(r);
  console.log(`RELEASE OK  ${key}${m ? '  marca=' + m : ''}`);
  process.exit(0);
}

// ── check ─────────────────────────────────────────────────────────────────────
if (cmd === 'check') {
  const keys = positional();
  const db = load();
  let bad = 0;
  for (const key of keys) {
    const c = db.claims[key];
    if (!c) { console.log(`${key}: LIBRE`); continue; }
    const left = (Date.parse(c.expires) - now()) / 60000;
    if (left > 0 && c.owner !== OWNER) { console.log(`${key}: OCUPADO por ${c.owner}`); bad = 1; }
    else if (left <= 0)               { console.log(`${key}: STALE (${c.owner})`); bad = 1; }
    else                              { console.log(`${key}: tuyo`); }
  }
  process.exit(bad);
}

console.error(`comando no reconocido: ${cmd}`);
console.error('usa: status | claim <recurso> | release <recurso> | check <recursos...> | heartbeat');
process.exit(2);
