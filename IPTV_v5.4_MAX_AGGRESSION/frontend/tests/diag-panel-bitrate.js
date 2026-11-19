/* Medición del cabo suelto: ¿qué bitrateForStall llega al plan en el PANEL REAL?
 * Carga los módulos en el ORDEN de index-v4.html (v3.1 primero, v2.0 después)
 * y mide con el global que queda: window.StreamingCalculator. */
'use strict';
const path = require('path');
const FRONT = path.join(__dirname, '..');

global.window = global;
global.document = { head: { appendChild() {} }, createElement() { return { style: {}, appendChild() {} }; },
                    getElementById() { return null; }, querySelector() { return null; } };
try { Object.defineProperty(global, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch (e) {}
try { Object.defineProperty(global, 'localStorage', { value: { getItem() { return null; }, setItem() {} }, configurable: true }); } catch (e) {}

console.log('=== 1 · RUTA EXACTA del fichero que define calculateBitrate ===');
const fs = require('fs');
['js/ape-v9/streaming-calculator.js', 'js/ape-v9/streaming/streaming-calculator-v3.js'].forEach(f => {
    const p = path.join(FRONT, f);
    const src = fs.readFileSync(p, 'utf8');
    const m = /calculateBitrate\s*\(/.exec(src);
    const line = m ? src.slice(0, m.index).split('\n').length : null;
    console.log('  ' + p);
    console.log('    existe=' + fs.existsSync(p) + ' · calculateBitrate en linea ' + line +
        ' · window.StreamingCalculator=' + (src.indexOf('window.StreamingCalculator =') >= 0));
});

console.log('\n=== 2 · ORDEN DEL PANEL (index-v4.html:4675 v3.1 → :4680 v2.0) ===');
require(path.join(FRONT, 'js/ape-v9/streaming/streaming-calculator-v3.js'));
console.log('  tras v3.1: window.StreamingCalculator=' + typeof window.StreamingCalculator +
    ' · globals v3.1=' + Object.keys(window).filter(k => /calc|Calc|V3/.test(k)).join(','));
const v3 = window.STREAMING_CALCULATOR_V3 || window.StreamingCalculatorV3 || window.APE_STREAM_CALC_V3 || null;
if (v3) console.log('  v3.1 expone: ' + Object.keys(v3).join(','));
require(path.join(FRONT, 'js/ape-v9/streaming-calculator.js'));
const SC = window.StreamingCalculator;
console.log('  tras v2.0: window.StreamingCalculator=' + typeof SC +
    ' · calculateBitrate=' + typeof (SC && SC.calculateBitrate) +
    ' · compute=' + typeof (SC && SC.compute) +
    ' · calculateAdaptiveMargin=' + typeof (SC && SC.calculateAdaptiveMargin));
console.log('  → VEREDICTO: el global que queda es ' + (SC && typeof SC.calculateBitrate === 'function' ? 'v2.0 (Industrial Grade), el que TIENE calculateBitrate' : 'OTRO'));

console.log('\n=== 3 · VALOR EN EL NAVEGADOR para el perfil del operador ===');
require(path.join(FRONT, 'js/ape-v9/ape-profiles-config.js'));
const CFG = window.APE_PROFILES_CONFIG;
['P0', 'P1', 'P2', 'P3'].forEach(id => {
    const s = (CFG.getProfile(id) || {}).settings || {};
    const b = SC.calculateBitrate(s.resolution || '1920x1080', s.codec || 'H265', Number(s.fps) || 60);
    console.log('  ' + id + ' res=' + s.resolution + ' codec=' + s.codec + ' fps=' + s.fps +
        ' → calculateBitrate = ' + b + ' Mbps  (settings.bitrate declarado=' + s.bitrate + ')');
});
console.log('  caso del capitán 3840x2160 / hevc / 60 → ' + SC.calculateBitrate('3840x2160', 'hevc', 60) + ' Mbps');
console.log('  contraste 1920x1080 / H265 / 60 → ' + SC.calculateBitrate('1920x1080', 'H265', 60) + ' Mbps');

console.log('\n=== 4 · QUÉ PASA SI EL MÓDULO NO CARGA (rama null de _stallBitrateFor) ===');
const T = require(path.join(FRONT, 'js/ape-v9/streaming/auto-tune-v1.js'))({});
const base = { requiredMbps: 200, measuredMbpsSafe: 400, segDurationSec: 6, targetStallPct: 1.67 };
const sinModulo = T.coherentPlan(Object.assign({ strategy: 'balanced' }, base));
const conModulo = T.coherentPlan(Object.assign({ strategy: 'balanced', bitrateForStall: SC.calculateBitrate('3840x2160', 'hevc', 60) }, base));
const conBitrateDeclarado = T.coherentPlan(Object.assign({ strategy: 'balanced', bitrateForStall: 200 }, base));
console.log('  sin módulo  (bitrateForStall=undefined) → base=' + sinModulo.metrics.stallBasis +
    ' needed=' + sinModulo.metrics.neededBufferS + ' s → ok=' + sinModulo.ok);
console.log('  con módulo  (bitrateForStall=' + SC.calculateBitrate('3840x2160', 'hevc', 60) + ') → base=' + conModulo.metrics.stallBasis +
    ' needed=' + conModulo.metrics.neededBufferS + ' s → ok=' + conModulo.ok);
console.log('  si se pasara el bitrate DECLARADO (200) → base=' + conBitrateDeclarado.metrics.stallBasis +
    ' needed=' + conBitrateDeclarado.metrics.neededBufferS + ' s → ok=' + conBitrateDeclarado.ok);

console.log('\n=== 5 · MATRIZ con el bitrate REAL del panel (11 Mbps), required=200 ===');
const B = SC.calculateBitrate('3840x2160', 'hevc', 60);
const keys = ['ultra-aggressive', 'aggressive', 'balanced', 'adaptive', 'conservative', 'ultra-low-latency'];
[400, 230, 146, 0.1].forEach(m => keys.forEach(k => {
    const p = T.coherentPlan({ requiredMbps: 200, measuredMbpsSafe: m, segDurationSec: 6, strategy: k, bitrateForStall: B, targetStallPct: 1.67 });
    const chip = p.values ? Math.round(SC.calculateStallRate(p.values.bufferTargetS, B, p.values.bwMinMbps).probability * 100) / 100 : '-';
    console.log('  ' + String(m).padStart(5) + ' | ' + k.padEnd(18) + ' | needed=' + String(p.metrics.neededBufferS).padStart(5) +
        ' buf=' + String(p.values.bufferTargetS).padStart(2) + ' stall_plan=' + String(p.metrics.stallEstimatePct).padStart(5) +
        ' chip=' + String(chip).padStart(5) + ' ok=' + p.ok + ' ' + (p.violations[0] || '').slice(0, 40));
}));
