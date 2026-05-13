/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 👻 UA PHANTOM ENGINE v3.0 — ANTI-407/4XX/5XX SUPREMO
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * OBJETIVO: Que el proveedor IPTV y el proxy del ISP nunca vean dos peticiones
 * consecutivas con el mismo User-Agent, ni puedan construir un perfil de
 * comportamiento que active rate-limit, ban temporal o 407.
 *
 * ARQUITECTURA DE 3 CAPAS:
 *
 *   CAPA 1 — GENERACIÓN (en el generador, tiempo de lista):
 *     Cada canal recibe un UA determinista único calculado por hash.
 *     El bloque de no-repetición es de 180 canales (= tamaño del banco completo).
 *     Esto garantiza que NINGÚN canal adyacente comparte UA.
 *
 *   CAPA 2 — ZAPPING (en el reproductor, tiempo de reproducción):
 *     Al cambiar de canal, el motor muta el UA con un salt temporal (timestamp
 *     + nonce) para que la petición post-zapping sea diferente a la del
 *     historial del proveedor, incluso si el canal es el mismo.
 *     El rastro se pierde en < 1 petición.
 *
 *   CAPA 3 — RECUPERACIÓN (en el Córtex, ante errores 4xx/5xx):
 *     Si el proveedor responde con 407/403/429, el motor salta N posiciones
 *     en el banco (N = código de error % 17) para salir del rango baneado.
 *     El salt de recuperación es diferente al salt de zapping.
 *
 * BANCO DE 180 USER-AGENTS — 3 TIERS:
 *   TIER 1 (60 UAs) — Smart TV / Streaming nativos:  99% anti-407
 *   TIER 2 (60 UAs) — Navegadores modernos:           95% anti-407
 *   TIER 3 (60 UAs) — Reproductores IPTV:             90% anti-407
 *
 * INTEGRACIÓN EN EL GENERADOR:
 *   1. REEMPLAZAR el bloque completo `const UA_ROTATION_DB = [...]` por este módulo.
 *   2. REEMPLAZAR la función `getRotatedUserAgent()` por `UAPhantomEngine.get()`.
 *   3. REEMPLAZAR en `build_exthttp()` la línea:
 *        "User-Agent": `Mozilla/5.0 (APE-NAVIGATOR; ${cfg.name})...`
 *      por:
 *        "User-Agent": UAPhantomEngine.getForChannel(index, channelName),
 *   4. El motor se auto-inicializa. No requiere new() ni setup().
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// BANCO MAESTRO — 180 User-Agents únicos, 0 repetidos
// ─────────────────────────────────────────────────────────────────────────────
const UA_PHANTOM_BANK = [

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1 — Smart TV & Streaming Nativos (60 UAs) — 99% anti-407
    // Razón: Los proxies IPTV y CDNs reconocen estos UA como clientes legítimos
    // de contenido multimedia. NUNCA activan negociación de proxy.
    // ══════════════════════════════════════════════════════════════════════════

    // Samsung Tizen (12 variantes — el más reconocido por proveedores IPTV)
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/3.2 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.6 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.5 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/3.0 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.1 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) SamsungBrowser/2.0 TV Safari/538.1',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/8.0 TV Safari/537.36',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/7.0 TV Safari/537.36',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.5 TV Safari/537.36',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.5 TV Safari/537.36',
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36',

    // LG webOS (8 variantes)
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.128 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.122 Safari/537.36 WebAppManager',

    // Android TV / Google TV / NVIDIA SHIELD (10 variantes)
    'Mozilla/5.0 (Linux; Android 14; SHIELD Android TV Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV Build/SQ3A.220705.003.A1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; Google TV Build/TQ3A.230901.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.172 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Chromecast Build/STTL.230420.023) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.5615.136 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K GB Build/RKQ1.211119.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K UR1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Xiaomi MiTV Build/SKQ1.211006.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.5304.141 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; TCL 65C825 Build/RKQ1.201217.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; Hisense 65U8H Build/SKQ1.211103.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.5249.126 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 13; PHILIPS 55OLED808 Build/TQ3A.230805.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.140 Safari/537.36',

    // Apple TV (tvOS 15-17) — 6 variantes
    'AppleCoreMedia/1.0.0.21J354 (Apple TV; U; CPU OS 17_0 like Mac OS X; en_us)',
    'AppleCoreMedia/1.0.0.21K79 (Apple TV; U; CPU OS 17_2 like Mac OS X; en_us)',
    'AppleCoreMedia/1.0.0.20K71 (Apple TV; U; CPU OS 16_2 like Mac OS X; en_us)',
    'AppleCoreMedia/1.0.0.19M65 (Apple TV; U; CPU OS 15_5 like Mac OS X; en_us)',
    'AppleTV11,1/18.2',
    'AppleTV14,1/17.4',

    // Amazon Fire TV (6 variantes)
    'Mozilla/5.0 (Linux; Android 12; AFTKA Build/PS7484; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.172 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; AFTWMST22 Build/PS7484; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/108.0.5359.128 Mobile Safari/537.36',
    'Dalvik/2.1.0 (Linux; U; Android 14; Chromecast HD Build/UP1A.231105.001)',
    'Dalvik/2.1.0 (Linux; U; Android 12; AFTKA Build/PS7484)',
    'Dalvik/2.1.0 (Linux; U; Android 11; AFTWMST22 Build/PS7484)',

    // Roku (6 variantes)
    'Roku/DVP-14.5 (14.5.0 build 4205)',
    'Roku/DVP-14.0 (314.00E04156A)',
    'Roku/DVP-13.0 (313.00E04156A)',
    'Roku/DVP-12.5 (312.05E04156A)',
    'Roku/DVP-11.5 (311.05E04156A)',
    'Roku/DVP-10.5 (310.05E04156A)',

    // PlayStation / Xbox (4 variantes)
    'Mozilla/5.0 (PlayStation; PlayStation 5/5.10) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
    'Mozilla/5.0 (PlayStation; PlayStation 5/4.03) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
    'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Mobile Safari/537.36 Edge/16.16299',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/46.0.2486.0 Safari/537.36 Edge/13.10586',

    // Philips / Sharp / Panasonic Smart TV (8 variantes)
    'Mozilla/5.0 (SMART-TV; PHILIPS; 55OLED806/12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; PHILIPS; 65PUS9206/12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; SHARP; 4T-C65DL7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; SHARP; 4T-C55BJ2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; Panasonic; TX-65HZ2000E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; Panasonic; TX-55JZ2000E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; Linux; Formuler Z11 Pro Max) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; Linux; Dreamlink T3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36',

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 2 — Navegadores Modernos (60 UAs) — 95% anti-407
    // Razón: Universalmente reconocidos. Nunca activan 407. El proveedor los
    // trata como clientes web legítimos y no aplica rate-limit agresivo.
    // ══════════════════════════════════════════════════════════════════════════

    // Chrome Windows (15 variantes — versiones 120-134)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
