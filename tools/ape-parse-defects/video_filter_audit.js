#!/usr/bin/env node
/**
 * video_filter_audit.js — audita las cadenas `#EXTVLCOPT:video-filter=` de una lista.
 *
 * Comprueba cuatro cosas que son verificables sin ejecutar ningun reproductor:
 *
 *   V1  ESCALADOR:  la cadena contiene `w=`/`h=`/`scale=`/`zscale=...:w=`? Si no, no escala nada.
 *   V2  MINTERPOLATE: si aparece, a que fps, y con que `scd`. Cruzado con FPS-SUPREMACY del canal
 *       da el factor de interpolacion y si la deteccion de corte esta desactivada.
 *   V3  CONVENCION: los parametros usan guiones bajos (ffmpeg) o guiones (VLC)? El mismo fichero
 *       usa guiones en las opciones reales de VLC, asi que una mezcla es una inconsistencia medible.
 *   V4  GAMUT: si la cadena fija primaries/matrix, choca con el `#EXT-X-APE-HDR-PRIMARIES` del canal?
 *
 * No clasifica modulos como "existe en VLC" ni "no existe": eso exige el inventario de plugins y no
 * lo tengo. Se reporta que modulos se usan y se deja la clasificacion al llamador.
 *
 * Contrato: 0 = sin hallazgos · 4 = hay hallazgos · 5 = no se pudo leer
 *
 *   node tools/ape-parse-defects/video_filter_audit.js <lista.m3u8> [--json ruta]
 */
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const idxJson = args.indexOf('--json');
const outJson = idxJson >= 0 ? args[idxJson + 1] : null;

if (!path) {
  process.stderr.write('uso: node video_filter_audit.js <lista.m3u8> [--json ruta]\n');
  process.exit(3);
}

const cadenas = new Map();      // cadena -> ocurrencias
const modulos = new Map();      // modulo -> ocurrencias
const cruceFps = new Map();     // "fpsOrigen->fpsFiltro|scd" -> canales
const cruceGamut = new Map();   // "primaries|hdrPrimaries" -> canales
let total = 0;

/**
 * Buffer por bloque. Hace falta porque en el fichero real el `video-filter` aparece ANTES de
 * `FPS-SUPREMACY` y `HDR-PRIMARIES` dentro del mismo bloque: evaluar en el momento de leer el
 * filtro deja los cruces a `?` y hace que la comprobacion del factor de interpolacion no dispare
 * nunca. Un detector que se apaga en silencio es justo lo que este repo audita.
 */
let bloque = null;

function nuevoBloque() {
  return { fps: null, prim: null, filtros: [] };
}

