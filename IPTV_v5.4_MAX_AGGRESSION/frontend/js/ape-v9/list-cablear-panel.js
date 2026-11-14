/**
 * APE · Panel de integración de listas — cablear UNA lista concreta
 * ------------------------------------------------------------------
 * Pedido del operador: "un campo para colocar una lista cualquiera que se desee cablear
 * para que el sistema la integre" — NO la última, sino UNA en particular.
 *
 * Contrato que implementa: contracts/list_cablear_panel_v1.json
 *   schema ape.lists.cablear_panel.contract.v1 · version 1.0.0 · status SPECIFIED_NOT_IMPLEMENTED
 *
 * Endpoints (definidos en t60 — este panel NO inventa rutas ni campos):
 *   POST /prisma/api/cablear.php          (form-urlencoded: lista, publicar, device, forzar)
 *   GET  /prisma/api/cablear-estado.php   (exactamente uno de: ticket | ultimos | lista)
 *
 * Reglas del contrato que se respetan aquí, literalmente:
 *   · localStorage['ape.cablear.ticket']  (nombre EXACTO) para reenganchar tras recargar
 *   · polling 1 s en `running`, 5 s en `queued`; sin websocket
 *   · terminales: done | failed | skipped_disk | expired
 *   · expired => 410 => borrar ticket y caer a ?ultimos=10
 *   · done    => url_cableada copiable + bytes + sha256 + contadores
 *   · failed  => error.codigo + error.motivo LITERAL
 *   · skipped_disk => "sin espacio" con los números + reintentar con forzar=1
 *
 * Additive por diseño: crea su propio DOM. Si existe #ape-cablear-host se monta ahí;
 * si no, se añade al final del <body> dentro de un <details> PLEGADO (no puede tapar
 * ni desplazar ninguna vista existente). No toca el generador ni ningún otro panel.
 */
