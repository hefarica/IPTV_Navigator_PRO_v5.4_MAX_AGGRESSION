const { MetadataResolveEngine } = require('./ape-metadata-engine');

async function runTest() {
    const engine = new MetadataResolveEngine();
    
    // Test HLS Stream (Tears of Steel by Mux)
    const testUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

    console.log(`[>>] Empezando el Análisis Zero-Playback para: ${testUrl}`);
    
    // Simulando los headers que inyecta nuestro frontend APE (Skill 3)
    const mockHeaders = {
        'x-ape-channel-name': 'Tears of Steel Mux Test',
        'x-ape-channel-id': 'ch=100_core_mux',
        'user-agent': 'VLC/3.0.18 LibVLC/3.0.18'
    };

    try {
        const result = await engine.resolveChannel(testUrl, mockHeaders);
        
        console.log(`\\n[OK] Análisis Completado usando 16 Skills.`);
        console.log(`[+] JSON Output Estructurado:\\n`);
        console.log(JSON.stringify(result, null, 2));

        // Testing Concurrencia
        console.log(`\\n[INFO] Estado del Motor de Concurrencia (Active Channels):`);
        console.log(engine.activeChannels.keys());
        
    } catch (e) {
        console.error("Fallo:", e.message);
    }
}

runTest();
