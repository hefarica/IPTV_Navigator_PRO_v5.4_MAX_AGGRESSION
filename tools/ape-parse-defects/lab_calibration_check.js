#!/usr/bin/env node
/**
 * lab_calibration_check.js — audita la tabla de calibración LAB de la cabecera.
 *
 * La lista publica, en 18 tags de cabecera, seis perfiles con sus BOUNDS (el espacio de búsqueda
 * que declara el optimizador) y sus KNOBS (el punto que terminó emitiendo). Eso es verificable
 * con aritmética y sin criterio de nadie: cada knob tiene que caer DENTRO de su propio bound.
 *
 * Un knob fuera de rango no es una opinión estética: significa que el valor emitido no está en el
 * espacio que el propio fichero declara haber explorado. O el bound está mal, o el knob no salió
 * del solver, o se aplicó un clamp posterior que el bound no refleja. En los tres casos, la tabla
 * no describe lo que se emitió.
 *
 * También reporta FITNESS por perfil, porque un fitness bajo junto a una cobertura alta de canales
 * es la combinación que importa: buen ajuste para pocos canales es normal; mal ajuste para la
 * mayoría es el hallazgo.
 *
 * Contrato de salida:
 *   0 = todos los knobs dentro de sus bounds · 4 = hay violaciones · 5 = no se pudo leer
 *
 *   node tools/ape-parse-defects/lab_calibration_check.js <lista.m3u8> [--json ruta]
 */
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const idxJson = args.indexOf('--json');
const outJson = idxJson >= 0 ? args[idxJson + 1] : null;

if (!path) {
  process.stderr.write('uso: node lab_calibration_check.js <lista.m3u8> [--json ruta]\n');
  process.exit(3);
}

/**
 * Mapa explicito knob -> bound. Cada entrada esta a la vista para que se pueda discutir:
 * si el generador renombra un knob, este mapa lo delata porque el knob queda sin bound.
 */
const KNOB_A_BOUND = {
  nudgeMaxRetry: 'nudge_retry',
  buffer_seconds: 'buffer',
  abrBandWidthFactor: 'abr_bw_factor',
  fragLoad_maxNumRetry: 'frag_retry',
  maxLiveSyncPlaybackRate: 'live_sync',
  reconnect_attempts: 'reconnect',
  live_delay_seconds: 'live_delay'
};

const perfiles = new Map();   // P0..Pn -> { nombre, fitness, solver, bounds:{}, knobs:{} }
let dna = null;
let schemaVariant = null;
let bulletproof = null;
let exportedAt = null;

function numDeClave(s) {
  // NAME="8K Master",FITNESS=0.7398,SOLVER="LHS->GA->SA->NM 0,1s"
  const out = {};
  const re = /([A-Za-z_]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) {
    out[m[1]] = m[2].startsWith('"') ? m[2].slice(1, -1) : m[2];
  }
  return out;
}

function paresDeBound(s) {
  // nudge_retry=[10,17],buffer=[105,315],...
  const out = {};
  const re = /([a-z_]+)=\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(s))) {
    const [lo, hi] = m[2].split(',').map((x) => Number(x.trim()));
    out[m[1]] = { lo, hi };
  }
  return out;
}

function paresDeKnob(s) {
  const out = {};
  for (const trozo of s.split(',')) {
    const i = trozo.indexOf('=');
    if (i < 0) continue;
    const k = trozo.slice(0, i).trim();
    const v = trozo.slice(i + 1).trim();
    const n = Number(v);
    out[k] = Number.isFinite(n) ? n : v;
  }
  return out;
}

function perfilDe(id) {
  if (!perfiles.has(id)) perfiles.set(id, { bounds: {}, knobs: {} });
  return perfiles.get(id);
}

