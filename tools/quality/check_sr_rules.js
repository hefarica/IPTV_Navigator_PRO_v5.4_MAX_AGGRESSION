#!/usr/bin/env node
'use strict';

/**
 * check_sr_rules.js — Gate de DECLARACIONES de superresolucion.
 *
 * Fuente de las reglas: contracts/super_resolution_rules.json
 * Esa fuente es una relectura aplicada del glosario de superresolucion de
 * Ultralytics (tier 3: solo referencia, implementado desde cero).
 *
 * QUE VALIDA: lo que la metadata AFIRMA.
 * QUE NO VALIDA: los pixeles. Un gate que lee texto no mide una imagen. Se dice.
 *
 * Lee en STREAMING: hay listas de 1,3 GB que no caben como string en V8
 * (~512 MB). Cargarlas con readFileSync revienta con ERR_STRING_TOO_LONG.
 *
 * Exit: 0 = sin violaciones · 1 = violaciones · 2 = no computable
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONTRACT = path.join(__dirname, '..', '..', 'contracts', 'super_resolution_rules.json');

const target = process.argv[2];
if (!target) {
  console.error('uso: node tools/quality/check_sr_rules.js <lista.m3u8|metadata.json>');
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error(`NO COMPUTADO: no existe ${target}`);
  process.exit(2);
}

let contrato;
try {
  contrato = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
} catch (e) {
  console.error(`NO COMPUTADO: contrato ilegible (${CONTRACT}): ${e.message}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Detectores. Cada regla se expresa como una funcion pura sobre una linea.
// Se derivan del contrato para que el JSON siga siendo la unica fuente.
// ---------------------------------------------------------------------------
const tiene = (linea, agujas) => agujas.some((a) => linea.includes(a));

const CHECKS = {
  // SR-R1: superresolucion sin modelo de degradacion declarado.
  // Preciso: un FALLBACK declara a que se recurre si el modelo falla, es decir
  // afirma que la superresolucion NO se aplica. Que dispare aqui seria castigar
  // la declaracion mas honesta del fichero.
  'SR-R1': (l) => {
    if (!tiene(l, ['APE-AI-SR', 'APE-SUPER-RESOLUTION', 'SUPER_RESOLUTION'])) return null;
    if (l.includes('FALLBACK')) return null;
    if (l.includes('DEGRADATION=')) return null;
    if (/STATE=(DECLARED|NO_COMPUTADO)/.test(l)) return null;
    return 'declara superresolucion sin DEGRADATION= ni STATE=DECLARED|NO_COMPUTADO';
  },
  // SR-R2: metrica perceptual sin referencia. En IPTV el original no existe.
  // Preciso: dispara con una AFIRMACION (valor numerico, TARGET, SCORE), no con
  // el nombre de una estrategia. `VMAF-MAXIMIZATION-ENABLED` es como se llama
  // un modo; `VMAF-TARGET:95.0` y `EPSNR=45` son valores que alguien afirma.
  // Un gate que confunde las dos cosas se desactiva en una semana.
  'SR-R2': (l) => {
    if (!tiene(l, ['PSNR', 'SSIM', 'VMAF', 'LPIPS'])) return null;
    if (l.includes('REFERENCE=') || l.includes('REF=')) return null;
    const afirmaValor = /(?:=|:)\s*-?\d/.test(l) || /\b(TARGET|SCORE|AVG|MEAN)\b/i.test(l);
    if (!afirmaValor) return null;
    return 'afirma un valor perceptual (PSNR/SSIM/VMAF/LPIPS) sin REFERENCE= ni REF=';
  },
  // SR-R3: detalle sintetizado etiquetado como fuente.
  'SR-R3': (l) => {
    if (!tiene(l, ['APE-AI-SR', 'SUPER_RESOLUTION', 'REALESRGAN', 'ESRGAN'])) return null;
    if (!/(CLASS|ROLE|ORIGIN)=SOURCE/.test(l)) return null;
    return 'etiqueta superresolucion como SOURCE (el detalle es sintetizado, no capturado)';
  },
  // SR-R4: interpolacion etiquetada como superresolucion.
  // Preciso: un FALLBACK declara a que se recurre si el modelo falla; nombrar
  // BICUBIC como fallback es honesto y NO es etiquetarlo como superresolucion.
  'SR-R4': (l) => {
    if (!tiene(l, ['LANCZOS', 'BICUBIC', 'BILINEAR'])) return null;
    if (l.includes('FALLBACK')) return null;          // declarar el fallback es correcto
    if (!tiene(l, ['SUPER_RESOLUTION', 'APE-AI-SR'])) return null;
    // `APE-AI-SR-FALLBACK` ya salio arriba; aqui solo queda una etiqueta cruzada.
    return 'etiqueta interpolacion como SUPER_RESOLUTION';
  },
  // SR-R5: realce de contraste etiquetado como superresolucion.
  'SR-R5': (l) => {
    if (!tiene(l, ['unsharp', 'eq=', 'noise=', 'smartblur', 'deblock'])) return null;
    if (!tiene(l, ['SUPER_RESOLUTION', 'APE-AI-SR'])) return null;
    return 'etiqueta realce de contraste como superresolucion';
  },
  // SR-R6: interpolacion temporal declarada como resolucion.
  'SR-R6': (l) => {
    if (!tiene(l, ['minterpolate', 'FRAME-INTERPOLATION', 'RIFE'])) return null;
    if (!tiene(l, ['RESOLUTION=', 'SUPER_RESOLUTION'])) return null;
    return 'declara interpolacion de fotogramas como RESOLUTION';
  },
  // SR-R7: superresolucion sin declarar archivo/VOD.
  'SR-R7': (l) => {
    if (!tiene(l, ['APE-AI-SR', 'SUPER_RESOLUTION'])) return null;
    if (l.includes('FALLBACK')) return null;   // igual que R1: el fallback no aplica SR
    if (/(CLASS|MODE)=(ARCHIVE|VOD)/.test(l)) return null;
    return 'declara superresolucion sin CLASS=ARCHIVE|VOD (en directo no es el caso legitimo)';
  },
};

const reglas = contrato.reglas || [];
for (const r of reglas) {
  if (typeof CHECKS[r.id] !== 'function') {
    console.error(`NO COMPUTADO: el contrato declara ${r.id} y este gate no lo implementa`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Recorrido en streaming.
// ---------------------------------------------------------------------------
const violaciones = new Map(); // id -> { regla, ejemplos: [], total }
let lineas = 0;
let declaracionesSr = 0;

function anotar(id, texto, linea) {
  if (!violaciones.has(id)) {
    const meta = reglas.find((r) => r.id === id) || {};
    violaciones.set(id, { regla: meta, total: 0, ejemplos: [] });
  }
  const v = violaciones.get(id);
  v.total++;
  if (v.ejemplos.length < 3) v.ejemplos.push({ n: linea, texto: texto.slice(0, 180) });
}

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(target, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const linea of rl) {
    lineas++;
    if (linea.includes('APE-AI-SR') || linea.includes('SUPER_RESOLUTION')) declaracionesSr++;
    for (const r of reglas) {
      const fallo = CHECKS[r.id](linea);
      if (fallo) anotar(r.id, linea, lineas);
    }
  }

  // -------------------------------------------------------------------------
  // Informe
  // -------------------------------------------------------------------------
  console.log('');
  console.log('=== SR RULES GATE ===');
  console.log(`  objetivo      : ${path.basename(target)}`);
  console.log(`  contrato      : super_resolution_rules.json v${contrato.version}`);
  console.log(`  lineas leidas : ${lineas.toLocaleString('es-ES')}`);
  console.log(`  declaraciones : ${declaracionesSr.toLocaleString('es-ES')} de superresolucion`);
  console.log('');

  if (declaracionesSr === 0) {
    console.log('  Sin declaraciones de superresolucion: el contrato no tiene nada que validar.');
    console.log('  Esto es CUMPLIMIENTO POR AUSENCIA, no una verificacion.');
    console.log('');
    console.log('  Sin fallos.');
    process.exitCode = 0;
    return;
  }

  if (violaciones.size === 0) {
    console.log('  Las declaraciones de superresolucion cumplen las 7 reglas.');
    console.log('');
    console.log('  Sin fallos.');
    process.exitCode = 0;
    return;
  }

  console.log('  VIOLACIONES');
  const orden = [...violaciones.keys()].sort();
  for (const id of orden) {
    const v = violaciones.get(id);
    console.log('');
    console.log(`  [${id}] ${v.regla.nombre || ''}   (${v.total} linea(s))`);
    console.log(`         severidad : ${v.regla.severidad || '?'}`);
    console.log(`         falla si  : ${v.regla.falla_si || '?'}`);
    console.log(`         correccion: ${v.regla.correccion || '?'}`);
    for (const e of v.ejemplos) {
      console.log(`         L${e.n}: ${e.texto}`);
    }
  }
  console.log('');
  console.log(`  ${violaciones.size} regla(s) violada(s) · ${[...violaciones.values()].reduce((a, v) => a + v.total, 0)} linea(s).`);
  process.exitCode = 1;
})().catch((e) => {
  console.error(`NO COMPUTADO: ${e.message}`);
  process.exit(2);
});
