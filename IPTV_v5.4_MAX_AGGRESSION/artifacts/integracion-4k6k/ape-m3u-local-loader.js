/* [FASE 4] Cargador M3U local mínimo (control que faltaba). No crea un generador
   ni una ruta paralela: parsea texto M3U y lo entrega al MISMO estado que usa la
   app (window.app.state.channelsMaster). Conserva el resto del estado. */
(function (root) {
  'use strict';
  function attrs(s) {
    var o = {}, re = /([A-Za-z0-9_-]+)="([^"]*)"/g, m;
    while ((m = re.exec(s))) o[m[1].toLowerCase()] = m[2];
    return o;
  }
  function parse(texto) {
    var lineas = String(texto || '').split(/\r?\n/);
    var canales = [], actual = null;
    for (var i = 0; i < lineas.length; i++) {
      var l = lineas[i];
      if (l.indexOf('#EXTINF:') === 0) {
        var coma = l.indexOf(',');
        var a = attrs(coma > 0 ? l.slice(0, coma) : l);
        actual = {
          id: a['tvg-id'] || a['tvg-chno'] || '',
          tvg_id: a['tvg-id'] || '',
          name: coma > 0 ? l.slice(coma + 1).trim() : (a['tvg-name'] || ''),
          tvg_logo: a['tvg-logo'] || '',
          group: a['group-title'] || '',
          url: ''
        };
      } else if (actual && /^https?:\/\//.test(l)) {
        actual.url = l.trim(); canales.push(actual); actual = null;
      }
    }
    return canales;
  }
  function load(texto) {
    var app = root.app;
    if (!app || !app.state) throw new Error('app.state no disponible');
    var lista = parse(texto);
    if (!lista.length) throw new Error('M3U sin canales');
    app.state.channelsMaster = lista;
    app.state.channelsFiltered = lista;
    if (typeof app.renderChannels === 'function') { try { app.renderChannels(); } catch (e) {} }
    return lista.length;
  }
  function wire() {
    var inp = document.getElementById('apeM3uLocal');
    if (!inp || inp.dataset.wired) return;
    inp.dataset.wired = '1';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { var n = load(String(fr.result)); console.log('[APE-M3U-LOCAL] canales=' + n); }
        catch (e) { console.error('[APE-M3U-LOCAL] ' + e.message); }
      };
      fr.readAsText(f, 'utf-8');
    });
  }

  /* Lectura en STREAMING: no materializa el archivo completo en una cadena.
     Necesario para listas de cientos de MB (medido: resp.text() falla a 754 MB). */
  async function cargarStream(url, opciones) {
    var o = opciones || {};
    var resp = await fetch(url, o.fetchInit || {});
    if (!resp.ok) throw new Error('http_' + resp.status);
    var reader = resp.body.getReader();
    var dec = new TextDecoder('utf-8');
    var resto = '', canales = 0, bytes = 0, actual = null, t0 = performance.now();
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      bytes += r.value.length;
      resto += dec.decode(r.value, { stream: true });
      var idx;
      while ((idx = resto.indexOf('\n')) >= 0) {
        var l = resto.slice(0, idx); resto = resto.slice(idx + 1);
        if (l.indexOf('#EXTINF:') === 0) { actual = true; }
        else if (actual && /^https?:\/\//.test(l)) { canales++; actual = null; }
      }
      if (o.onProgress && canales % 1000 === 0) { o.onProgress({ bytes: bytes, canales: canales }); }
    }
    return { canales: canales, bytes: bytes, ms: Math.round(performance.now() - t0) };
  }
  root.APEM3uLocal = { parse: parse, load: load, wire: wire, cargarStream: cargarStream };
  if (document.readyState !== 'loading') wire(); else document.addEventListener('DOMContentLoaded', wire);
})(typeof globalThis !== 'undefined' ? globalThis : this);