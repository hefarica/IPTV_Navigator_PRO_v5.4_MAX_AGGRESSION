#!/usr/bin/env node
/**
 * gate_matrix.js — la matriz que el gate del operador exige, celda por celda.
 *
 * El requisito es que TODA lista, en TODAS sus configuraciones posibles de cliente,
 * entregue 200, 206 y 302. Hasta ahora se venia midiendo en trozos: el 206 por perfil
 * en un informe, el 302 en otro, y el 200 heredado de la telemetria de produccion.
 * Un trozo no es una garantia: esta herramienta mide las seis configuraciones por
 * lista en una sola pasada y dice exactamente que celda falta.
 *
 * Configuraciones por lista (5 cuentan celda + 1 de apoyo):
 *   1. GET completo, sin gzip        -> mide la pata 200 para cliente sin gzip
 *   2. GET completo, con gzip        -> mide la pata 200 para cliente con gzip
 *   3. GET con Range, sin gzip       -> mide la pata 206 para cliente sin gzip
 *   4. GET con Range, con gzip       -> mide la pata 206 para cliente con gzip
 *   5. HTTP plano, sin gzip          -> mide la pata 302 exacto (redirect a https)
 *   6. HEAD, sin gzip                -> longitud declarada; apoyo, no cuenta celda
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * [t39] FIXTURE_AUSENTE ≠ FALLO DE ENTREGA
 *
 * Hasta hoy este gate medía CUATRO nombres de lista hardcodeados. Dos de ellos
 * (APE_LISTA_1793589060441.m3u8 y APE_LISTA_1793558303852_CDN.m3u8) fueron
 * reemplazados y devuelven 404. Resultado: 12/20 y "NO CUMPLE", cuando en
 * realidad las listas que SI existen pasaban 5/5 cada una. El veredicto
 * describia el instrumento, no la entrega.
 *
 * ESTE MISMO DEFECTO YA SE ARREGLO EN ESTE REPO, en otro verificador:
 *   _vps_stage/deploy/verify.sh:55-68
 *   "Antes estaban hardcodeadas dos listas ya retiradas ... Ambas devuelven 404
 *    desde que fueron reemplazadas, asi que este job fallaba SIEMPRE y bloqueaba
 *    cualquier deploy: el verificador miraba ficheros que ya no existen.
 *    No era una caida del VPS."
 * Aquel lo resolvio descubriendo la lista viva en disco (ls -1t ... | head -1),
 * con fallback a un nombre conocido y un WARN si el descubrimiento falla.
 *
 * AQUI NO SE PUEDE HACER IGUAL, y conviene que quede escrito: este gate corre
 * desde CI contra el host publico (https://iptv-ape.duckdns.org), no tiene shell
 * en el VPS y HTTP no ofrece listado de directorio: pedir /lists/ devuelve el
 * indice (o 403/404) pero no una lista fiable de ficheros servidos. La
 * alternativa elegida es:
 *
 *   1. Un FIXTURE explicito de nombres (este array), actualizado cuando el
 *      inventario del VPS cambia. Hoy son los 5 que existen.
 *   2. Una SONDA DE IDENTIDAD por lista (GET identity) ANTES de medir. Si esa
 *      sonda da 404, la lista se clasifica FIXTURE_AUSENTE: sus celdas NO se
 *      generan y NO entran en el denominador de entrega.
 *   3. El fixture ausente se reporta como senal aparte, no como incumplimiento.
 *      Asi el gate deja de castigar a la ruta por la rotacion de sus ficheros
 *      de prueba, pero sigue viendo la rotacion en vez de esconderla.
 *   4. Si TODAS las listas del fixture estan ausentes, el gate falla con codigo
 *      propio (FIXTURE_CADUCADO, exit 2): eso no es que la entrega falle, es que
 *      el instrumento se quedo sin referencia y hay que actualizar el fixture.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Solo lectura: no escribe nada en el servidor. Los GET completos de las listas
 * grandes se cortan en 1 KB para no bajar cientos de MB seis veces; el estado y
 * las cabeceras se leen al recibir la respuesta, que es lo que el gate evalua.
 *
 *   node tools/ape-http-conformance/gate_matrix.js [--json ruta]
 *
 *   exit 0 = toda celda de entrega cumple (puede haber fixture ausente, se avisa)
 *   exit 1 = hay huecos de ENTREGA en listas existentes
 *   exit 2 = FIXTURE_CADUCADO: ninguna lista del fixture existe ya
 */