(function () {
  'use strict';
  if (window.__APE_CABLEAR_PANEL__) return;
  window.__APE_CABLEAR_PANEL__ = true;

  // ── Constantes del contrato ────────────────────────────────────────────────
  var TICKET_KEY = 'ape.cablear.ticket';   // nombre exacto del contrato
  var LISTAS_KEY = 'ape.cablear.listas';   // historial local SOLO para sugerencias
  var POLL_QUEUED_MS = 5000;               // contrato: 5 s en queued
  var POLL_RUNNING_MS = 1000;              // contrato: 1 s en running
  var TERMINALES = { done: 1, failed: 1, skipped_disk: 1, expired: 1 };
  var URL_ENCOLAR = '/prisma/api/cablear.php';
  var URL_ESTADO = '/prisma/api/cablear-estado.php';

  var _timer = null;
  var _ticketActual = null;
  var _ultimo = null;

  // ── Utilidades ─────────────────────────────────────────────────────────────
  function base() { return String(window.APE_VPS_BASE || '').replace(/\/+$/, ''); }
  function abs(p) { return base() + p; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function leerTicket() { try { return localStorage.getItem(TICKET_KEY) || null; } catch (e) { return null; } }
  function guardarTicket(t) { try { if (t) localStorage.setItem(TICKET_KEY, t); } catch (e) { } }
  function borrarTicket() { try { localStorage.removeItem(TICKET_KEY); } catch (e) { } }

  function leerListas() {
    try { var a = JSON.parse(localStorage.getItem(LISTAS_KEY) || '[]'); return a instanceof Array ? a : []; } catch (e) { return []; }
  }
  function recordarLista(nombre) {
    if (!nombre) return;
    try {
      var a = leerListas().filter(function (x) { return x !== nombre; });
      a.unshift(nombre);
      localStorage.setItem(LISTAS_KEY, JSON.stringify(a.slice(0, 12)));
    } catch (e) { }
  }

  // El <datalist> se llena SOLO con nombres usados antes en este navegador.
  // (El contrato NO define un endpoint de listado de /lists/, así que no se inventa.)
  function refrescarDatalist() {
    var dl = document.getElementById('ape-cablear-listas');
    if (!dl) return;
    var html = '';
    var a = leerListas();
    for (var i = 0; i < a.length; i++) html += '<option value="' + esc(a[i]) + '"></option>';
    dl.innerHTML = html;
  }

  function bytes(n) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB']; var k = 0;
    while (v >= 1024 && k < u.length - 1) { v = v / 1024; k++; }
    return (Math.round(v * 10) / 10) + ' ' + u[k];
  }

  function txt(id, s) { var e = document.getElementById(id); if (e) e.textContent = (s == null ? '' : String(s)); }
  function show(id, on) { var e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; }

  // ── DOM ────────────────────────────────────────────────────────────────────
  function construir() {
    var wrap = document.createElement('div');
    wrap.id = 'ape-cablear-panel';
    wrap.className = 'ape-cablear-panel';
    wrap.innerHTML =
      '<style>' +
      '#ape-cablear-panel{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#e8e8e8;max-width:980px}' +
      '#ape-cablear-panel .cb-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}' +
      '#ape-cablear-panel input[type=text]{flex:1 1 380px;min-width:240px;padding:9px 11px;border-radius:8px;border:1px solid #3a3a3a;background:#141414;color:#f2f2f2;font-size:14px}' +
      '#ape-cablear-panel button{padding:9px 16px;border-radius:8px;border:1px solid #3a3a3a;background:#232323;color:#f2f2f2;font-size:14px;cursor:pointer}' +
      '#ape-cablear-panel button:hover{background:#2e2e2e}' +
      '#ape-cablear-panel button[disabled]{opacity:.45;cursor:not-allowed}' +
      '#ape-cablear-panel .cb-primary{background:#0b5cad;border-color:#0b5cad;font-weight:600}' +
      '#ape-cablear-panel .cb-primary:hover{background:#0d6ecb}' +
      '#ape-cablear-panel .cb-card{border:1px solid #333;border-radius:10px;padding:12px 14px;margin-top:10px;background:#101010}' +
      '#ape-cablear-panel .cb-kv{display:grid;grid-template-columns:190px 1fr;gap:4px 12px;font-size:13px}' +
      '#ape-cablear-panel .cb-k{color:#9aa0a6}' +
      '#ape-cablear-panel .cb-v{word-break:break-all}' +
      '#ape-cablear-panel .cb-st{font-weight:700}' +
      '#ape-cablear-panel .cb-ok{color:#57d68b}#ape-cablear-panel .cb-bad{color:#ff7b72}#ape-cablear-panel .cb-warn{color:#f0b429}' +
      '#ape-cablear-panel .cb-hint{color:#9aa0a6;font-size:12px}' +
      '#ape-cablear-panel .cb-bar{height:6px;background:#222;border-radius:4px;overflow:hidden;margin:6px 0}' +
      '#ape-cablear-panel .cb-bar>i{display:block;height:100%;width:0;background:#0b5cad;transition:width .35s}' +
      '#ape-cablear-panel .cb-url{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '#ape-cablear-panel .cb-url code{background:#0b0b0b;border:1px solid #333;border-radius:6px;padding:6px 8px;font-size:12px;word-break:break-all}' +
      '</style>' +
      '<div class="cb-row">' +
      '  <input id="ape-cablear-lista" type="text" list="ape-cablear-listas" maxlength="2048" spellcheck="false" ' +
      '         placeholder="nombre de una lista de /lists/ (p.ej. APE_LISTA_1794100720046.m3u8) o URL http(s)" />' +
      '  <datalist id="ape-cablear-listas"></datalist>' +
      '  <button id="ape-cablear-go" class="cb-primary" type="button">Cablear</button>' +
      '  <button id="ape-cablear-last" type="button" title="Reengancha el último trabajo (GET ?ultimos=10)">Último trabajo</button>' +
      '</div>' +
      '<div class="cb-hint">Se cablea EXACTAMENTE la lista que escribas aquí (no la más reciente). ' +
      'Las URLs externas solo pasan si el host está en la allowlist del VPS; si no, el servidor responde E_HOST_NO_PERMITIDO y se muestra tal cual.</div>' +
      '<div class="cb-row" style="margin-top:4px">' +
      '  <label class="cb-hint" style="display:flex;gap:7px;align-items:center;cursor:pointer">' +
      '    <input id="ape-cablear-publicar" type="checkbox" />' +
      '    publicar (deja el fichero en /lists/ y devuelve url_cableada; sin marcar, queda en staging y la URL es null)' +
      '  </label>' +
      '</div>' +

      '<div id="ape-cablear-estado-card" class="cb-card" style="display:none">' +
      '  <div class="cb-row" style="margin:0 0 6px 0">' +
      '    <span id="ape-cablear-estado" class="cb-st">—</span>' +
      '    <span id="ape-cablear-fase" class="cb-hint"></span>' +
      '    <span id="ape-cablear-ticket" class="cb-hint"></span>' +
      '  </div>' +
      '  <div id="ape-cablear-bar-wrap" class="cb-bar" style="display:none"><i id="ape-cablear-bar"></i></div>' +
      '  <div id="ape-cablear-kv" class="cb-kv"></div>' +
      '  <div id="ape-cablear-url-wrap" class="cb-card" style="display:none">' +
      '    <div class="cb-hint" style="margin-bottom:6px">URL cableada:</div>' +
      '    <div class="cb-url"><code id="ape-cablear-url"></code>' +
      '      <button id="ape-cablear-copy" type="button">Copiar</button></div>' +
      '  </div>' +
      '  <div class="cb-row">' +
      '    <button id="ape-cablear-retry" type="button" style="display:none">Reintentar (forzar=1)</button>' +
      '    <button id="ape-cablear-clear" type="button">Limpiar</button>' +
      '  </div>' +
      '</div>';

    var host = document.getElementById('ape-cablear-host');
    if (host) { host.appendChild(wrap); return; }

    // Sin host: <details> plegado al final del body. Aditivo y no invasivo.
    var d = document.createElement('details');
    d.id = 'ape-cablear-details';
    d.style.cssText = 'margin:18px auto 40px;max-width:980px;padding:0 12px';
    var s = document.createElement('summary');
    s.textContent = '🔌 Integración de listas — cablear UNA lista concreta';
    s.style.cssText = 'cursor:pointer;font:600 15px system-ui,Segoe UI,Roboto,sans-serif;color:#cfd8dc;padding:8px 0';
    d.appendChild(s);
    d.appendChild(wrap);
    (document.body || document.documentElement).appendChild(d);
  }

  // ── HTTP ───────────────────────────────────────────────────────────────────
  // Clave opcional X-APE-Key: el backend la exige SOLO si el VPS define APE_CABLEAR_KEY.
  // Si la pagina la expone (o esta en localStorage), se envia; si no, no se inventa nada.
  function clave() {
    var k = (window.APE_CABLEAR_KEY != null) ? String(window.APE_CABLEAR_KEY) : '';
    if (!k) { try { k = localStorage.getItem('ape.cablear.key') || ''; } catch (e) { k = ''; } }
    return k;
  }

  function pedir(url, opciones, cb) {
    if (typeof fetch !== 'function') { cb({ red: true, motivo: 'fetch no disponible en este navegador' }); return; }
    fetch(url, opciones).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        cb({ http: r.status, ok: r.ok, json: j, raw: t, url: url });
      });
    })['catch'](function (e) {
      cb({ red: true, motivo: (e && e.message) ? e.message : 'fallo de red' });
    });
  }

  // Motivo LITERAL del servidor. Nunca se disfraza: si dice skipped_disk, dice skipped_disk.
  // Soporta las DOS formas que existen hoy:
  //   · PLANA (implementacion t60, list-cablear.php): { ok:false, error:'E_CODE', motivo:'texto' }
  //   · ANIDADA (redaccion del contrato t59):         { error:{ codigo:'E_CODE', motivo:'texto' } }
  function motivoLiteral(res) {
    var j = (res && res.json) || null;
    var cod = '', mot = '';
    if (j) {
      if (j.error && typeof j.error === 'object') {
        cod = j.error.codigo ? String(j.error.codigo) : '';
        mot = j.error.motivo ? String(j.error.motivo) : '';
      } else if (j.error) {
        cod = String(j.error);
        mot = j.motivo ? String(j.motivo) : '';
      }
      if (!cod && !mot && j.motivo) mot = String(j.motivo);
    }
    if (cod && mot) return cod + ' · ' + mot;
    if (cod || mot) return cod || mot;
    if (res && res.http) return 'HTTP ' + res.http + ((res.raw) ? ' · ' + String(res.raw).slice(0, 400) : '');
    if (res && res.motivo) return String(res.motivo);
    return 'sin motivo informado por el servidor';
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function fila(k, v, cls) {
    return '<div class="cb-k">' + esc(k) + '</div><div class="cb-v ' + (cls || '') + '">' + esc(v) + '</div>';
  }

  function pintarEstado(res) {
    var j = (res && res.json) || null;
    if (!j) {
      show('ape-cablear-estado-card', true);
      txt('ape-cablear-estado', 'sin respuesta interpretable');
      document.getElementById('ape-cablear-estado').className = 'cb-st cb-bad';
      document.getElementById('ape-cablear-kv').innerHTML = fila('motivo', motivoLiteral(res), 'cb-bad');
      show('ape-cablear-bar-wrap', false);
      return;
    }
    _ultimo = j;
    var estado = String(j.estado || '');
    var esTerminal = !!TERMINALES[estado];
    var fase = j.fase ? String(j.fase) : '';
    var pr = j.progreso || {};
    var sa = j.salida || {};
    var ts = j.timestamps || {};
    var err = j.error || null;

    show('ape-cablear-estado-card', true);
    var elEstado = document.getElementById('ape-cablear-estado');
    elEstado.textContent = estado || '(sin estado)';
    elEstado.className = 'cb-st ' + (estado === 'done' ? 'cb-ok' : (estado === 'failed' || estado === 'skipped_disk' || estado === 'expired') ? 'cb-bad' : 'cb-warn');
    txt('ape-cablear-fase', fase ? ('fase: ' + fase) : '');
    txt('ape-cablear-ticket', j.ticket ? ('ticket: ' + j.ticket) : '');

    // Barra de progreso: el contrato no da un %, así que es INDETERMINADA mientras corre.
    var enCurso = (estado === 'queued' || estado === 'running');
    show('ape-cablear-bar-wrap', enCurso);
    if (enCurso) {
      var bar = document.getElementById('ape-cablear-bar');
      if (bar) bar.style.width = (estado === 'running' ? '70%' : '25%');
    }

    var kv = '';
    if (j.ticket) kv += fila('ticket', j.ticket);
    if (estado) kv += fila('estado', estado);
    if (fase) kv += fila('fase', fase);
    if (typeof j.cola_posicion === 'number') kv += fila('posición en cola', String(j.cola_posicion));
    if (j.entrada) {
      kv += fila('entrada.tipo', j.entrada.tipo);
      kv += fila('entrada.ref', j.entrada.ref);
      if (j.entrada.bytes) kv += fila('entrada.bytes', bytes(j.entrada.bytes) + ' (' + j.entrada.bytes + ' B)');
      if (j.entrada.sha256) kv += fila('entrada.sha256', j.entrada.sha256);
    }
    if (pr && (pr.lineas || pr.canales || pr.envueltos || pr.bytes_salida)) {
      kv += fila('progreso.lineas', String(pr.lineas || 0));
      kv += fila('progreso.canales', String(pr.canales || 0));
      kv += fila('progreso.envueltos', String(pr.envueltos || 0));
      kv += fila('progreso.ya_estaban', String(pr.ya_estaban || 0));
      kv += fila('progreso.sin_id', String(pr.sin_id || 0), (pr.sin_id > 0 ? 'cb-warn' : ''));
      if (pr.bytes_salida) kv += fila('progreso.bytes_salida', bytes(pr.bytes_salida));
    }
    if (sa && (sa.nombre || sa.bytes || sa.sha256 || sa.url_cableada)) {
      if (sa.nombre) kv += fila('salida.nombre', sa.nombre);
      if (sa.bytes) kv += fila('salida.bytes', bytes(sa.bytes) + ' (' + sa.bytes + ' B)');
      if (sa.sha256) kv += fila('salida.sha256', sa.sha256);
      kv += fila('salida.publicada', sa.publicada ? 'sí' : 'no');
      if (sa.reutilizada) kv += fila('salida.reutilizada', 'sí (ya existía)');
    }
    if (ts.encolado) kv += fila('encolado', ts.encolado);
    if (ts.iniciado) kv += fila('iniciado', ts.iniciado);
    if (ts.terminado) kv += fila('terminado', ts.terminado);
    if (ts.heartbeat) kv += fila('heartbeat', ts.heartbeat);
    if (j.intentos) kv += fila('intentos', String(j.intentos));
    if (j.wiring_version) kv += fila('wiring_version', j.wiring_version);

    // Advertencia honesta del contrato: canales que quedaron directos.
    if (pr && Number(pr.sin_id) > 0) {
      kv += fila('aviso', Number(pr.sin_id) + ' canales no se pudieron envolver (sin id reconocible) y quedaron directos', 'cb-warn');
    }
    // Motivo LITERAL cuando hay error (failed / skipped_disk / rechazo).
    if (err) kv += fila('error', motivoLiteral({ json: { error: err, motivo: j.motivo } }), 'cb-bad');

    // publicar=0 => url_cableada es null A PROPOSITO (invariante I3 del contrato/implementacion).
    // Se dice con esas palabras en vez de dejar al operador esperando una URL que no va a venir.
    if (estado === 'done' && sa && sa.publicada === false) {
      kv += fila('aviso', 'no publicada (publicar=0): url_cableada = null por diseño (invariante I3). ' +
        'El fichero queda en staging; activa «publicar» y reintenta para obtener la URL en /lists/', 'cb-warn');
    }

    document.getElementById('ape-cablear-kv').innerHTML = kv;

    // URL cableada + botón copiar (solo cuando existe)
    var url = sa && sa.url_cableada ? String(sa.url_cableada) : '';
    show('ape-cablear-url-wrap', !!url);
    if (url) txt('ape-cablear-url', url);

    // Reintento: el contrato exige forzar=1 para re-cablear la misma fuente.
    show('ape-cablear-retry', (estado === 'failed' || estado === 'skipped_disk'));

    // expired => borrar ticket y caer a ?ultimos=10 (regla del contrato)
    if (estado === 'expired') {
      borrarTicket();
      _ticketActual = null;
      setTimeout(function () { consultarUltimos(); }, 300);
    }
    if (esTerminal && estado !== 'expired') {
      // terminal: se deja el ticket en localStorage para poder revisarlo, salvo expired.
    }
    pararPoll();
    if (!esTerminal) programarPoll(estado);
  }

  // ── Polling ────────────────────────────────────────────────────────────────
  function pararPoll() { if (_timer) { clearTimeout(_timer); _timer = null; } }

  function programarPoll(estado) {
    pararPoll();
    var ms = (estado === 'running') ? POLL_RUNNING_MS : POLL_QUEUED_MS;
    _timer = setTimeout(function () {
      if (_ticketActual) consultarTicket(_ticketActual);
      else consultarUltimos();
    }, ms);
  }

  function consultarTicket(ticket) {
    _ticketActual = ticket;
    var h = { 'Cache-Control': 'no-store' };
    var k = clave(); if (k) h['X-APE-Key'] = k;
    pedir(abs(URL_ESTADO) + '?ticket=' + encodeURIComponent(ticket), { method: 'GET', cache: 'no-store', headers: h }, function (res) {
      if (res.http === 410) {
        // contrato: 410 => ticket desconocido/expirado. El backend ya manda estado:'expired'
        // y su motivo literal; se usan si vienen y solo se rellenan si faltan.
        borrarTicket(); _ticketActual = null;
        var jj = (res && res.json) || {};
        pintarEstado({ http: 410, json: {
          estado: 'expired',
          ticket: ticket,
          error: jj.error ? jj.error : 'E_TICKET_DESCONOCIDO',
          motivo: jj.motivo ? jj.motivo : 'el ticket ya no existe'
        } });
        return;
      }
      pintarEstado(res);
    });
  }

  function consultarUltimos() {
    var h = { 'Cache-Control': 'no-store' };
    var k = clave(); if (k) h['X-APE-Key'] = k;
    pedir(abs(URL_ESTADO) + '?ultimos=10', { method: 'GET', cache: 'no-store', headers: h }, function (res) {
      var j = res && res.json;
      // Forma REAL de t60: { ok:true, count:N, tickets:[ ...body... ] }.
      // Se aceptan tambien array plano y objeto unico, sin inventar campos.
      var item = null;
      if (j instanceof Array) item = j.length ? j[0] : null;
      else if (j && j.tickets instanceof Array) item = j.tickets.length ? j.tickets[0] : null;
      else if (j && j.ticket) item = j;
      if (item && item.ticket) { guardarTicket(item.ticket); consultarTicket(item.ticket); return; }
      if (res && res.http && res.http !== 200) {
        pintarEstado({ http: res.http, json: { estado: 'failed', error: (res.json && res.json.error) ? res.json.error : ('HTTP_' + res.http), motivo: motivoLiteral(res) } });
        return;
      }
      pintarEstado({ http: 200, json: { estado: 'expired', error: 'SIN_TRABAJOS', motivo: 'no hay trabajos recientes en el servidor' } });
    });
  }

  // ── Encolar ────────────────────────────────────────────────────────────────
  function encolar(forzar) {
    var inp = document.getElementById('ape-cablear-lista');
    var lista = inp ? String(inp.value || '').trim() : '';
    if (!lista) {
      pintarEstado({ http: 0, json: { estado: 'failed', error: { codigo: 'E_LISTA_REQUERIDA', motivo: 'escribe el nombre de la lista o la URL antes de cablear' } } });
      return;
    }
    var btn = document.getElementById('ape-cablear-go');
    if (btn) btn.disabled = true;

    var pubChk = document.getElementById('ape-cablear-publicar');
    var publicar = (pubChk && pubChk.checked) ? '1' : '0';
    var cuerpo = 'lista=' + encodeURIComponent(lista) +
                 '&publicar=' + publicar +
                 '&forzar=' + (forzar ? '1' : '0');
    // device es opcional en el contrato (regex ^[A-Za-z0-9_-]{16,512}$): se envía solo si la página lo expone válido.
    var dev = window.APE_DEVICE_ID ? String(window.APE_DEVICE_ID) : '';
    if (/^[A-Za-z0-9_-]{16,512}$/.test(dev)) cuerpo += '&device=' + encodeURIComponent(dev);

    recordarLista(lista);
    refrescarDatalist();

    var cabeceras = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' };
    var kk = clave(); if (kk) cabeceras['X-APE-Key'] = kk;

    pedir(abs(URL_ENCOLAR), {
      method: 'POST',
      headers: cabeceras,
      body: cuerpo,
      cache: 'no-store'
    }, function (res) {
      if (btn) btn.disabled = false;
      var j = res && res.json;

      // 202 queued · 200 duplicado  → hay ticket
      if (j && (res.http === 202 || res.http === 200) && j.ticket) {
        _ticketActual = String(j.ticket);
        guardarTicket(_ticketActual);
        var nota = (j.estado === 'duplicado')
          ? 'duplicado: ya había un trabajo para esta misma fuente; se reengancha el ticket existente'
          : '';
        pintarEstado({ http: res.http, json: {
          estado: (j.estado === 'duplicado' ? 'queued' : (j.estado || 'queued')),
          ticket: _ticketActual,
          cola_posicion: (typeof j.cola_posicion === 'number' ? j.cola_posicion : undefined),
          error: nota ? { codigo: 'DUPLICADO', motivo: nota } : null
        } });
        return;
      }

      // 507 (disco) y demás rechazos: motivo LITERAL del servidor, sin disfrazar.
      // El backend emite la forma PLANA { ok:false, error:'E_CODE', motivo:'texto' }.
      var estado = (res.http === 507) ? 'skipped_disk' : 'failed';
      pintarEstado({ http: res.http, json: {
        estado: estado,
        error: (j && j.error) ? j.error : ('HTTP_' + res.http),
        motivo: (j && j.motivo) ? j.motivo : motivoLiteral(res)
      } });
    });
  }

  // ── Copiar ─────────────────────────────────────────────────────────────────
  function copiar() {
    var url = document.getElementById('ape-cablear-url');
    var texto = url ? String(url.textContent || '') : '';
    if (!texto) return;
    var btn = document.getElementById('ape-cablear-copy');
    function hecho(ok) {
      if (!btn) return;
      var prev = btn.textContent;
      btn.textContent = ok ? '¡Copiado!' : 'No se pudo copiar';
      setTimeout(function () { btn.textContent = prev; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(function () { hecho(true); })['catch'](function () { hecho(fallbackCopiar(texto)); });
    } else {
      hecho(fallbackCopiar(texto));
    }
  }
  function fallbackCopiar(texto) {
    try {
      var ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  // ── Arranque ───────────────────────────────────────────────────────────────
  function init() {
    construir();
    refrescarDatalist();

    var go = document.getElementById('ape-cablear-go');
    if (go) go.addEventListener('click', function () { encolar(false); });
    var inp = document.getElementById('ape-cablear-lista');
    if (inp) inp.addEventListener('keydown', function (e) { if (e && e.key === 'Enter') encolar(false); });
    var last = document.getElementById('ape-cablear-last');
    if (last) last.addEventListener('click', consultarUltimos);
    var cp = document.getElementById('ape-cablear-copy');
    if (cp) cp.addEventListener('click', copiar);
    var rt = document.getElementById('ape-cablear-retry');
    if (rt) rt.addEventListener('click', function () { encolar(true); });
    var cl = document.getElementById('ape-cablear-clear');
    if (cl) cl.addEventListener('click', function () {
      pararPoll(); borrarTicket(); _ticketActual = null; _ultimo = null;
      show('ape-cablear-estado-card', false);
      var i2 = document.getElementById('ape-cablear-lista'); if (i2) i2.value = '';
    });

    // Reenganche tras recargar (regla del contrato): si hay ticket guardado, ?ticket=.
    // El ticket NO se escribe en el campo lista: son cosas distintas.
    var t = leerTicket();
    if (t) consultarTicket(t);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API mínima para pruebas manuales desde la consola.
  window.APE_CABLEAR = {
    encolar: encolar,
    consultarTicket: consultarTicket,
    consultarUltimos: consultarUltimos,
    estadoActual: function () { return _ultimo; },
    ticketKey: TICKET_KEY,
    endpoints: { encolar: URL_ENCOLAR, estado: URL_ESTADO }
  };
})();
