#!/usr/bin/env node
/**
 * ape-realtime-profile-lookup.js — lookup de perfil en MEMORIA, sin I/O en el
 * camino caliente (t77).
 *
 * QUE ES Y QUE NO ES
 *   ES el MECANISMO: tabla en memoria cargada una vez, decision determinista,
 *      perfil + razon + procedencia + confianza, fail-closed honesto, recarga
 *      atomica sin reiniciar y sin bloquear.
 *   NO ES la REGLA: que firma produce que perfil lo fija la tabla de t76
 *      (`contracts/`). Este modulo NO inventa heuristicas: si no hay entrada,
 *      devuelve el perfil por defecto DECLARADO y lo dice con procedencia
 *      'default' y confianza 0.
 *
 * CONTRATO DEL APK: intacto. Este modulo no emite M3U8 ni toca `ape-profile`,
 * `#EXT-X-APE-LAB-METADATA` ni `fields.<seccion>.<clave>`. Solo devuelve un
 * objeto en memoria que el motor ya sabe consumir.
 *
 * PRESUPUESTO (t74): el contrato pide decidir en <5 ms. El tramo interno de
 * decision de t74 es <=1.000 us p50 y el de extremo a extremo <=5.000 us p99.
 * El test fija ademas un gate propio mucho mas estricto (p50 <= 50 us,
 * p95 <= 200 us) porque un lookup en memoria que tarde mas que eso significa
 * que alguien metio I/O o un JSON.parse en el camino.
 *
 * USO
 *   const lk = require('./ape-realtime-profile-lookup');
 *   const d  = lk.decide({ channel_id: '1234', telemetry: { codec: 'hvc1', height: 2160, fps: 50, hdr: 'pq' } });
 *   // -> { profile:'P3', reason:'sin_entrada', provenance:'default', confidence:0, signature:'...' }
 *
 * VARIABLES DE ENTORNO
 *   APE_PROFILE_TABLE     ruta de la tabla  (def. /var/lib/ape/realtime-profile-table.json)
 *   APE_PROFILE_DEFAULT   perfil por defecto cuando no hay tabla/entrada (def. P3)
 *   APE_PROFILE_MAX_ENTRIES  tope de entradas aceptadas (def. 200000; fail-closed si se supera)
 */
'use strict';

const fs = require('fs');

const TABLE_PATH = process.env.APE_PROFILE_TABLE || '/var/lib/ape/realtime-profile-table.json';
const DEFAULT_PROFILE = process.env.APE_PROFILE_DEFAULT || 'P3';
const MAX_ENTRIES = Number(process.env.APE_PROFILE_MAX_ENTRIES || 200000);
const VALID_PROFILE = /^P[0-9](\.[0-9])?$/;          // P0..P5 y P4.5, como el resto del motor

/* Estado: una sola referencia intercambiable = recarga atomica sin locks.
 * Los lectores concurrentes ven o la tabla vieja entera o la nueva entera,
 * nunca una a medio construir. */
let _table = Object.create(null);
let _meta = { ok: false, reason: 'sin_cargar', entries: 0, path: TABLE_PATH, loaded_at: null };
const _stats = { lookups: 0, hits: 0, defaults: 0, errors: 0, reloads: 0, last_error: null };

function logVisible(msg) {
  /* Log visible y no silencioso: el fail-closed tiene que poder diagnosticarse. */
  try { console.error('[profile-lookup] ' + msg); } catch (_) { /* nunca propaga */ }
}

function normStr(v, max) {
  if (v === undefined || v === null) { return ''; }
  const s = String(v).trim().toLowerCase();
  return s.length > (max || 64) ? s.slice(0, max || 64) : s;
}

/**
 * Firma canonica de la senal. Determinista y estable: mismo canal + misma
 * telemetria => misma cadena, en cualquier orden de claves del objeto.
 * Los campos de telemetria son los que el motor ya conoce (codec, resolucion,
 * fps, hdr); NO se inventa ninguno nuevo.
 */
function signature(channelId, telemetry) {
  const t = telemetry || {};
  return [
    normStr(channelId, 80),
    normStr(t.codec, 24),
    normStr(t.height, 8),
    normStr(t.fps, 8),
    normStr(t.hdr, 12),
  ].join('|');
}