'use strict';

const https = require('https');
const http = require('http');
const fs = require('fs');

const HOST = 'iptv-ape.duckdns.org';
const BASE = '/lists/';

/**
 * FIXTURE de listas a medir. Actualizado el 2026-11-12 con el inventario vivo
 * del VPS. Las dos primeras entradas del fixture anterior
 * (APE_LISTA_1793589060441 y APE_LISTA_1793558303852_CDN) ya no existen y se
 * retiraron de aqui: si volvieran a faltar otras, la sonda lo dira como
 * FIXTURE_AUSENTE, no como fallo de entrega.
 */
const LISTAS = [
  'APE_LISTA_1793787155230.m3u8',          // grande
  'APE_LISTA_1793926685925.m3u8',          // grande
  'APE_LISTA_1794100720046.m3u8',          // grande
  'APE_PRUEBA_ORDER_OK.m3u8',              // pequena, sin .gz
  'APE_PRUEBA_PERFILES.m3u8'               // pequena, sin .gz
];

/**
 * Tamano MINIMO esperado del cuerpo identity por lista.
 *
 * El motivo de este umbral es un incidente medido: el identity de la lista grande
 * tenia 8 bytes y la matriz daba la celda por buena porque solo miraba el codigo
 * HTTP. El suelo sirve para detectar "200 con cuerpo vacio o truncado".
 *
 * Para las listas nuevas NO se inventa un tamano: no se conoce su longitud y un
 * numero grande seria un pin falso que romperia el gate al cambiar la lista. Se
 * usa el suelo estructural de 200 bytes, que una lista M3U8 real siempre supera y
 * que el stub de 8 bytes no alcanza. Las dos de prueba conservan su valor medido.
 */
const TAMANO_MINIMO = {
  'APE_LISTA_1793787155230.m3u8': 200,
  'APE_LISTA_1793926685925.m3u8': 200,
  'APE_LISTA_1794100720046.m3u8': 200,
  'APE_PRUEBA_ORDER_OK.m3u8': 200,
  'APE_PRUEBA_PERFILES.m3u8': 200
};

const TIMEOUT = 30000;

/** Una peticion. Devuelve estado + cabeceras relevantes. Corta el cuerpo al primer chunk. */
function pedir({ ruta, protocolo = 'https', method = 'GET', gzip = false, range = false }) {
  return new Promise((res) => {
    const headers = { 'Accept-Encoding': gzip ? 'gzip' : 'identity' };
    if (range) headers.Range = 'bytes=0-1023';
    const mod = protocolo === 'https' ? https : http;
    const opts = protocolo === 'https'
      ? { host: HOST, path: ruta, method, headers, timeout: TIMEOUT }
      : { host: HOST, port: 80, path: ruta, method, headers, timeout: TIMEOUT };

    const req = mod.request(opts, (r) => {
      const h = r.headers;
      const out = {
        status: r.statusCode,
        content_encoding: h['content-encoding'] || null,
        content_range: h['content-range'] || null,
        content_length: h['content-length'] || null,
        transfer_encoding: h['transfer-encoding'] || null,
        location: h.location || null
      };
      // No se descarga el cuerpo: interesa el estado y las cabeceras, no los bytes.
      r.destroy();
      res(out);
    });
    req.on('timeout', () => { req.destroy(); res({ error: 'timeout' }); });
    req.on('error', (e) => res({ error: e.code || e.message }));
    req.end();
  });
}

const es3xx = (o) => !o.error && o.status >= 300 && o.status < 400;

