/* ═══════════════════════════════════════════════════════════════════════════
 * LEY DE SUFICIENCIA EXCEPCIONAL
 *
 * El operador (2026-11-08): "el Streaming Health tiene que quedar con el valor
 * de riesgo MAS BAJO POSIBLE y un HEADROOM SUPERIOR a X, tu das el valor de
 * referencia conforme la teoria".
 *
 * ─── VALOR DE REFERENCIA: X = 3.00x  (200 % de headroom) ────────────────────
 *
 * headroom = bandwidthSafe / bitrateNecesario
 *
 *   1.00x  0 %   sin margen: un solo pico de jitter tumba el buffer.
 *   1.30x  30 %  MINIMO DE LA INDUSTRIA. Debajo de esto el rebuffering empieza
 *                a ser estadisticamente probable (es el factor que usan
 *                dash.js y Shaka para su safety factor por defecto).
 *   1.50x  50 %  suficiente para contenido CBR.
 *   2.00x 100 %  el ABR puede SUBIR un escalon entero sin quedarse sin margen.
 *   3.00x 200 %  EXCEPCIONAL. Cubre a la vez: jitter (10 %), rafaga de GOP
 *                (hasta 1.6x del bitrate medio en I-frame), precarga de N
 *                segmentos en paralelo y variacion del proveedor. Es el valor
 *                que se exige aqui.
 *   > 100x       IMPLAUSIBLE. No es un enlace, es un calculo roto.
 *
 * ─── RISK: objetivo <= 10 / 100 ────────────────────────────────────────────
 *
 * El risk NO es un adorno: es la probabilidad de que el buffer se vacie. Con
 *   0-10  EXCEPCIONAL   10-25 BUENO   25-50 ACEPTABLE
 *  50-75  POBRE        75-100 CRITICO
 * por encima de 75 el rebuffering es el comportamiento normal, no la excepcion.
 *
 * ─── POR QUE EL PANEL MENTIA ────────────────────────────────────────────────
 *
 * Medido 2026-11-08: el panel mostraba "Risk 90/100 | Headroom 199900 %".
 * Los dos numeros son incompatibles: un headroom de 199900 % implicaria un
 * risk de 0, no de 90. La causa:
 *
 *   headroomSparePct = (bitrate/bwSafe − 1) × 100      [valor de COLCHON]
 *   bwSafe = 0.1 Mbps  (no habia medicion; el piso MIN_BANDWIDTH_MBPS actua)
 *   bitrate = 200 Mbps
 *   → (200/0.1 − 1) × 100 = 199900
 *
 * Es decir: 199900 % POSITIVO significa un deficit del 99,95 %, no un sobrante.
 * El signo estaba invertido y, peor, se mostraba un numero cuando no habia
 * ninguna medicion de red. Sin medicion lo honesto es NO_MEASUREMENT.
 * ═══════════════════════════════════════════════════════════════════════════ */

var SUFFICIENCY_LAW = {
  HEADROOM_EXCEPTIONAL: 3.00,   // X = 200 %  ← valor de referencia exigido
  HEADROOM_OPTIMAL: 2.00,       // 100 %
  HEADROOM_SUFFICIENT: 1.50,    // 50 %
  HEADROOM_MINIMUM: 1.30,       // 30 %  (piso de la industria)
  HEADROOM_TIGHT: 1.00,         // 0 %

  RISK_EXCEPTIONAL: 10,
  RISK_GOOD: 25,
  RISK_FAIR: 50,
  RISK_POOR: 75,

  // un ratio fuera de este rango no es un enlace: es un calculo roto
  RATIO_IMPLAUSIBLE_HIGH: 100,
  RATIO_IMPLAUSIBLE_LOW: 0.01,

  // gates que el perfil debe cumplir para declararse EXCEPCIONAL
  GATE_RISK_MAX: 10,
  GATE_HEADROOM_MIN: 3.00,

  VERSION: '1.0'
};

/* Evalua la suficiencia de una metrica de streaming.
 *
 * hasMeasurement es OBLIGATORIO: sin el, cualquier numero de headroom es
 * ficcion. Si no hay medicion se devuelve NO_MEASUREMENT y NO un numero. */
