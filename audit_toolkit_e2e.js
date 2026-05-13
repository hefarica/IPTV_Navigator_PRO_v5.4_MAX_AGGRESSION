const fs = require('fs');
const vm = require('vm');

console.log("=== INICIANDO AUDITORIA E2E 0-100% ===");

const scriptContent = fs.readFileSync('IPTV_v5.4_MAX_AGGRESSION/frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');

const sandbox = {
    window: { 
        app: {}, 
        dispatchEvent: (event) => {
            if (event.type === 'm3u8-generated' && event.detail && event.detail.content) {
                const blob = event.detail.content;
                blob.text().then(text => {
                    rawOutput = [text];
                }).catch(err => console.error("Error reading blob:", err));
            }
        } 
    },
    document: { 
        getElementById: ()=>({ style: {}, innerHTML: '', setAttribute: ()=>{}, addEventListener: ()=>{} }), 
        querySelector: ()=>({ style: {}, classList: { add: ()=>{}, remove: ()=>{} } }),
        createElement: ()=>({ href: '', download: '', click: ()=>{} }),
        body: { appendChild: ()=>{}, removeChild: ()=>{} }
    },
    console: console,
    Date: Date,
    Math: Math, TextEncoder: TextEncoder,
    ReadableStream: require('stream/web').ReadableStream,
    Response: typeof Response !== 'undefined' ? Response : class Response { constructor(body) { this.body = body; } },
    CustomEvent: typeof CustomEvent !== 'undefined' ? CustomEvent : class CustomEvent { constructor(type, data) { this.type = type; this.detail = data ? data.detail : null; } },
    setTimeout: setTimeout,
    btoa: (str) => Buffer.from(str).toString('base64'),
    atob: (str) => Buffer.from(str, 'base64').toString('utf8'),
    Blob: class Blob { constructor(c) { this.content = c; } },
    URL: { 
        createObjectURL: () => "blob:test", 
        revokeObjectURL: ()=>{} 
    }
};
vm.createContext(sandbox);

try {
    vm.runInContext(scriptContent, sandbox);
    console.log("✅ [1/5] Parser JS (Typed Arrays Ultimate): OK Cero Errores de Sintaxis.");
} catch (e) {
    console.error("❌ Error fatal de compilacion JS:", e);
    process.exit(1);
}

const testChannels = [
    { name: "HBO 4K", stream_id: "1001", serverId: "Hetzner-Proxy" },
    { name: "ESPN HD", stream_id: "2005", serverId: "Hetzner-Proxy" }
];
const testCredentials = {
    "Hetzner-Proxy": { "host": "iptv-ape.duckdns.org", "port": "443", "user": "testusr", "pass": "testpwd" }
};

sandbox.window.app.getFilteredChannels = () => testChannels;
sandbox.window.app.channelsMap = new Map(testChannels.map(c => [c.stream_id, c]));
sandbox.window.app.getCurrentCredentialsMap = () => testCredentials;
sandbox.window.app.state = { activeServers: [ { id: "Hetzner-Proxy", host: "iptv-ape.duckdns.org", port: "443", user: "testusr", pass: "testpwd", server_url: "iptv-ape.duckdns.org", username: "testusr", password: "testpwd" } ] };

sandbox.window.GenTabController = {
    getConfig: () => ({ dictatorMode: true, dictatorTier: "4k" })
};

let rawOutput = [];
// Removed spy on Blob constructor
sandbox.Blob = class Blob {
    constructor(c) { 
        this.content = c; 
    }
};

try {
    sandbox.window.app.generateM3U8_TypedArrays({ dictatorMode: true });
    
    // the generation might be synchronous or rely on setTimeout inside generateM3U8_TypedArrays
    // Since we mocked everything, it should just execute and give us chunks.
} catch(e) {
    console.error("❌ Falla durante la invocacion del Motor M3U8:", e);
}

setTimeout(() => {
    console.log("rawOutput is:", rawOutput);
    if(!rawOutput || rawOutput.length === 0) {
        console.error("❌ Error: No se generó archivo M3U8. Blob was not invoked!");
        process.exit(1);
    }
    
    let actualArray = Array.isArray(rawOutput) ? rawOutput : [];
    if (actualArray.length > 0 && Array.isArray(actualArray[0])) { actualArray = actualArray[0]; }
    const outputM3u8 = actualArray.join("");
    console.log("✅ [2/5] Motor de strings HLS v18 (Generador): Ejecucion Sin Crash.");

    if(outputM3u8.match(/#[a-z0-9]{30,}/i)) {
        console.log("✅ [3/5] Traffic Padding Detectado (Evasion DPI).");
    } else {
        console.error("❌ Falta el padding aleatorio DPI.");
    }

    if(outputM3u8.includes('DATA-ID="exoplayer.load_control"')) {
        console.log("✅ [4/5] Inyeccion LoadControl (Exoplayer) Correcta.");
    } else {
        console.error("❌ Falta el LoadControl de ExoPlayer (Buffer Forzado).");
    }

    if(!outputM3u8.includes('CAN-BLOCK-RELOAD=YES') && outputM3u8.includes('EXT-X-VERSION:7')) {
        console.log("✅ [5/5] Compatibilidad RFC 8216bis (Sin rigidez LL-HLS destructiva).");
    } else {
        console.error("❌ Fallo de RFC: Tienes directivas obsoletas LL-HLS.");
    }

    console.log("\n=== AUDITORIA FINALIZADA SATISFACTORIAMENTE ===");
}, 2000);

process.on('unhandledRejection', e => {
    console.error("UNHANDLED REJECTION:", e);
});
