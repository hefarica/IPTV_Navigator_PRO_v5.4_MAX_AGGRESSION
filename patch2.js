const fs=require('fs');
const p='IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
let t=fs.readFileSync(p, 'utf8');

t=t.replace(
    "window.app.generateM3U8_TypedArrays = function (options = {}) {",
    "window.app.generateM3U8_TypedArrays = function (options = {}) {\n                    const cfg = window.GenTabController ? window.GenTabController.getConfig() : {};\n                    options.dictatorMode = cfg.dictatorMode || false;\n                    options.dictatorTier = cfg.dictatorTier || '4k';"
);

fs.writeFileSync(p, t);
console.log("OK!");