/** Parte la cadena por comas de nivel superior (los parametros van con ':' no con ','). */
function partes(v) {
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function nombreModulo(trozo) {
  const i = trozo.indexOf('=');
  return (i < 0 ? trozo : trozo.slice(0, i)).trim();
}

function procesar(linea) {
  if (linea.startsWith('#EXTINF')) {
    cerrarBloque();
    bloque = nuevoBloque();
    return;
  }
  if (!bloque) bloque = nuevoBloque();

  let m;
  if ((m = /^#EXT-X-APE-FPS-SUPREMACY:(.*)$/.exec(linea))) { bloque.fps = m[1].trim(); return; }
  if ((m = /^#EXT-X-APE-HDR-PRIMARIES:(.*)$/.exec(linea))) { bloque.prim = m[1].trim(); return; }
  if (linea.startsWith('#EXTVLCOPT:video-filter=')) {
    bloque.filtros.push(linea.slice('#EXTVLCOPT:video-filter='.length).trim());
  }
}

function cerrarBloque() {
  if (!bloque || bloque.filtros.length === 0) return;
  for (const v of bloque.filtros) {
    total++;
    cadenas.set(v, (cadenas.get(v) || 0) + 1);

    const trozos = partes(v);
    for (const t of trozos) {
      const n = nombreModulo(t);
      if (n) modulos.set(n, (modulos.get(n) || 0) + 1);
    }

    // minterpolate cruzado con el fps declarado del canal
    const mini = trozos.find((t) => t.startsWith('minterpolate='));
    if (mini) {
      const fpsFiltro = (/fps=(\d+(?:\.\d+)?)/.exec(mini) || [])[1] || '?';
      const scd = (/scd=(\d+)/.exec(mini) || [])[1] || '?';
      const k = `${bloque.fps || '?'}->${fpsFiltro}|scd=${scd}`;
      cruceFps.set(k, (cruceFps.get(k) || 0) + 1);
    }

    // gamut del filtro cruzado con el declarado
    const zs = trozos.find((t) => t.startsWith('zscale=') || t.startsWith('scale='));
    if (zs) {
      const prim = (/primaries=([a-z0-9]+)/i.exec(zs) || [])[1] || null;
      if (prim) {
        const k = `${prim}|${bloque.prim || '?'}`;
        cruceGamut.set(k, (cruceGamut.get(k) || 0) + 1);
      }
    }
  }
  bloque.filtros = [];
}

/** V1: detecta si la cadena escala. */
function escala(v) {
  const t = partes(v);
  for (const trozo of t) {
    // scale=w:h  /  zscale=...:w=N  /  cualquier w= o h= como parametro
    if (/(^|:)w=\d+/.test(trozo) || /(^|:)h=\d+/.test(trozo)) return true;
    if (/^scale=/.test(trozo) && /^\d+[:-]\d+/.test(trozo.slice(6))) return true;
    if (/^zscale=/.test(trozo) && /(width|height)=/.test(trozo)) return true;
  }
  return false;
}

/** V3: convencion de los nombres de parametro. */
function convencion(v) {
  let guionBajo = 0, guion = 0;
  for (const trozo of partes(v)) {
    const cuerpo = trozo.slice(trozo.indexOf('=') + 1);
    for (const m of cuerpo.matchAll(/([A-Za-z][A-Za-z0-9_-]*)=/g)) {
      if (m[1].includes('_')) guionBajo++;
      else if (m[1].includes('-')) guion++;
    }
  }
  return { guionBajo, guion };
}

function finalizar() {
  const filas = [...cadenas.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cadena, n]) => {
      const conv = convencion(cadena);
      const mini = partes(cadena).find((t) => t.startsWith('minterpolate='));
      return {
        canales: n,
        chars: cadena.length,
        modulos: partes(cadena).map(nombreModulo),
        escala: escala(cadena),
        minterpolate_fps: mini ? (/fps=(\d+(?:\.\d+)?)/.exec(mini) || [])[1] || null : null,
        minterpolate_scd: mini ? (/scd=(\d+)/.exec(mini) || [])[1] || null : null,
        params_con_guion_bajo: conv.guionBajo,
        params_con_guion: conv.guion,
        cadena
      };
    });

  const sinEscalador = filas.filter((f) => !f.escala);
  const canalesSinEscalador = sinEscalador.reduce((s, f) => s + f.canales, 0);
  const conMinterpolate = filas.filter((f) => f.minterpolate_fps !== null);
  const canalesConMinterpolate = conMinterpolate.reduce((s, f) => s + f.canales, 0);
  const scdCero = filas.filter((f) => f.minterpolate_scd === '0');
  const canalesScdCero = scdCero.reduce((s, f) => s + f.canales, 0);

  const cruceFpsObj = {};
  for (const [k, n] of cruceFps) cruceFpsObj[k] = n;
  const cruceGamutObj = {};
  for (const [k, n] of cruceGamut) cruceGamutObj[k] = n;

  const hallazgos = [];
  if (total > 0 && sinEscalador.length === filas.length) {
    hallazgos.push({
      id: 'V1',
      severidad: 'ALTA',
      que: 'ninguna cadena escala',
      detalle: `${filas.length} cadenas, ${canalesSinEscalador} canales, cero w=/h=/scale=`,
      consecuencia: 'el TARGET-RES declarado no tiene mecanismo en este carril'
    });
  }
  if (canalesScdCero > 0) {
    hallazgos.push({
      id: 'V2',
      severidad: 'ALTA',
      que: 'minterpolate con scd=0',
      detalle: `${canalesScdCero} canales interpolan sin deteccion de cambio de escena`,
      consecuencia: 'frames sinteticos entre planos distintos: fantasma en cada corte'
    });
  }
  const factores = Object.entries(cruceFpsObj)
    .map(([k, n]) => {
      const [par, scd] = k.split('|');
      const [orig, dst] = par.split('->');
      const f = Number(dst) / Number(orig);
      return { cruce: k, canales: n, factor: Number.isFinite(f) ? f : null };
    })
    .filter((x) => x.factor !== null && x.factor > 2);
  if (factores.length) {
    hallazgos.push({
      id: 'V2b',
      severidad: 'MEDIA',
      que: 'factor de interpolacion > 2x con me=epzs',
      detalle: factores.map((f) => `${f.cruce} canales=${f.canales} factor=${f.factor}`).join(' · '),
      consecuencia: 'el estimador barato al factor mas caro'
    });
  }
  const gamutChoque = Object.entries(cruceGamutObj).filter(([k]) => {
    const [prim, hdr] = k.split('|');
    if (!hdr || hdr === '?') return false;
    return prim.toLowerCase() !== hdr.toLowerCase();
  }).map(([k, n]) => `${k} (${n} canales)`);
  if (gamutChoque.length) {
    hallazgos.push({
      id: 'V4',
      severidad: 'MEDIA',
      que: 'gamut del filtro != gamut declarado en metadata',
      detalle: gamutChoque.join(' · '),
      consecuencia: 'dos capas del mismo bloque declaran primaries distintos'
    });
  }

  const informe = {
    archivo: path,
    resumen: {
      ocurrencias: total,
      cadenas_distintas: filas.length,
      modulos_distintos: modulos.size,
      canales_sin_escalador: canalesSinEscalador,
      canales_con_minterpolate: canalesConMinterpolate,
      canales_con_scd_cero: canalesScdCero
    },
    modulos_usados: Object.fromEntries([...modulos].sort((a, b) => b[1] - a[1])),
    cruce_fps: cruceFpsObj,
    cruce_gamut: cruceGamutObj,
    cadenas: filas,
    hallazgos
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(informe, null, 2) + '\n');

  process.stderr.write(
    `\n${total} video-filter · ${filas.length} cadenas · ${modulos.size} modulos\n` +
    `  sin escalador: ${canalesSinEscalador} canales · minterpolate: ${canalesConMinterpolate} · ` +
    `scd=0: ${canalesScdCero}\n`
  );
  for (const h of hallazgos) process.stderr.write(`  [${h.id}/${h.severidad}] ${h.que}\n`);
  process.exit(hallazgos.length === 0 ? 0 : 4);
}

const rs = fs.createReadStream(path, { highWaterMark: 1 << 20 });
let resto = '';
rs.on('data', (d) => {
  const trozos = (resto + d.toString('utf8')).split('\n');
  resto = trozos.pop();
  for (const l of trozos) procesar(l);
});
rs.on('end', () => {
  if (resto) procesar(resto);
  cerrarBloque();
  finalizar();
});
rs.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  process.exit(5);
});
