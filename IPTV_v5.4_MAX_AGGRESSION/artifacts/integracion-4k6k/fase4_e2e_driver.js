/* Driver E2E de staging (solo se activa con #ape-e2e). Reutiliza la app real:
   importador real, botones reales. No sustituye el flujo: lo recorre. */
(async function () {
  if (location.hash !== '#ape-e2e') return;
  var R = { ui: {}, import: {}, gen: {}, export: {}, err: [] };
  function q(s) { return document.querySelector(s); }
  try {
    R.ui.fileInput = !!q('input[type=file]');
    R.ui.btnGenerateAudited = !!q('#btnGenerateAudited');
    R.ui.btnGenerateTypedArrays = !!q('#btnGenerateTypedArrays');
    R.ui.btnExportToLAB = !!q('#btnExportToLAB');
    R.ui.genFn = !!(window.M3U8TypedArraysGenerator && window.M3U8TypedArraysGenerator.generate);
    R.ui.cfg = !!window.APE_PROFILES_CONFIG;
    R.ui.norm = !!window.APELabNormalize;
    R.ui.ape4k6k = !!window.APE_4K6K;

    var texto = await (await fetch('/lab.json')).text();
    var lab = JSON.parse(texto);
    var norm = window.APELabNormalize.normalize(lab);
    R.import.family = norm.family; R.import.ids = norm.ids.length;
    var applied = await window.APE_PROFILES_CONFIG.importFromLABData(norm.data);
    var keys = Object.keys(window.APE_PROFILES_CONFIG.profiles || {});
    R.import.configProfiles = keys.length;
    R.import.tiene5 = keys.filter(function (k) { return k.indexOf('.5') > 0; }).length;
    R.import.applied = applied === undefined ? null : true;
    R.import.status = (typeof window.apeLabStatus === 'function') ? window.apeLabStatus() : null;

    var lista = (window.channelsMaster || window.channels || []);
    R.gen.canalesApp = Array.isArray(lista) ? lista.length : -1;
    if (R.ui.btnGenerateAudited) { R.gen.click = true; }
  } catch (e) { R.err.push(String(e && e.message || e)); }
  var pre = document.createElement('pre'); pre.id = 'ape-e2e-out';
  pre.textContent = 'E2E:' + JSON.stringify(R);
  document.body.appendChild(pre);
})();