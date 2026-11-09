/* ═══════════════════════════════════════════════════════════════════════════
 * LEY DE PRESERVACION — invariantes duras de la alineacion
 *
 * El operador (2026-11-08): "tiene que usar los mismos campos que encuentre
 * implementados, pero mejorando u organizando su valor en cascada, NO acepta que
 * elimine campos, como minimo que los deje igual... recortar o colocar menos
 * headers NO lo hace mejor... tiene prohibido borrar valores y dejarlos en
 * blanco, las cascadas son de 4... nunca cascadas con 3 valores."
 *
 * Esto NO es una recomendacion: es un GATE. Cada diff propuesto pasa por
 * guardDiff() y si viola una regla se DESCARTA y se reporta con su motivo.
 * ═══════════════════════════════════════════════════════════════════════════ */

var PRESERVATION_LAW = {
  // 1. Ningun campo del perfil puede desaparecer.
  NO_DELETE_FIELDS: true,
  // 2. Ningun valor puede quedar vacio, null, undefined o solo espacios.
  NO_BLANK_VALUES: true,
  // 3. El numero de headers no puede bajar (recortar no es mejorar).
  NO_REDUCE_HEADERS: true,
  // 4. Una cascada tiene EXACTAMENTE 4 niveles. Si el valor actual tiene 4 y el
  //    nuevo no, se deja INTACTA. Nunca 3, nunca 5.
  CASCADE_LENGTH: 4,
  // 5. Si el valor actual ya es el mejor segun la metrica del campo, no se toca.
  KEEP_IF_BETTER: true,
  // 6. Se pueden AGREGAR campos; nunca es obligatorio.
  ALLOW_ADD: true,
  VERSION: '1.0'
};

/* Campos donde MAYOR es mejor (calidad y margen). Todo lo que no este aqui se
 * rige por el valor calculado del motor: no se compara, se aplica. */
var HIGHER_IS_BETTER = {
  resolution: true, bitrate: true, fps: true, buffer: true, bufferSeconds: true,
  playerBuffer: true, t1: true, t2: true,
  'network-caching': true, 'live-caching': true, 'file-caching': true,
  'clock-jitter': true, 'http-max-retries': true,
  'inputstream.adaptive.max_resolution': true,
  'inputstream.adaptive.max_bitrate': true,
  'inputstream.adaptive.min_bandwidth': true,
  min_bandwidth_mbps: true, prefetch_segments: true, parallel_downloads: true,
  buffer_target_seconds: true, segments_ahead: true, parallel_workers: true,
  'X-APE-RESOLUTION': true, 'X-APE-BITRATE': true, 'X-APE-TARGET-BITRATE': true,
  'X-APE-FPS': true, 'X-Max-Resolution': true, 'X-Max-Bitrate': true,
  'X-Stream-Resolution': true, 'X-Stream-Bitrate': true, 'X-Min-Bitrate': true,
  'X-Network-Caching': true, 'X-Live-Caching': true, 'X-File-Caching': true,
  'X-Buffer-Target': true, 'X-Buffer-Max': true, 'X-Buffer-Min': true,
  'X-APE-Prefetch-Segments': true, 'X-Prefetch-Segments': true,
  'X-Parallel-Segments': true, 'X-Concurrent-Downloads': true
};

/* ¿El valor esta vacio segun la ley? Vacio, null, undefined, solo espacios. */
function isBlankValue(v) {
  if (v === null || v === undefined) return true;
  var s = String(v);
  if (s.trim() === '') return true;
  // "null"/"undefined"/"NaN" como texto tambien son un valor borrado disfrazado
  if (/^(null|undefined|nan|none)$/i.test(s.trim())) return true;
  return false;
}

/* ¿El valor tiene forma de cascada? CSV de numeros o de WxH. */
function cascadeLen(v) {
  var s = String(v);
  if (s.indexOf(',') < 0) return 0;
  var parts = s.split(',');
  var allNumeric = parts.every(function (p) {
    p = p.trim();
    return /^-?\d+(\.\d+)?$/.test(p) || /^\d+x\d+$/.test(p);
  });
  return allNumeric ? parts.length : 0;
}