function evaluateSufficiency(headroomRatio, riskScore, hasMeasurement) {
  var L = SUFFICIENCY_LAW;

  // ── 1) SIN MEDICION: no se inventa nada ────────────────────────────────
  if (!hasMeasurement) {
    return {
      state: 'NO_MEASUREMENT',
      ok: false,
      risk: (typeof riskScore === 'number') ? riskScore : null,
      headroomRatio: null,
      headroomPct: null,
      satisfiesExceptional: false,
      reason: 'sin medicion de red: el headroom no es computable',
      action: 'medir antes de decidir (el piso del perfil no es una medicion)'
    };
  }

  var r = Number(headroomRatio);
  var risk = (typeof riskScore === 'number') ? riskScore : null;

  // ── 2) RATIO IMPLAUSIBLE: el calculo esta roto, no el enlace ───────────
  if (!isFinite(r) || r <= 0 || r > L.RATIO_IMPLAUSIBLE_HIGH || r < L.RATIO_IMPLAUSIBLE_LOW) {
    return {
      state: 'IMPLAUSIBLE',
      ok: false,
      risk: risk,
      headroomRatio: isFinite(r) ? r : null,
      headroomPct: null,
      satisfiesExceptional: false,
      reason: 'headroom ' + r.toFixed(4) + 'x fuera de rango fisico [' +
              L.RATIO_IMPLAUSIBLE_LOW + ', ' + L.RATIO_IMPLAUSIBLE_HIGH + ']: revisar la fuente de bandwidth',
      action: 'corregir bandwidthSafe/bitrate antes de leer el health'
    };
  }

  // ── 3) CLASIFICACION ───────────────────────────────────────────────────
  var state, okFlag, color;
  if (r >= L.HEADROOM_EXCEPTIONAL) { state = 'EXCEPTIONAL'; okFlag = true;  color = '#10b981'; }
  else if (r >= L.HEADROOM_OPTIMAL) { state = 'OPTIMAL';    okFlag = true;  color = '#22c55e'; }
  else if (r >= L.HEADROOM_SUFFICIENT) { state = 'SUFFICIENT'; okFlag = true; color = '#84cc16'; }
  else if (r >= L.HEADROOM_MINIMUM) { state = 'MINIMUM';    okFlag = false; color = '#eab308'; }
  else if (r >= L.HEADROOM_TIGHT) { state = 'TIGHT';        okFlag = false; color = '#f97316'; }
  else { state = 'INSUFFICIENT'; okFlag = false; color = '#ef4444'; }

  // ── 4) EL RISK MANDA: un headroom alto con risk alto es incoherente ───
  // Si risk > GATE_RISK_MAX, NO se puede declarar excepcional aunque el
  // ratio lo sea. Ambas condiciones tienen que cumplirse.
  var riskOk = (risk === null) ? false : (risk <= L.GATE_RISK_MAX);
  var satisfiesExceptional = okFlag &&
    (r >= L.GATE_HEADROOM_MIN) && riskOk;

  return {
    state: state,
    ok: okFlag,
    risk: risk,
    riskOk: riskOk,
    headroomRatio: Math.round(r * 100) / 100,
    headroomPct: Math.round((r - 1) * 100),
    satisfiesExceptional: satisfiesExceptional,
    color: color,
    target: {
      headroomRatio: L.GATE_HEADROOM_MIN,
      headroomPct: Math.round((L.GATE_HEADROOM_MIN - 1) * 100),
      riskMax: L.GATE_RISK_MAX
    },
    gap: satisfiesExceptional ? null : {
      headroomMissing: Math.max(0, Math.round((L.GATE_HEADROOM_MIN - r) * 100) / 100),
      riskExcess: (risk === null) ? null : Math.max(0, risk - L.GATE_RISK_MAX)
    },
    reason: satisfiesExceptional
      ? ('headroom ' + (Math.round((r - 1) * 100)) + ' % >= ' +
         Math.round((L.GATE_HEADROOM_MIN - 1) * 100) + ' % y risk ' + risk + ' <= ' + L.GATE_RISK_MAX)
      : ('headroom ' + (Math.round((r - 1) * 100)) + ' % / risk ' + risk +
         ' no alcanza el gate (>= 200 % y <= 10)')
  };
}

/* Etiqueta honesta para el panel. Nunca devuelve un numero cuando no hay
 * medicion ni cuando el ratio es implausible. */
function sufficiencyLabel(ev) {
  if (!ev) return '--';
  if (ev.state === 'NO_MEASUREMENT') return 'SIN MEDICION';
  if (ev.state === 'IMPLAUSIBLE') return 'IMPLAUSIBLE';
  return ev.headroomPct + '%';
}

/* Export para Node (tests) y para el navegador. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUFFICIENCY_LAW: SUFFICIENCY_LAW,
    evaluateSufficiency: evaluateSufficiency,
    sufficiencyLabel: sufficiencyLabel
  };
}
if (typeof window !== 'undefined') {
  window.SUFFICIENCY_LAW = SUFFICIENCY_LAW;
  window.evaluateSufficiency = evaluateSufficiency;
  window.sufficiencyLabel = sufficiencyLabel;
}