function procesar(linea) {
  let m;
  if ((m = /^#EXT-X-APE-LAB-DNA:(.*)$/.exec(linea))) { dna = m[1].trim(); return; }
  if ((m = /^#EXT-X-APE-LAB-SCHEMA-VARIANT:(.*)$/.exec(linea))) { schemaVariant = m[1].trim(); return; }
  if ((m = /^#EXT-X-APE-LAB-BULLETPROOF:(.*)$/.exec(linea))) { bulletproof = m[1].trim(); return; }
  if ((m = /^#EXT-X-APE-LAB-EXPORTED-AT:(.*)$/.exec(linea))) { exportedAt = m[1].trim(); return; }
  if ((m = /^#EXT-X-APE-LAB-PROFILE-(P\d+):(.*)$/.exec(linea))) {
    const d = numDeClave(m[2]);
    const p = perfilDe(m[1]);
    p.nombre = d.NAME;
    p.role = d.ROLE;
    p.fitness = d.FITNESS === undefined ? null : Number(d.FITNESS);
    p.solver = d.SOLVER;
    p.timestamp = d.TIMESTAMP;
    return;
  }
  if ((m = /^#EXT-X-APE-LAB-BOUNDS-(P\d+):(.*)$/.exec(linea))) {
    Object.assign(perfilDe(m[1]).bounds, paresDeBound(m[2]));
    return;
  }
  if ((m = /^#EXT-X-APE-LAB-KNOBS-(P\d+):(.*)$/.exec(linea))) {
    Object.assign(perfilDe(m[1]).knobs, paresDeKnob(m[2]));
    return;
  }
}

function finalizar() {
  const violaciones = [];
  const sinBound = [];
  const filas = [];

  for (const [id, p] of [...perfiles].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [knob, valor] of Object.entries(p.knobs)) {
      const nombreBound = KNOB_A_BOUND[knob];
      if (!nombreBound) { sinBound.push({ perfil: id, knob }); continue; }
      const b = p.bounds[nombreBound];
      if (!b) { sinBound.push({ perfil: id, knob, motivo: 'el bound ' + nombreBound + ' no existe' }); continue; }
      if (typeof valor !== 'number') continue;
      if (valor < b.lo || valor > b.hi) {
        violaciones.push({
          perfil: id,
          knob,
          valor,
          bound: nombreBound,
          rango: [b.lo, b.hi],
          exceso: valor < b.lo ? valor - b.lo : valor - b.hi,
          direccion: valor < b.lo ? 'por debajo del minimo' : 'por encima del maximo'
        });
      }
    }
    filas.push({
      perfil: id,
      nombre: p.nombre,
      fitness: p.fitness,
      solver: p.solver,
      knobs: Object.keys(p.knobs).length,
      bounds: Object.keys(p.bounds).length
    });
  }

  const total = violaciones.length;
  const informe = {
    archivo: path,
    cabecera: { dna, schemaVariant, bulletproof, exportedAt },
    perfiles: filas,
    violaciones,
    knobs_sin_bound: sinBound,
    resumen: { perfiles: filas.length, violaciones: total, knobs_sin_bound: sinBound.length }
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');

  process.stderr.write(`\n${filas.length} perfiles LAB · ${total} knob(s) fuera de su bound\n`);
  for (const v of violaciones) {
    process.stderr.write(
      `  ${v.perfil} ${v.knob}=${v.valor} fuera de ${v.bound}=[${v.rango[0]},${v.rango[1]}] (${v.direccion}, ${v.exceso.toFixed(4)})\n`
    );
  }
  process.exit(total === 0 ? 0 : 4);
}

const rs = fs.createReadStream(path, { highWaterMark: 1 << 20 });
let resto = '';
let hechos = 0;
rs.on('data', (d) => {
  const trozos = (resto + d.toString('utf8')).split('\n');
  resto = trozos.pop();
  for (const l of trozos) {
    procesar(l);
    // La cabecera termina en el primer #EXTINF. Se sigue leyendo por si un fichero
    // repite la tabla por canal, pero se corta al acumular 100 bloques para no
    // recorrer 604 MB cuando ya no hay nada nuevo que aprender.
    if (l.startsWith('#EXTINF') && ++hechos > 100) { rs.destroy(); return; }
  }
});
rs.on('close', finalizar);
rs.on('end', finalizar);
rs.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  process.exit(5);
});
