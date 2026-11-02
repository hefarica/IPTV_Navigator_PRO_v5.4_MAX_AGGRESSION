#!/usr/bin/env node
/**
 * validate_exthttp.js — valida que CADA bloque #EXTHTTP de una lista sea JSON válido.
 *
 * Por qué importa: #EXTHTTP es lo que hace que el proveedor acepte la conexión
 * (User-Agent, Referer, token). Un parser tolerante IGNORA un bloque malformado
 * sin dar error, así que el canal se reproduce SIN sus cabeceras, el proveedor
 * responde 461/403, y el diagnóstico apunta al proveedor cuando el fallo estaba
 * en el manifiesto.
 *
 * Solo lectura. Una pasada. Emite JSON por stdout.
 */

const fs = require('fs');

const path = process.argv[2];
if (!path) {
  process.stderr.write('uso: node validate_exthttp.js <lista.m3u8>\n');
  process.exit(3);
}

const out = {
  archivo: path,
  exthttp_total: 0,
  json_ok: 0,
  json_invalido: 0,
  vacios: 0,
  no_objeto: 0,
  sin_user_agent: 0,
  sin_referer: 0,
  claves: {},
  invalidos: [],
  longitud: { min: Infinity, max: 0, suma: 0 },
};

let resto = '';
let numLinea = 0;

const TAMANO_MUESTRA_INVALIDOS = 5;

function revisar(payload, linea) {
  out.exthttp_total++;
  out.longitud.suma += Buffer.byteLength(payload, 'utf8');
  if (payload.length < out.longitud.min) out.longitud.min = payload.length;
  if (payload.length > out.longitud.max) out.longitud.max = payload.length;

  const texto = payload.trim();
  if (texto === '') { out.vacios++; return; }

  let obj;
  try {
    obj = JSON.parse(texto);
  } catch (e) {
    out.json_invalido++;
    if (out.invalidos.length < TAMANO_MUESTRA_INVALIDOS) {
      out.invalidos.push({
        linea,
        bytes: Buffer.byteLength(texto, 'utf8'),
        error: e.message.slice(0, 120),
        // contexto mínimo: suficiente para localizar, sin volcar headers
        inicio: texto.slice(0, 90),
      });
    }
    return;
  }

  out.json_ok++;

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    out.no_objeto++;
    return;
  }

  const claves = Object.keys(obj);
  // claves case-insensitive
  const baja = claves.map((k) => k.toLowerCase());
  if (!baja.includes('user-agent')) out.sin_user_agent++;
  if (!baja.includes('referer') && !baja.includes('referrer')) out.sin_referer++;

  for (const k of claves) out.claves[k] = (out.claves[k] || 0) + 1;
}

const rs = fs.createReadStream(path, { highWaterMark: 1 << 20 });

rs.on('data', (chunk) => {
  const partes = (resto + chunk.toString('utf8')).split('\n');
  resto = partes.pop();
  for (const cruda of partes) {
    numLinea++;
    const l = cruda.replace(/\r$/, '');
    if (!l.startsWith('#EXTHTTP')) continue;
    const i = l.indexOf(':');
    const payload = i === -1 ? '' : l.slice(i + 1);
    revisar(payload, numLinea);
  }
});

rs.on('end', () => {
  if (resto.startsWith('#EXTHTTP')) {
    const i = resto.indexOf(':');
    revisar(i === -1 ? '' : resto.slice(i + 1), numLinea + 1);
  }

  // Top de claves por frecuencia
  const top = Object.entries(out.claves)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => ({ clave: k, bloques: n }));

  const resumen = {
    archivo: out.archivo,
    exthttp_total: out.exthttp_total,
    json_ok: out.json_ok,
    json_invalido: out.json_invalido,
    vacios: out.vacios,
    no_objeto: out.no_objeto,
    sin_user_agent: out.sin_user_agent,
    sin_referer: out.sin_referer,
    longitud_bytes: {
      min: out.longitud.min === Infinity ? null : out.longitud.min,
      max: out.longitud.max,
      media: out.exthttp_total
        ? Math.round(out.longitud.suma / out.exthttp_total)
        : null,
    },
    top_claves: top,
    ejemplos_invalidos: out.invalidos,
  };

  const fallos = [];
  if (out.json_invalido > 0) fallos.push(`${out.json_invalido} #EXTHTTP con JSON inválido`);
  if (out.vacios > 0) fallos.push(`${out.vacios} #EXTHTTP vacíos`);
  if (out.no_objeto > 0) fallos.push(`${out.no_objeto} #EXTHTTP que no son objeto JSON`);
  if (out.sin_user_agent > 0) fallos.push(`${out.sin_user_agent} sin User-Agent`);
  if (out.sin_referer > 0) fallos.push(`${out.sin_referer} sin Referer`);

  resumen.fallos = fallos;
  resumen.veredicto = fallos.length === 0 ? 'TODOS_VALIDOS' : 'DEFECTOS';
  process.stdout.write(JSON.stringify(resumen, null, 2) + '\n');
  // El exit DEBE reflejar el veredicto. Antes era `exit(0)` incondicional: el informe
  // decia DEFECTOS y el proceso devolvia 0, asi que en CI este validador no podia fallar
  // nunca. Un validador que no puede fallar no valida; solo escribe JSON.
  //   0 = todos validos
  //   4 = defectos encontrados
  //   5 = no se pudo leer (distinto de 4 para que CI sepa que el fallo no es del fichero)
  process.exit(fallos.length === 0 ? 0 : 4);
});

rs.on('error', (e) => {
  process.stderr.write('ERROR leyendo: ' + e.message + '\n');
  // 5, no 4: "no pude leer" y "lei y tiene defectos" son causas distintas y CI debe
  // poder distinguirlas. Con 4 en ambos, un fichero ausente parecia una lista defectuosa.
  process.exit(5);
});