/**
 * Carga la tabla. NUNCA lanza: cualquier fallo deja el estado anterior intacto
 * (o vacio) y se declara en _meta.reason.
 */
function loadTable() {
  try {
    const raw = fs.readFileSync(TABLE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const src = (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object')
      ? parsed.entries
      : parsed;
    if (!src || typeof src !== 'object' || Array.isArray(src)) {
      _meta = { ok: false, reason: 'tabla_sin_objeto', entries: 0, path: TABLE_PATH, loaded_at: null };
      logVisible('DECLARED_DEFAULT: ' + _meta.reason + ' en ' + TABLE_PATH + ' -> perfil ' + DEFAULT_PROFILE);
      return _meta;
    }
    const out = Object.create(null);
    let n = 0, malas = 0;
    for (const k of Object.keys(src)) {
      if (n >= MAX_ENTRIES) { malas++; continue; }
      const e = src[k];
      const prof = (typeof e === 'string') ? e : (e && e.profile);
      if (!prof || !VALID_PROFILE.test(String(prof))) { malas++; continue; }   // entrada invalida = no se usa
      out[k] = {
        profile: String(prof),
        confidence: (e && typeof e === 'object' && typeof e.confidence === 'number') ? e.confidence : 1,
        source: (e && typeof e === 'object' && e.source) ? String(e.source) : 'tabla',
      };
      n++;
    }
    _table = out;                       // swap atomico
    _meta = {
      ok: true, reason: malas ? 'ok_con_' + malas + '_invalidas' : 'ok',
      entries: n, path: TABLE_PATH, loaded_at: new Date().toISOString(),
    };
    return _meta;
  } catch (e) {
    _meta = { ok: false, reason: 'tabla_ausente_o_ilegible: ' + e.message, entries: 0, path: TABLE_PATH, loaded_at: null };
    logVisible('DECLARED_DEFAULT: ' + _meta.reason + ' -> perfil ' + DEFAULT_PROFILE);
    return _meta;
  }
}

/** Recarga sin reiniciar y sin bloquear: construye fuera y cambia la referencia. */
function reload() {
  _stats.reloads++;
  return loadTable();
}

/**
 * DECISION. Puro en memoria: no toca disco, no lanza, no consulta red.
 * @returns {{profile:string, reason:string, provenance:string, confidence:number, signature:string}}
 */
function decide(input) {
  _stats.lookups++;
  const fallback = (reason) => {
    _stats.defaults++;
    return {
      profile: DEFAULT_PROFILE, reason: reason, provenance: 'default',
      confidence: 0, signature: '',
    };
  };
  try {
    const channelId = input && input.channel_id;
    const sig = signature(channelId, input && input.telemetry);
    /* 1) entrada exacta por firma; 2) entrada por canal; 3) default declarado. */
    let hit = _table[sig];
    let via = 'firma';
    if (!hit) { hit = _table[normStr(channelId, 80)]; via = 'canal'; }
    if (!hit) { return fallback(_meta.ok ? 'sin_entrada' : ('sin_tabla:' + _meta.reason)); }
    _stats.hits++;
    return {
      profile: hit.profile,
      reason: 'tabla_' + via,
      provenance: hit.source,
      confidence: hit.confidence,
      signature: sig,
    };
  } catch (e) {
    _stats.errors++;
    _stats.last_error = e.message;
    logVisible('DECISION_ERROR: ' + e.message + ' -> perfil ' + DEFAULT_PROFILE);
    return fallback('error');
  }
}

/** Cifras para /health y para el test. Sin coste en el camino caliente. */
function stats() {
  return Object.assign({}, _stats, {
    table: _meta, default_profile: DEFAULT_PROFILE, table_path: TABLE_PATH,
  });
}

/* Precarga al arrancar: UNA lectura, fuera del camino de peticion. */
loadTable();

module.exports = {
  decide, reload, stats, signature, loadTable,
  DEFAULT_PROFILE, TABLE_PATH, VALID_PROFILE,
};
