const fs=require('fs');
const p='IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js';
let t=fs.readFileSync(p, 'utf8');

// Injecting ExoPlayer session data and traffic padding
t=t.replace(
    '#EXT-X-VNOVA-LCEVC-TARGET-SDK:HTML5',
    '#EXT-X-VNOVA-LCEVC-TARGET-SDK:HTML5\n' +
    '${options.dictatorMode ? `#EXT-X-SESSION-DATA:DATA-ID="exoplayer.load_control",VALUE="{\\"minBufferMs\\":20000,\\"bufferForPlaybackMs\\":5000}"` : ""}\n' +
    '${options.dictatorMode ? `#` + Array.from({length: 64}).map(() => Math.random().toString(36).substring(2)).join("")  : ""}'
);

fs.writeFileSync(p, t);
console.log("OK patch3");
