const fs=require('fs');
const p='IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
let t=fs.readFileSync(p, 'utf8');

t=t.replace(
    "function generateChannelEntry(channel, profile = 'P3', index = 0, credentialsMap = {}) {",
    "function generateChannelEntry(channel, profile = 'P3', index = 0, credentialsMap = {}, options = {}) {"
);

t=t.replace(
    "const entry = generateChannelEntry(channel, profile, index, credentialsMap);",
    "const entry = generateChannelEntry(channel, profile, index, credentialsMap, options);"
);

t=t.replace(
    "lines.push(`#EXTVLCOPT:network-caching=${_buf796}`);",
    "lines.push(`#EXTVLCOPT:network-caching=${options.dictatorMode ? 500 : _buf796}`);\n        lines.push(`#EXTVLCOPT:clock-synchro=0`);"
);

t=t.replace(
    "lines.push(`#KODIPROP:inputstream.adaptive.stream_selection_type=adaptive`);",
    "lines.push(`#KODIPROP:inputstream.adaptive.stream_selection_type=${options.dictatorMode ? 'manual-osd' : 'adaptive'}`);"
);

t=t.replace(
    "lines.push(`${primaryUrl}`);",
    "const finalUrl = options.dictatorMode ? `${primaryUrl}|User-Agent=${_ua796}&Cache-Control=no-cache&Connection=keep-alive` : primaryUrl;\n        lines.push(`${finalUrl}`);"
);

fs.writeFileSync(p, t);
console.log("OK!");