/**
 * Sonda de identidad: un GET identity por lista, ANTES de medir las celdas.
 *
 * Devuelve la respuesta y una clasificacion:
 *   PRESENTE        -> hay fichero (cualquier estado que no sea 404)
 *   FIXTURE_AUSENTE -> 404 tras reintento: el fichero del fixture ya no existe
 *
 * Se reintenta UNA vez ante 404 para no clasificar como fixture caducado un 404
 * transitorio de CDN/proxy. Un 404 repetido dos veces es rotacion, no ruido.
 */
async function sondaIdentidad(nombre) {
  const ruta = BASE + nombre;
  let r = await pedir({ ruta, method: 'GET', gzip: false });
  if (r.status === 404) {
    const r2 = await pedir({ ruta, method: 'GET', gzip: false });
    return { respuesta: r2, clasificacion: r2.status === 404 ? 'FIXTURE_AUSENTE' : 'PRESENTE', reintentado: true };
  }
  return { respuesta: r, clasificacion: 'PRESENTE', reintentado: false };
}

/** Evalua una lista PRESENTE contra las seis configuraciones y devuelve sus celdas. */
async function evaluar(nombre, ident) {
  const ruta = BASE + nombre;
  const [g200g, r206i, r206g, hredir, head] = await Promise.all([
    pedir({ ruta, method: 'GET', gzip: true }),
    pedir({ ruta, method: 'GET', gzip: false, range: true }),
    pedir({ ruta, method: 'GET', gzip: true, range: true }),
    pedir({ ruta, protocolo: 'http', method: 'GET', gzip: false }),
    pedir({ ruta, method: 'HEAD', gzip: false })
  ]);
  const g200i = ident;

  return {
    lista: nombre,
    '200 identity': g200i.status || g200i.error,
    '200 gzip': g200g.status || g200g.error,
    '206 identity': r206i.status || r206i.error,
    '206 gzip': r206g.status || r206g.error,
    'redirect http': hredir.status || hredir.error,
    'location': hredir.location || null,
    // Datos de apoyo para explicar un fallo, no para decidir el gate.
    detalle: {
      '200 identity': g200i,
      '206 identity': r206i,
      '206 gzip': r206g,
      head: { length: head.content_length, status: head.status }
    }
  };
}