/* Primer numero de un valor (para comparar resoluciones, bitrates, etc.). */
function firstNumber(v) {
  var s = String(v);
  var m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/* Compara dos valores numericos segun la metrica del campo.
 * Devuelve true si `after` es ESTRICTAMENTE PEOR que `before`. */
function isWorse(key, before, after) {
  if (!HIGHER_IS_BETTER[key]) return false;   // no comparable: no se juzga
  var b = firstNumber(before), a = firstNumber(after);
  if (b === null || a === null) return false;
  return a < b;                                // menor = peor en estos campos
}

/* GATE: valida UN diff contra la ley. Devuelve {ok, motivo}. */
function guardDiff(d, gestorProfile) {
  var L = PRESERVATION_LAW;
  var path = String(d.path || '');
  var sec = path.split('.')[0];
  var key = path.split('.').slice(1).join('.');
  var before = d.before;
  var after = d.after;

  // ── 2. NO DEJAR EN BLANCO (la regla mas dura) ──────────────────────────
  if (L.NO_BLANK_VALUES && isBlankValue(after)) {
    return { ok: false, regla: 'NO_BLANK_VALUES', motivo: path + ': el valor propuesto esta vacio' };
  }

  // Un valor que YA estaba en blanco no se toca: se deja igual (instruccion
  // del operador: "solo omita los que encuentre en blanco... o los deja igual").
  if (L.NO_BLANK_VALUES && before !== null && before !== undefined && isBlankValue(before)) {
    return { ok: false, regla: 'BLANK_PRESERVED', motivo: path + ': el original estaba en blanco, se deja igual' };
  }

  // ── 4. CASCADAS DE 4 ───────────────────────────────────────────────────
  var nBefore = cascadeLen(before);
  var nAfter = cascadeLen(after);
  if (nBefore > 0) {
    // era una cascada: el resultado tiene que seguir siendo de 4
    if (nAfter !== L.CASCADE_LENGTH) {
      return {
        ok: false, regla: 'CASCADE_LENGTH',
        motivo: path + ': la cascada tenia ' + nBefore + ' niveles y el resultado ' +
                (nAfter === 0 ? 'deja de ser cascada' : 'tiene ' + nAfter) +
                '; se exige ' + L.CASCADE_LENGTH + ' o dejarla intacta'
      };
    }
    if (nBefore !== L.CASCADE_LENGTH && nAfter !== nBefore) {
      return {
        ok: false, regla: 'CASCADE_LENGTH',
        motivo: path + ': la cascada original tenia ' + nBefore + ' niveles; no se cambia a ' + nAfter
      };
    }
  } else if (nAfter > 0 && nAfter !== L.CASCADE_LENGTH) {
    // convertir un escalar en cascada SOLO es legal si da exactamente 4
    return {
      ok: false, regla: 'CASCADE_LENGTH',
      motivo: path + ': se intenta crear una cascada de ' + nAfter + ' niveles; se exige ' + L.CASCADE_LENGTH
    };
  }

  // ── 5. SI EL ACTUAL ES MEJOR, NO SE TOCA ───────────────────────────────
  if (L.KEEP_IF_BETTER && before !== null && before !== undefined && isWorse(key, before, after)) {
    return {
      ok: false, regla: 'KEEP_IF_BETTER',
      motivo: path + ': el actual (' + String(before).slice(0, 24) + ') es mejor que el propuesto (' +
              String(after).slice(0, 24) + '); se deja quieto'
    };
  }

  return { ok: true, regla: null, motivo: null };
}

/* Aplica el gate a TODA la lista de diffs. Devuelve los aceptados y los
 * rechazados con su motivo, mas el conteo por regla. */
function guardDiffs(diffs, gestorProfile) {
  var aceptados = [];
  var rechazados = [];
  var porRegla = {};
  for (var i = 0; i < (diffs || []).length; i++) {
    var d = diffs[i];
    var g = guardDiff(d, gestorProfile);
    if (g.ok) {
      aceptados.push(d);
    } else {
      rechazados.push({ path: d.path, regla: g.regla, motivo: g.motivo, before: d.before, after: d.after });
      porRegla[g.regla] = (porRegla[g.regla] || 0) + 1;
    }
  }
  return { aceptados: aceptados, rechazados: rechazados, porRegla: porRegla };
}

/* Invariante de CIERRE: tras aplicar los diffs, el perfil debe conservar
 * TODAS las claves que tenia. Se comprueba comparando los conjuntos. */
function verifyNoFieldLost(beforeProfile, afterProfile) {
  var perdidos = [];
  if (!beforeProfile || !afterProfile) return { ok: true, perdidos: perdidos, total: 0 };
  for (var sec in beforeProfile) {
    if (!Object.prototype.hasOwnProperty.call(beforeProfile, sec)) continue;
    var b = beforeProfile[sec];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    var a = afterProfile[sec];
    if (!a || typeof a !== 'object') { perdidos.push(sec + '.* (seccion completa)'); continue; }
    for (var k in b) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      if (!Object.prototype.hasOwnProperty.call(a, k)) perdidos.push(sec + '.' + k);
    }
  }
  return { ok: perdidos.length === 0, perdidos: perdidos.slice(0, 20), total: perdidos.length };
}

