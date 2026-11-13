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
// Los tokens de "esto declara superresolucion" NO se escriben aqui: se leen del
// contrato, que es la fuente unica. Un detector con su propia copia de la lista
// se desincroniza en cuanto alguien anade un idioma.
// ---------------------------------------------------------------------------
const tiene = (linea, agujas) => agujas.some((a) => linea.includes(a));

const SR_TOKENS = (contrato.tokens_superresolucion && contrato.tokens_superresolucion.tokens) || [];
const SR_EXCLUIDOS = (contrato.tokens_superresolucion && contrato.tokens_superresolucion.no_cuentan_como_declaracion) || [];

if (!SR_TOKENS.length) {
  console.error('NO COMPUTADO: el contrato no declara tokens_superresolucion');
  process.exit(2);
}

/**
 * ¿Esta linea declara superresolucion?
 * Un FALLBACK o un DISABLED afirma lo contrario: que la superresolucion NO se
 * aplica. Contarlos invertiria el sentido de la regla.
 */
function esSr(texto) {
  if (!tiene(texto, SR_TOKENS)) return false;
  if (tiene(texto, SR_EXCLUIDOS)) return false;
  return true;
}

const CHECKS = {
  // SR-R1: superresolucion sin modelo de degradacion declarado.
  // `esSr` ya excluye FALLBACK y DISABLED: declarar el fallback es la linea mas
  // honesta del fichero y castigarla seria un falso positivo.
  'SR-R1': (l) => {
    if (!esSr(l)) return null;
    if (l.includes('DEGRADATION=')) return null;
    if (/STATE=(DECLARED|NO_COMPUTADO)/.test(l)) return null;
    return 'declara superresolucion sin DEGRADATION= ni STATE=DECLARED|NO_COMPUTADO';
  },
  // SR-R2: metrica perceptual sin referencia. En IPTV el original no existe.
  // Preciso: dispara con una AFIRMACION (valor numerico, TARGET, SCORE), no con
  // el nombre de una estrategia. `VMAF-MAXIMIZATION-ENABLED` es como se llama
  // un modo; `VMAF-TARGET:95.0` y `EPSNR=45` son valores que alguien afirma.
  'SR-R2': (l) => {
    if (!tiene(l, ['PSNR', 'SSIM', 'VMAF', 'LPIPS'])) return null;
    if (l.includes('REFERENCE=') || l.includes('REF=')) return null;
    const afirmaValor = /(?:=|:)\s*-?\d/.test(l) || /\b(TARGET|SCORE|AVG|MEAN)\b/i.test(l);
    if (!afirmaValor) return null;
    return 'afirma un valor perceptual (PSNR/SSIM/VMAF/LPIPS) sin REFERENCE= ni REF=';
  },
  // SR-R3: detalle sintetizado etiquetado como fuente.
  'SR-R3': (l) => {
    if (!esSr(l)) return null;
    if (!/(CLASS|ROLE|ORIGIN)=SOURCE/.test(l)) return null;
    return 'etiqueta superresolucion como SOURCE (el detalle es sintetizado, no capturado)';
  },
  // SR-R4: interpolacion etiquetada como superresolucion.
  'SR-R4': (l) => {
    if (!tiene(l, ['LANCZOS', 'BICUBIC', 'BILINEAR'])) return null;
    if (!esSr(l)) return null;
    return 'etiqueta interpolacion como superresolucion';
  },
  // SR-R5: realce de contraste etiquetado como superresolucion.
  'SR-R5': (l) => {
    if (!tiene(l, ['unsharp', 'eq=', 'noise=', 'smartblur', 'deblock'])) return null;
    if (!esSr(l)) return null;
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
    if (!esSr(l)) return null;
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
// Recorrido. Dos fuentes, LAS MISMAS reglas:
//   - lista M3U/M3U8 -> una linea por unidad de evaluacion, en streaming
//   - JSON de metadata -> cada hoja de texto, con su ruta $.. como ubicacion
// Una regla que solo sabe mirar listas no es "para cualquier modulo IPTV".
// ---------------------------------------------------------------------------
const violaciones = new Map(); // id -> { regla, ejemplos: [], total }
let unidades = 0;
let declaracionesSr = 0;

function anotar(id, texto, ubicacion) {
  if (!violaciones.has(id)) {
    const meta = reglas.find((r) => r.id === id) || {};
    violaciones.set(id, { regla: meta, total: 0, ejemplos: [] });
  }
  const v = violaciones.get(id);
  v.total++;
  if (v.ejemplos.length < 3) v.ejemplos.push({ n: ubicacion, texto: String(texto).slice(0, 180) });
}

/** Evalua un texto contra las 7 reglas. Cuenta las declaraciones de SR que ve. */
function evaluarTexto(texto, ubicacion) {
  if (typeof texto !== 'string' || !texto) return 0;
  unidades++;
  if (esSr(texto)) declaracionesSr++;
  for (const r of reglas) {
    const fallo = CHECKS[r.id](texto);
    if (fallo) anotar(r.id, texto, ubicacion);
  }
  return 0;
}

/**
 * Recorrido JSON: la declaracion es el OBJETO, no cada hoja.
 *
 * Modelo mental medido con el fixture: en
 *   "superresolucion": { "modelo":"RealESRGAN", "degradacion":"blur:1.5",
 *                        "estado":"DECLARED", "rol":"ENHANCEMENT" }
 * la degradacion y el estado son HERMANOS del modelo, y la clase ("VOD") vive
 * en el PADRE. Evaluar hoja a hoja dispara R1 en `modelo` porque en esa hoja
 * sola no hay degradacion — y la degradacion existe, a su lado. Eso es un falso
 * positivo de contexto, no de regla.
 *
 * Por eso: cuando un subarbol contiene un token de superresolucion, se aplana
 * ENTERO junto con el contexto heredado de sus ancestros y se evalua UNA vez.
 * Una declaracion, una evaluacion, con todo lo que la rodea visible.
 */
const ALIAS = (contrato.alias_de_campo && contrato.alias_de_campo.mapa) || {};

function canonizar(clave) {
  if (typeof clave !== 'string') return null;
  return ALIAS[clave.toLowerCase()] || null;
}

/** Aplana las hojas escalares de UN objeto a `TAG=valor` canonicos. */
function aplanarObjeto(obj, prefijo) {
  const partes = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') continue; // los hijos van aparte
    const canon = canonizar(k) || k.toUpperCase();
    partes.push(`${canon}=${v}`);
    // Se conserva tambien la forma original: una regla puede mirar el texto tal cual.
    partes.push(`${k}: ${v}`);
  }
  return partes.join(' ');
}

/**
 * ¿ESTE objeto declara superresolucion?
 *
 * Se mira solo lo que el objeto declara por si mismo: sus hojas escalares y el
 * nombre de sus hijos directos. NO se mira el subarbol entero.
 *
 * Por que: aplanar el canal completo mezcla declaraciones distintas. En el
 * fixture que cumple, `escalado` declara LANCZOS como INTERPOLATION y
 * `superresolucion` declara el modelo; fundirlos hace que R4 vea "LANCZOS +
 * algo de SR" en la misma cadena y acuse una etiqueta cruzada que no existe.
 * Dos declaraciones hermanas no son una declaracion cruzada.
 */
function esDeclaracionSr(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (esSr(aplanarObjeto(obj))) return true;
  for (const k of Object.keys(obj)) if (esSr(k)) return true;
  return false;
}

/**
 * Recorre con contexto heredado. Al llegar a un objeto que declara SR, aplana
 * el subarbol completo y evalua UNA vez con el contexto de los ancestros.
 * No se desciende mas: la declaracion ya se evaluo entera.
 */
function recorrerJson(nodo, ruta, contexto) {
  if (nodo === null || nodo === undefined) return;

  if (Array.isArray(nodo)) {
    nodo.forEach((v, i) => recorrerJson(v, `${ruta}[${i}]`, contexto));
    return;
  }

  if (typeof nodo !== 'object') {
    // Hoja suelta en la raiz: se evalua con lo que haya de contexto.
    unidades++;
    if (esSr(String(nodo))) declaracionesSr++;
    for (const r of reglas) {
      const fallo = CHECKS[r.id](`${contexto} ${nodo}`);
      if (fallo) anotar(r.id, String(nodo), ruta);
    }
    return;
  }

  const aqui = aplanarObjeto(nodo, ruta);
  const ctx = contexto ? `${contexto} ${aqui}` : aqui;

  // Se evalua CADA objeto con sus hojas propias + el contexto de sus ancestros.
  //
  // No se condiciona a que el objeto "declare SR": R6 dispara con
  // `minterpolate` + `RESOLUTION=` sin ningun token de superresolucion, y
  // gatear la evaluacion en `esDeclaracionSr` dejaba esa regla sin ejecutar
  // nunca sobre un JSON. Un gate que no ejecuta una de sus reglas miente por
  // omision, que es peor que fallar.
  //
  // Tampoco se aplana el subarbol entero: eso fundiria declaraciones hermanas
  // (el LANCZOS del escalado con el modelo de SR) y acusaria etiquetas cruzadas
  // que no existen.
  unidades++;
  if (esSr(ctx)) declaracionesSr++;
  for (const r of reglas) {
    const fallo = CHECKS[r.id](ctx);
    if (fallo) anotar(r.id, aqui.slice(-220) || ruta, ruta);
  }

  // Sin declaracion en este nivel: se sigue bajando con el contexto acumulado.
  for (const [k, v] of Object.entries(nodo)) {
    if (v !== null && typeof v === 'object') recorrerJson(v, `${ruta}.${k}`, ctx);
  }
}

/** Aplana TODAS las hojas de un subarbol, sin importar la profundidad. */
function aplanarProfundo(nodo) {
  const partes = [];
  (function bajar(n) {
    if (n === null || n === undefined) return;
    if (typeof n !== 'object') { partes.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(bajar); return; }
    for (const [k, v] of Object.entries(n)) {
      const canon = canonizar(k);
      if (canon && (v === null || typeof v !== 'object')) partes.push(`${canon}=${v}`);
      if (v !== null && typeof v === 'object') bajar(v);
      else if (typeof v === 'string') partes.push(v);
    }
  })(nodo);
  return partes.join(' ');
}

function esJson(fichero) {
  if (/\.json$/i.test(fichero)) return true;
  // Sin extension: se huele el contenido por los primeros bytes utiles.
  const fd = fs.openSync(fichero, 'r');
  try {
    const buf = Buffer.alloc(64);
    const n = fs.readSync(fd, buf, 0, 64, 0);
    const t = buf.slice(0, n).toString('utf8').replace(/^\uFEFF/, '').trimStart();
    return t.startsWith('{') || t.startsWith('[');
  } finally {
    fs.closeSync(fd);
  }
}

(async () => {
  const formatoJson = esJson(target);

  if (formatoJson) {
    // JSON de metadata: se carga entero. Los ficheros de metadata son de KB o
    // MB, no de GB; si algun dia lo fueran, se troceara por ramas.
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (e) {
      console.error(`NO COMPUTADO: JSON ilegible (${path.basename(target)}): ${e.message}`);
      process.exit(2);
    }
    recorrerJson(doc, '$');
  } else {
    // Lista M3U/M3U8: streaming, porque hay listas de 1,3 GB.
    const rl = readline.createInterface({
      input: fs.createReadStream(target, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let nLinea = 0;
    for await (const linea of rl) {
      nLinea++;
      evaluarTexto(linea, 'L' + nLinea);
    }
  }

  // -------------------------------------------------------------------------
  // Informe
  // -------------------------------------------------------------------------
  console.log('');
  console.log('=== SR RULES GATE ===');
  console.log(`  objetivo      : ${path.basename(target)}`);
  console.log(`  formato       : ${formatoJson ? 'JSON metadata' : 'lista M3U/M3U8'}`);
  console.log(`  contrato      : super_resolution_rules.json v${contrato.version}`);
  console.log(`  unidades      : ${unidades.toLocaleString('es-ES')} ${formatoJson ? 'hojas de texto' : 'lineas'}`);
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
    console.log(`  [${id}] ${v.regla.nombre || ''}   (${v.total} ${formatoJson ? 'hoja(s)' : 'linea(s)'})`);
    console.log(`         severidad : ${v.regla.severidad || '?'}`);
    console.log(`         falla si  : ${v.regla.falla_si || '?'}`);
    console.log(`         correccion: ${v.regla.correccion || '?'}`);
    for (const e of v.ejemplos) {
      console.log(`         ${e.n}: ${e.texto}`);
    }
  }
  console.log('');
  const totalFallos = [...violaciones.values()].reduce((a, v) => a + v.total, 0);
  console.log(`  ${violaciones.size} regla(s) violada(s) · ${totalFallos} ${formatoJson ? 'hoja(s)' : 'linea(s)'}.`);
  process.exitCode = 1;
})().catch((e) => {
  console.error(`NO COMPUTADO: ${e.message}`);
  process.exit(2);
});