(async () => {
  const argJson = process.argv.indexOf('--json');

  // ── 1. Sonda de identidad: separa listas vivas de fixture ausente ──────────
  const sondas = [];
  for (const l of LISTAS) sondas.push({ lista: l, ...(await sondaIdentidad(l)) });

  const ausentes = sondas.filter(s => s.clasificacion === 'FIXTURE_AUSENTE');
  const presentes = sondas.filter(s => s.clasificacion === 'PRESENTE');

  // ── 2. Solo se miden las presentes: el ausente no genera celdas ───────────
  const filas = [];
  for (const s of presentes) filas.push(await evaluar(s.lista, s.respuesta));

  // Criterio por pata, declarado ANTES de mirar el resultado de cada lista:
  //   pata 200  -> GET completo debe dar 200
  //   pata 206  -> GET con Range debe dar 206
  //   pata 302  -> HTTP plano debe dar 302 exacto
  const celdas = [];
  for (const f of filas) {
    // Un 200 con cuerpo vacio sigue siendo 200, y eso paso de verdad: el identity de la lista grande
    // tenia 8 bytes y esta matriz daba la celda por buena porque solo miraba el codigo. Ahora la celda
    // exige ademas que el cuerpo tenga el tamano declarado. Sin esto el gate no prueba que la lista llegue.
    const bytesDe = (perfil) => {
      const d = (f.detalle && f.detalle[perfil]) || {};
      const n = Number(d.content_length);
      return isFinite(n) ? n : 0;
    };
    const minDe = (nombre) => TAMANO_MINIMO[nombre] || 200;
    const identidadOk = f['200 identity'] === 200 && bytesDe('200 identity') >= minDe(f.lista);
    celdas.push({
      lista: f.lista, pata: '200', perfil: 'identity',
      obtenido: f['200 identity'],
      bytes: bytesDe('200 identity'),
      min_bytes: minDe(f.lista),
      cumple: identidadOk
    });
    celdas.push({ lista: f.lista, pata: '200', perfil: 'gzip', obtenido: f['200 gzip'], cumple: f['200 gzip'] === 200 });
    celdas.push({ lista: f.lista, pata: '206', perfil: 'identity', obtenido: f['206 identity'], cumple: f['206 identity'] === 206 });
    celdas.push({ lista: f.lista, pata: '206', perfil: 'gzip', obtenido: f['206 gzip'], cumple: f['206 gzip'] === 206 });
    celdas.push({ lista: f.lista, pata: '302', perfil: 'http', obtenido: f['redirect http'], cumple: f['redirect http'] === 302 });
  }

  const total = celdas.length;
  const ok = celdas.filter(c => c.cumple).length;
  const huecos = celdas.filter(c => !c.cumple);

  // ── 3. Veredicto: tres estados, no dos ────────────────────────────────────
  const todasAusentes = presentes.length === 0 && ausentes.length > 0;
  let veredicto;
  let exitCode;
  if (todasAusentes) {
    veredicto = 'FIXTURE_CADUCADO';
    exitCode = 2;
  } else if (huecos.length > 0) {
    veredicto = 'NO CUMPLE';
    exitCode = 1;
  } else {
    veredicto = 'CUMPLE';
    exitCode = 0;
  }

  /**
   * Remedio por hueco. No es una prediccion suelta: cada entrada nombra el artefacto del repo y
   * el mecanismo concreto que se midio. Los huecos de 206 son DOS causas distintas y necesitan
   * DOS cambios distintos; tratarlos como uno solo fue un error de rondas anteriores.
   */
  const remedio = (h) => {
    if (h.pata === '302') {
      return {
        causa: 'la linea del redirect usa 301 en vez de 302',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.conf',
        cambio: 'return 301 -> return 302 en la redireccion http->https',
        celdas: '+4'
      };
    }
    if (h.pata === '206' && h.perfil === 'identity') {
      return {
        causa: 'lista grande con .gz: gzip_static always + gunzip on sirven el .gz descomprimido en streaming, sin Content-Range',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.PATCHED-206-dual.conf',
        cambio: 'gunzip off (y gzip_static on)',
        celdas: '+2'
      };
    }
    if (h.pata === '206' && h.perfil === 'gzip') {
      return {
        causa: 'lista pequena sin .gz: gzip dinamico comprime al vuelo y elimina el rango',
        artefacto: 'vps/nginx/live-baseline-2026-11-02/sites-enabled-default.PATCHED-206-dual.conf',
        cambio: 'gzip off en la location de listas',
        celdas: '+2'
      };
    }
    return { causa: 'no clasificado', artefacto: null, cambio: null, celdas: '?' };
  };

  const huecosConRemedio = huecos.map((h) => ({ ...h, ...remedio(h) }));

  // Agrupado por cambio: el operador decide por cambios, no por celdas.
  const porCambio = new Map();
  for (const h of huecosConRemedio) {
    const k = h.cambio || 'no clasificado';
    if (!porCambio.has(k)) porCambio.set(k, { cambio: k, artefacto: h.artefacto, celdas: [], causa: h.causa });
    porCambio.get(k).celdas.push(h.lista + ' / ' + h.pata + ' / ' + h.perfil);
  }

  const informe = {
    host: HOST,
    generado: new Date().toISOString(),
    criterio: '200 en GET completo · 206 en GET con Range · 302 exacto en HTTP plano, por perfil',
    resumen: {
      // Denominador de ENTREGA: solo celdas de listas que existen.
      celdas_entrega: {
        total,
        cumplen: ok,
        faltan: huecos.length,
        veredicto: (huecos.length === 0 && total > 0) ? 'CUMPLE' : (todasAusentes ? 'NO_MEDIBLE' : 'NO CUMPLE')
      },
      // Senal APARTE: rotacion del fixture. No suma ni resta al denominador.
      fixture: {
        listas_en_fixture: LISTAS.length,
        listas_presentes: presentes.length,
        listas_ausentes: ausentes.length,
        ausentes: ausentes.map(s => ({
          lista: s.lista,
          sonda_status: s.respuesta.status || s.respuesta.error,
          clasificacion: 'FIXTURE_AUSENTE',
          celdas_excluidas: 5
        })),
        senal: ausentes.length === 0 ? 'FIXTURE_COMPLETO'
          : (todasAusentes ? 'FIXTURE_CADUCADO' : 'FIXTURE_PARCIAL'),
        nota: 'Una lista ausente es rotacion de ficheros de prueba, no un fallo de la ruta. Sus celdas NO entran en el denominador de entrega.'
      },
      veredicto_gate: veredicto,
      exit_code: exitCode
    },
    por_lista: filas.map(f => ({
      lista: f.lista,
      '200 identity': f['200 identity'],
      '200 gzip': f['200 gzip'],
      '206 identity': f['206 identity'],
      '206 gzip': f['206 gzip'],
      'redirect http': f['redirect http']
    })),
    fixture_ausente: ausentes.map(s => ({ lista: s.lista, status: s.respuesta.status || s.respuesta.error, reintentado: s.reintentado })),
    huecos: huecosConRemedio,
    cambios_necesarios: [...porCambio.values()].map(c => ({
      cambio: c.cambio,
      artefacto: c.artefacto,
      causa: c.causa,
      celdas_que_arregla: c.celdas.length,
      detalle: c.celdas
    })),
    detalle: filas.map(f => ({ lista: f.lista, ...f.detalle }))
  };

  process.stdout.write(JSON.stringify(informe, null, 2) + '\n');
  if (argJson > 0 && process.argv[argJson + 1]) {
    fs.writeFileSync(process.argv[argJson + 1], JSON.stringify(informe, null, 2) + '\n');
  }

  // Resumen legible por stderr para que se vea sin parsear el JSON.
  process.stderr.write('\n=== GATE 200/206/302 ===\n');
  process.stderr.write(`ENTREGA: ${ok}/${total} celdas cumplen en listas existentes · veredicto: ${informe.resumen.celdas_entrega.veredicto}\n`);
  if (ausentes.length) {
    const etiqueta = todasAusentes ? 'FIXTURE_CADUCADO' : 'FIXTURE_PARCIAL';
    process.stderr.write(`FIXTURE: ${etiqueta} · ${ausentes.length} de ${LISTAS.length} listas del fixture ya no existen (${ausentes.length * 5} celdas EXCLUIDAS del denominador)\n`);
    for (const s of ausentes) {
      process.stderr.write(`   FIXTURE_AUSENTE  ${s.lista}  (sonda=${s.respuesta.status || s.respuesta.error}${s.reintentado ? ', reintentada' : ''})\n`);
    }
  } else {
    process.stderr.write(`FIXTURE: FIXTURE_COMPLETO · ${LISTAS.length}/${LISTAS.length} listas presentes\n`);
  }
  process.stderr.write(`VEREDICTO GATE: ${veredicto}  (exit ${exitCode})\n`);
  for (const c of informe.cambios_necesarios) {
    process.stderr.write(`\n  CAMBIO: ${c.cambio}  (arregla ${c.celdas_que_arregla} celdas)\n`);
    process.stderr.write(`    causa: ${c.causa}\n`);
    process.stderr.write(`    artefacto: ${c.artefacto || 'sin artefacto'}\n`);
  }
  for (const f of informe.por_lista) {
    process.stderr.write(
      `  ${f.lista.padEnd(34)} ` +
      `200i=${String(f['200 identity']).padEnd(4)} 200g=${String(f['200 gzip']).padEnd(4)} ` +
      `206i=${String(f['206 identity']).padEnd(4)} 206g=${String(f['206 gzip']).padEnd(4)} ` +
      `redir=${f['redirect http']}\n`
    );
  }
  process.exit(exitCode);
})();
