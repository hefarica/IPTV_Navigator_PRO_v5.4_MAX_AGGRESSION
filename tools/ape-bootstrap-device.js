#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * APE BOOTSTRAP — detecta si el APK del pipeline está en el device y lo instala.
 *
 * VERDAD QUE ESTE TOOL NO ESCONDE (AGENTS.md, truth-guard de ADB):
 *   Una URL .m3u8 NO puede instalar software en Android. Lo que sí puede:
 *     (1) adb desde un host AUTORIZADO con el device (lo que hace este tool), o
 *     (2) un agente YA instalado con Device Owner o privilegio INSTALL_PACKAGES.
 *   Sin una de las dos, lo máximo es abrir el prompt del sistema
 *   (ACTION_INSTALL_PACKAGE) y que el usuario toque "Instalar".
 *   Este tool implementa (1): es el único camino que hoy es 100 % ejecutable.
 *
 * USO
 *   node tools/ape-bootstrap-device.js --check   <serial>
 *   node tools/ape-bootstrap-device.js --install <serial>
 *   node tools/ape-bootstrap-device.js --pipeline <serial>
 *
 * serial: IP:PUERTO (ej. 192.168.1.3:5555) o el serial USB.
 * Sale con código 0 = pipeline OK / 1 = falta instalar / 2 = error.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PKG = 'com.ape.crystalagent';
const DIST = process.env.APE_DIST_URL || 'https://iptv-ape.duckdns.org/ara/version.json';

function adb(args, opts) {
  return execFileSync('adb', args, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {})).trim();
}
function tryAdb(args) { try { return adb(args); } catch (e) { return null; } }

function connect(serial) {
  if (!/:\d+$/.test(serial)) return;                    // USB: ya está
  tryAdb(['connect', serial]);
  const st = tryAdb(['-s', serial, 'get-state']);
  if (st !== 'device') throw new Error('device no alcanzable: ' + serial + ' (estado=' + st + ')');
}

function installedVersion(serial) {
  const d = tryAdb(['-s', serial, 'shell', 'dumpsys', 'package', PKG]);
  if (!d) return null;
  const m = d.match(/versionCode=(\d+)/);
  const n = d.match(/versionName=(\S+)/);
  if (!m) return null;
  return { versionCode: parseInt(m[1], 10), versionName: n ? n[1] : '?' };
}

function agentRunning(serial) {
  const p = tryAdb(['-s', serial, 'shell', 'pidof', PKG]);
  return p && /^\d+$/.test(p) ? parseInt(p, 10) : null;
}

async function dist() {
  const r = await fetch(DIST);
  if (!r.ok) throw new Error('no puedo leer ' + DIST + ' (HTTP ' + r.status + ')');
  const j = await r.json();
  if (!j.sha256 || !j.versionCode) throw new Error('version.json sin sha256/versionCode');
  return j;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(j) {
  const url = new URL(j.apk || '/ara/agent.apk', DIST).href;
  const dest = path.join(os.tmpdir(), 'ape-agent-' + j.versionCode + '.apk');
  if (fs.existsSync(dest) && sha256(dest) === j.sha256) return dest;   // idempotente
  const r = await fetch(url);
  if (!r.ok) throw new Error('descarga del APK: HTTP ' + r.status);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  const h = sha256(dest);
  if (h !== j.sha256) throw new Error('sha del APK descargado NO coincide: ' + h + ' != ' + j.sha256);
  return dest;
}

async function check(serial) {
  connect(serial);
  const d = await dist();
  const inst = installedVersion(serial);
  if (!inst) return { state: 'MISSING', dist: d, installed: null, running: null };
  const state = inst.versionCode === d.versionCode ? 'CURRENT'
    : (inst.versionCode < d.versionCode ? 'OUTDATED' : 'AHEAD');
  return { state, dist: d, installed: inst, running: agentRunning(serial) };
}

function install(serial, apk) {
  const out = tryAdb(['-s', serial, 'install', '-r', apk], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (!out || !/Success/.test(out)) throw new Error('adb install falló: ' + (out || 'sin salida'));
  return out;
}

function installedApkSha(serial) {
  const p = tryAdb(['-s', serial, 'shell', 'pm', 'path', PKG]);
  if (!p) return null;
  const remote = p.replace(/^package:/m, '').split('\n')[0].trim();
  if (!remote) return null;
  const tmp = path.join(os.tmpdir(), 'ape-installed-check.apk');
  tryAdb(['-s', serial, 'pull', remote, tmp]);
  return fs.existsSync(tmp) ? sha256(tmp) : null;
}

async function pipeline(serial) {
  const c = await check(serial);
  const log = [];
  log.push('device   : ' + serial);
  log.push('dist     : versionCode=' + c.dist.versionCode + ' sha=' + c.dist.sha256.slice(0, 16) + '…');
  log.push('instalado: ' + (c.installed ? ('versionCode=' + c.installed.versionCode + ' ' + c.installed.versionName) : 'NADA'));
  log.push('estado   : ' + c.state);

  if (c.state === 'MISSING' || c.state === 'OUTDATED') {
    const apk = await download(c.dist);
    log.push('instalar: ' + apk + ' (sha verificado)');
    log.push('adb      : ' + install(serial, apk).split('\n').pop());
    const after = await check(serial);
    log.push('tras instalar: versionCode=' + (after.installed ? after.installed.versionCode : '?') + ' estado=' + after.state);
    const s = installedApkSha(serial);
    log.push('sha en device: ' + (s ? s.slice(0, 16) + '… ' + (s === c.dist.sha256 ? 'IGUAL al publicado' : 'DISTINTO') : 'no computado'));
  }

  const run = agentRunning(serial);
  log.push('agente   : ' + (run ? 'running pid=' + run : 'NO CORRE (abrir la app una vez)'));
  log.push('');
  log.push('PIPELINE: APK ' + (c.state === 'CURRENT' ? 'ya estaba' : 'instalado') +
    ' · agente ' + (run ? 'vivo' : 'parado') +
    ' · resto del flujo (enroll /sync, wake, contrato QoE) se activa con el primer zap.');
  log.push('NO ejecutable por URL: instalar software en Android sin adb ni Device Owner.');
  return log.join('\n');
}

(async () => {
  const argv = process.argv.slice(2);
  const mode = argv.find(a => a.startsWith('--'));
  const serial = argv.find(a => !a.startsWith('--'));
  if (!mode || !serial) {
    console.error('uso: node tools/ape-bootstrap-device.js --check|--install|--pipeline <serial>');
    process.exit(2);
  }
  try {
    if (mode === '--check') {
      const c = await check(serial);
      console.log(JSON.stringify(c, null, 2));
      process.exit(c.state === 'CURRENT' ? 0 : 1);
    }
    if (mode === '--install') {
      const c = await check(serial);
      const apk = await download(c.dist);
      console.log(install(serial, apk));
      const s = installedApkSha(serial);
      console.log('sha en device: ' + (s || 'no computado') + (s === c.dist.sha256 ? '  IGUAL al publicado' : ''));
      process.exit(0);
    }
    if (mode === '--pipeline') { console.log(await pipeline(serial)); process.exit(0); }
    throw new Error('modo desconocido: ' + mode);
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(2);
  }
})();