/* Invariante de cierre: ninguna cascada termino con un numero distinto de 4. */
function verifyCascadesIntact(beforeProfile, afterProfile) {
  var rotas = [];
  if (!beforeProfile || !afterProfile) return { ok: true, rotas: rotas };
  for (var sec in beforeProfile) {
    var b = beforeProfile[sec];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    var a = afterProfile[sec];
    if (!a || typeof a !== 'object') continue;
    for (var k in b) {
      var nb = cascadeLen(b[k]);
      if (nb === 0) continue;
      var na = cascadeLen(a[k]);
      if (na !== nb) rotas.push(sec + '.' + k + ': ' + nb + ' -> ' + na);
    }
  }
  return { ok: rotas.length === 0, rotas: rotas.slice(0, 20), total: rotas.length };
}

/* Invariante de cierre: ningun valor que antes no estaba en blanco quedo en blanco. */
function verifyNoBlanks(beforeProfile, afterProfile) {
  var vacios = [];
  if (!beforeProfile || !afterProfile) return { ok: true, vacios: vacios };
  for (var sec in beforeProfile) {
    var b = beforeProfile[sec];
    if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
    var a = afterProfile[sec];
    if (!a || typeof a !== 'object') continue;
    for (var k in b) {
      if (isBlankValue(b[k])) continue;          // ya estaba en blanco: no cuenta
      if (isBlankValue(a[k])) vacios.push(sec + '.' + k);
    }
  }
  return { ok: vacios.length === 0, vacios: vacios.slice(0, 20), total: vacios.length };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PRESERVATION_LAW: PRESERVATION_LAW, HIGHER_IS_BETTER: HIGHER_IS_BETTER,
    isBlankValue: isBlankValue, cascadeLen: cascadeLen, isWorse: isWorse,
    guardDiff: guardDiff, guardDiffs: guardDiffs,
    verifyNoFieldLost: verifyNoFieldLost, verifyCascadesIntact: verifyCascadesIntact,
    verifyNoBlanks: verifyNoBlanks
  };
}
if (typeof window !== 'undefined') {
  window.PRESERVATION_LAW = PRESERVATION_LAW;
  window.isBlankValue = isBlankValue; window.cascadeLen = cascadeLen;
  window.guardDiff = guardDiff; window.guardDiffs = guardDiffs;
  window.verifyNoFieldLost = verifyNoFieldLost;
  window.verifyCascadesIntact = verifyCascadesIntact;
  window.verifyNoBlanks = verifyNoBlanks;
}
