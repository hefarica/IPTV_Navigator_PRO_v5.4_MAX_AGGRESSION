/**
 * 🧠 APE WORKER CORE v8.2.2 "SOVEREIGN GHOST" - FIXED & GC OPTIMIZED
 * Resuelve error 'm3u already declared' e integra Fibonacci DNA
 * Capacidad: 100,000+ canales con autolimpieza de memoria
 */

self.onmessage = async function (e) {
    const { type, channels, config } = e.data;

    if (type !== 'start_generation') return;

    // 1. DECLARACIÓN ÚNICA: Usamos outputM3U para evitar colisión de nombres
    let outputM3U = "#EXTM3U\n#APE_ENGINE: v8.2.2_GHOST\n#OBFUSCATION: " + (config.obfuscate ? "ON" : "OFF") + "\n#MEMORY_CLEAN: ACTIVE\n";

    const getFib = (n) => { let a = 1, b = 0, t; while (n-- > 0) { t = a; a += b; b = t; } return b; };
    const seed = config.seed || (new Date().getFullYear() * 1000) + new Date().getDate();

    const total = channels.length;
    let l5Count = 0;
    let repairedCount = 0;

    // Procesamiento por lotes (GC Optimized)
    const CHUNK_SIZE = 500;

    for (let i = 0; i < total; i += CHUNK_SIZE) {
        let chunk = channels.slice(i, i + CHUNK_SIZE);

        chunk.forEach((ch, idx) => {
            const absIdx = i + idx;

            // Safety Catch (Reparación básica)
            let url = (ch.url || '').trim().replace(/^hhtps/i, 'https').replace(/^hhtp/i, 'http').replace(/\s/g, '');
            if (url !== ch.url) repairedCount++;

            // 2. APE HEURISTICS ENGINE v8.0 (Neural Score simulation)
            let level = 3;
            let reason = "Standard Optimization";

            // Detección de CDN y Categoría para scoring neuronal
            const isHighGrade = ch.name.match(/4K|UHD|SPORTS|DAZN|MOVISTAR/i) || url.match(/cloudflare|akamai/i);

            if (isHighGrade) {
                level = 5;
                reason = "Neural High-Priority (L5)";
                l5Count++;
            } else if (ch.group && ch.group.match(/DEPORTES|SPORTS|LIVE|VIVO/i)) {
                level = 4;
                reason = "Live-Edge Priority (L4)";
            }

            // Fibonacci Entropy DNA
            const entropy = getFib((absIdx + (Date.now() % 50)) % 15);
            const dna = seed + absIdx + entropy;

            // Perfil de Identidad (Handshake eBPF simulation)
            const headers = {
                "User-Agent": config.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0",
                "Sec-CH-UA-Platform": '"Windows"',
                "Sec-CH-UA": '"Google Chrome";v="125"',
                "X-Playback-Session-Id": "APE82-" + dna.toString(36).toUpperCase(),
                "X-TCP-Window": 64240 + (dna % 50),
                "X-Forwarded-For": `172.16.${dna % 255}.${(dna * 2) % 255}`,
                "X-APE-Engine": "v8.2.2_Ghost",
                "X-Neural-Level": level.toString()
            };

            // 4. SSMM (Server-Side Manifest Manipulation) logic simulation
            const protocol = level >= 4 ? "&go_live=true&reconnect_delay=1&catchup=live&live_edge=0.5" : "&min-buffer=20000&max-buffer=20000";

            // 5. Túnel de Ofuscación & SSMM (Sovereign Ghost v8.2.2)
            let hStr = Object.entries(headers).map(([k, v]) => k + "=" + encodeURIComponent(v)).join('&');
            if (config.obfuscate) {
                hStr = "ape_obs=" + btoa(hStr).replace(/=/g, '');
            }

            // 6. Generación de Etiquetas Avanzadas (#EXTHTTP, VLC, Kodi)
            let advancedTags = "";
            if (level >= 3) {
                // Etiqueta nativa JSON
                advancedTags += `#EXTHTTP:${JSON.stringify(headers)}\n`;

                // Opciones VLC (EXTVLCOPT)
                advancedTags += `#EXTVLCOPT:http-user-agent=${headers["User-Agent"]}\n`;
                advancedTags += `#EXTVLCOPT:http-referrer=${headers["Referer"] || url}\n`;
                advancedTags += `#EXTVLCOPT:network-caching=${level >= 5 ? 30000 : 10000}\n`;

                // Propiedades Kodi (KODIPROP)
                advancedTags += `#KODIPROP:inputstream=inputstream.adaptive\n`;
                advancedTags += `#KODIPROP:inputstream.adaptive.manifest_type=hls\n`;
            }

            // Construcción de línea final con Categorización Xtream y Metadata de Calidad
            const qualityTier = level === 5 ? "ULTRA-4K" : level === 4 ? "FHD-PRO" : "SD-STABLE";
            outputM3U += `${advancedTags}#EXTINF:-1 group-title="${ch.group || "GENERAL"}" tvg-logo="${ch.logo || ''}" quality="${qualityTier}" opt-level="${level}",${ch.name}\n`;
            outputM3U += url + "|" + hStr + protocol + "\n";
        });

        // Limpieza de memoria proactiva
        chunk = null;

        // Notificar progreso con estadísticas v8.2
        self.postMessage({
            type: 'progress',
            percent: Math.min(99, ((i + CHUNK_SIZE) / total) * 100),
            count: Math.min(total, i + CHUNK_SIZE),
            level5: l5Count,
            repaired: repairedCount
        });

        // Ceder control para GC
        if (i % 2000 === 0) await new Promise(r => setTimeout(r, 0));
    }

    self.postMessage({
        type: 'complete',
        blob: outputM3U, // Enviamos el string para que el main lo convierta en Blob si es necesario
        stats: { total, level5: l5Count, repaired: repairedCount }
    });
};
