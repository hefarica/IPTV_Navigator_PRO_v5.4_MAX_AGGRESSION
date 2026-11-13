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

/**
 * DOS FORMAS DE USO, el mismo motor:
 *
 *   CLI      node tools/quality/check_sr_rules.js <fichero>     -> exit 0/1/2
 *   LIBRERIA const { analizar } = require('./check_sr_rules')   -> resultado
 *
 * La forma de libreria existe porque el objetivo pide reglas "para cualquier
 * modulo o sistema IPTV": un modulo no puede ejecutar un CLI y leer un exit
 * code sin lanzar un proceso. `analizar()` devuelve el informe como dato.
 */
const CONTRACT = path.join(__dirname, '..', '..', 'contracts', 'super_resolution_rules.json');

let contrato;
try {
  contrato = JSON.parse(fs.readFileSync(CONTRACT, 'utf8'));
} catch (e) {
  // Sin contrato no hay reglas: es fatal en las dos formas de uso.
  throw new Error(`contrato ilegible (${CONTRACT}): ${e.message}`);
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
  //
  // Dos precisiones, ambas por falsos positivos medidos:
  //   1. Dispara con una AFIRMACION (valor numerico, TARGET, SCORE), no con el
  //      nombre de una estrategia: `VMAF-MAXIMIZATION-ENABLED` es un modo.
  //   2. El valor tiene que estar PEGADO al nombre de la metrica. En el LAB
  //      aparecia "...NETFLIX=VMAF ... COMPLIANCE_PCT=95..." y R2 disparaba por
  //      el 95, que es un porcentaje de cumplimiento, no un VMAF. Un numero a
  //      200 caracteres de la metrica no es su valor.
  'SR-R2': (l) => {
    const METRICA = '(?:PSNR|SSIM|VMAF|LPIPS)';
    if (!new RegExp(METRICA, 'i').test(l)) return null;
    if (l.includes('REFERENCE=') || l.includes('REF=')) return null;
    // El valor pegado a la metrica: hasta 12 caracteres no alfanumericos, = o :, y un numero.
    const pegado = new RegExp(`${METRICA}[^A-Za-z0-9]{0,12}(?:=|:)\\s*-?\\d`, 'i').test(l);
    const rotulado = new RegExp(`${METRICA}[^A-Za-z0-9]{0,12}(?:TARGET|SCORE|AVG|MEAN)`, 'i').test(l);
    if (!pegado && !rotulado) return null;
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
  //
  // Precision medida: si `minterpolate` aparece DENTRO de un `video-filter`,
  // esta en su sitio — un filtro declara un filtro, no una resolucion. En el
  // LAB conviven `video-filter: ...minterpolate=fps=120...` y otras claves con
  // `RESOLUTION=`; la version anterior los fundia y acusaba una etiqueta
  // cruzada que no existia.
  'SR-R6': (l) => {
    if (!tiene(l, ['minterpolate', 'FRAME-INTERPOLATION', 'RIFE'])) return null;
    if (tiene(l, ['video-filter', 'VIDEO_FILTER', 'VIDEO-FILTER', 'VideoFilter'])) return null;
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

/**
 * ¿Este texto es un MENU de alternativas y no una declaracion?
 *
 * Un registro de calibracion escribe las opciones que el generador PUEDE
 * elegir: `"X-APE-AI-SR-ENABLED": "TRUE,ENABLED,ADAPTIVE,AUTO"`. Eso no declara
 * que la superresolucion este aplicada; declara el catalogo.
 *
 * Se distingue por la forma: si el valor se parte por comas en 2+ trozos y
 * TODOS son tokens simples, es un menu. Si algun trozo lleva ':' o '=',
 * tiene estructura interna y es una declaracion.
 *
 * Evidencia: el LAB_CALIBRATED_FINAL_v24 declara los menus de los 6 perfiles.
 * Sin esta distincion el gate reportaba 52 hojas violadas en un fichero que no
 * declara nada aplicado. Lo detecto el cruce con ape-sr-iptv-rules, que da
 * 100/100 PASS al mismo fichero.
 */
const TOKEN_SIMPLE = /^[A-Za-z0-9_.+\-]+$/;

/** ¿ESTE valor es una lista de alternativas con forma de menu? */
function esValorMenu(valor) {
  if (typeof valor !== 'string') return false;
  const t = valor.trim();
  if (!t.includes(',')) return false;
  const trozos = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (trozos.length < 2) return false;
  return trozos.every((x) => TOKEN_SIMPLE.test(x));
}

/**
 * ¿Esta linea/objeto es un MENU de alternativas y no una declaracion?
 *
 * Un registro de calibracion escribe las opciones que el generador PUEDE
 * elegir: `X-APE-AI-SR-ENABLED: TRUE,ENABLED,ADAPTIVE,AUTO`. Eso no declara que
 * la superresolucion este aplicada; declara el catalogo.
 *
 * Se busca en TODA la cadena, no solo al final: en un objeto con varias claves
 * el menu puede estar en cualquier posicion. La version anterior solo miraba la
 * cola y seguia acusando 33 hojas del LAB.
 */
function esMenu(texto) {
  if (typeof texto !== 'string') return false;
  // Cualquier `CLAVE: a,b,c` o `CLAVE= a,b,c` con todos los trozos simples.
  const re = /[:=]\s*([A-Za-z0-9_.+\-]+(?:\s*,\s*[A-Za-z0-9_.+\-]+)+)(?=[\s;]|$)/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (esValorMenu(m[1])) return true;
  }
  return false;
}

/** Reglas que NO se aplican sobre un menu: no hay declaracion que validar. */
const REGLAS_SOLO_DECLARACION = new Set(['SR-R1', 'SR-R3', 'SR-R4', 'SR-R5', 'SR-R7']);

/** Evalua un texto contra las reglas que le corresponden. */
function aplicarReglas(texto, ubicacion, esMenuAqui) {
  for (const r of reglas) {
    if (esMenuAqui && REGLAS_SOLO_DECLARACION.has(r.id)) continue;
    const fallo = CHECKS[r.id](texto);
    if (fallo) anotar(r.id, texto, ubicacion);
  }
}

/** Evalua una linea de lista M3U/M3U8. */
function evaluarTexto(texto, ubicacion) {
  if (typeof texto !== 'string' || !texto) return 0;
  unidades++;
  const menu = esMenu(texto);
  if (!menu && esSr(texto)) declaracionesSr++;
  aplicarReglas(texto, ubicacion, menu);
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
  //
  // Y si el objeto es un MENU de alternativas, las reglas de declaracion no se
  // aplican: un catalogo de opciones no declara nada aplicado.
  unidades++;
  const menu = esMenu(aqui);
  if (!menu && esSr(ctx)) declaracionesSr++;
  aplicarReglas(ctx, ruta, menu);

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

/**
 * Analiza un fichero (lista o JSON) y devuelve el informe COMO DATO.
 * No imprime, no sale del proceso: eso lo decide quien llama.
 *
 * Cada llamada reinicia el estado, para que un modulo pueda analizar varias
 * listas seguidas sin que las violaciones de una contaminen la siguiente.
 */
async function analizar(target) {
  violaciones.clear();
  unidades = 0;
  declaracionesSr = 0;

  if (!fs.existsSync(target)) {
    return { ok: false, motivo: 'NO_COMPUTADO', error: `no existe ${target}` };
  }

  const formatoJson = esJson(target);

  if (formatoJson) {
    let doc;
    try {
      doc = JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch (e) {
      return { ok: false, motivo: 'NO_COMPUTADO', error: `JSON ilegible: ${e.message}` };
    }
    recorrerJson(doc, '$');
  } else {
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

  const lista = [...violaciones.entries()]
    .map(([id, v]) => ({
      id,
      nombre: v.regla.nombre || '',
      severidad: v.regla.severidad || null,
      veredicto: v.regla.veredicto || null,
      falla_si: v.regla.falla_si || '',
      correccion: v.regla.correccion || '',
      total: v.total,
      ejemplos: v.ejemplos,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const motivo = declaracionesSr === 0 ? 'SIN_DECLARACIONES'
    : lista.length === 0 ? 'CUMPLE'
    : 'VIOLA';

  return {
    ok: lista.length === 0,
    motivo,
    objetivo: path.basename(target),
    formato: formatoJson ? 'json' : 'lista',
    contrato_version: contrato.version,
    unidades,
    declaraciones: declaracionesSr,
    violaciones: lista,
    total_lineas_afectadas: lista.reduce((a, v) => a + v.total, 0),
    // Un "sin declaraciones" no es un aprobado: no habia nada que verificar.
    aviso: declaracionesSr === 0
      ? 'CUMPLIMIENTO POR AUSENCIA, no una verificacion: el objetivo no declara superresolucion'
      : null,
  };
}

/** Formatea el informe para consola. Separado de `analizar` para poder callar. */
function imprimirInforme(r) {
  console.log('');
  console.log('=== SR RULES GATE ===');
  if (r.error) {
    console.log(`  NO COMPUTADO: ${r.error}`);
    console.log('');
    return;
  }
  console.log(`  objetivo      : ${r.objetivo}`);
  console.log(`  formato       : ${r.formato === 'json' ? 'JSON metadata' : 'lista M3U/M3U8'}`);
  console.log(`  contrato      : super_resolution_rules.json v${r.contrato_version}`);
  console.log(`  unidades      : ${r.unidades.toLocaleString('es-ES')} ${r.formato === 'json' ? 'hojas de texto' : 'lineas'}`);
  console.log(`  declaraciones : ${r.declaraciones.toLocaleString('es-ES')} de superresolucion`);
  console.log('');

  // El aviso de ausencia solo puede sustituir al informe si NO hay violaciones.
  // R2 y R6 disparan sin token de superresolucion (una metrica sin referencia,
  // una interpolacion temporal vendida como resolucion), asi que
  // `declaraciones === 0` NO implica `violaciones === 0`. La version anterior
  // imprimia "Sin fallos" con violaciones presentes: mentia en el informe.
  if (r.aviso && r.violaciones.length === 0) {
    console.log(`  ${r.aviso}`);
    console.log('');
    console.log('  Sin fallos.');
    return;
  }
  if (r.motivo === 'CUMPLE') {
    console.log('  Las declaraciones de superresolucion cumplen las 7 reglas.');
    console.log('');
    console.log('  Sin fallos.');
    return;
  }

  console.log('  VIOLACIONES');
  for (const v of r.violaciones) {
    console.log('');
    console.log(`  [${v.id}] ${v.nombre}   (${v.total} ${r.formato === 'json' ? 'hoja(s)' : 'linea(s)'})`);
    console.log(`         severidad : ${v.severidad || '?'}${v.veredicto ? ' · veredicto: ' + v.veredicto : ''}`);
    console.log(`         falla si  : ${v.falla_si}`);
    console.log(`         correccion: ${v.correccion}`);
    for (const e of v.ejemplos) console.log(`         ${e.n}: ${e.texto}`);
  }
  console.log('');
  console.log(`  ${r.violaciones.length} regla(s) violada(s) · ${r.total_lineas_afectadas} ${r.formato === 'json' ? 'hoja(s)' : 'linea(s)'}.`);
}

module.exports = { analizar, imprimirInforme, contrato, REGLAS: reglas };

// --- CLI: solo cuando se ejecuta directamente ------------------------------
if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('uso: node tools/quality/check_sr_rules.js <lista.m3u8|metadata.json>');
    process.exit(2);
  }
  analizar(target)
    .then((r) => {
      imprimirInforme(r);
      if (r.motivo === 'NO_COMPUTADO') process.exitCode = 2;
      else process.exitCode = r.ok ? 0 : 1;
    })
    .catch((e) => {
      console.error(`NO COMPUTADO: ${e.message}`);
      process.exit(2);
    });
}
