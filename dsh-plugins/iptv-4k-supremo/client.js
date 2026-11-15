/**
 * Mitad Client de `@local/iptv-4k-supremo`.
 *
 * Dos registros, el patron nativo del sidebar:
 *   1. `sidebar.panellist` id `iptv-4k-supremo` -> SOLO el icono.
 *      El sidebar es el dueno del boton y le pasa { size, active }.
 *   2. `main` key `iptv-4k-supremo`             -> la pagina que ese icono abre.
 *      "Each list id addresses the matching main panel", dice el catalogo del slot.
 *
 * No se renderiza <button> propio, no hay overlay ni store: el dueno despacha la
 * key y el slot `main` monta la pagina. Los estilos viajan como elemento React,
 * asi que al desmontar la pagina desaparecen.
 *
 * DOCTRINA DEL PANEL: cada cifra lleva procedencia. `Declarado` es lo que afirma
 * el catalogo que el owner pego; `Medido` es lo que devolvieron la API de GitHub
 * y una peticion GET real el 2026-11-15T06:45Z. Nada se presenta como medido sin
 * haber sido medido. Donde el catalogo declaraba un endpoint, se sondeo y se
 * muestra su codigo real, incluido el 404.
 */

window.__ModuleLoader__.load({
  id: '@local/iptv-4k-supremo',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;

    // -----------------------------------------------------------------------
    // Procedencia de la medicion. Una cifra sin fecha no es una medicion.
    // -----------------------------------------------------------------------
    const MEASURED = {
      at: '2026-11-15T06:45:00Z',
      atLocal: '2026-11-15 01:45 (America/Bogota)',
      sources: 'GitHub REST GET /repos/{owner}/{repo} + GET directo sobre cada endpoint',
    };

    const TONE = {
      ok: 'var(--dsw-alias-state-success-primary, #2f7d4f)',
      warn: 'var(--dsw-alias-state-warn-primary, #8a6d1f)',
      bad: 'var(--dsw-alias-state-error-primary, #b23c3c)',
      info: 'var(--dsw-alias-brand-primary, #4a8fd4)',
    };

    const TIERS = [
      { id: 'all', label: 'Todo' },
      { id: 'mega', label: 'Mega agregadores' },
      { id: 'validator', label: 'Validadores' },
      { id: 'proxy', label: 'Proxies' },
      { id: 'epg', label: 'EPG' },
      { id: '4k', label: '4K' },
    ];

    // -----------------------------------------------------------------------
    // Los 11 repos del catalogo del owner, con las dos columnas.
    // `declared` y `declaredFloor` vienen del catalogo pegado por el owner.
    // `m` es la medicion de esta sesion. `features` conserva lo que el owner
    // afirma, con la correccion medida entre corchetes donde existe.
    // -----------------------------------------------------------------------
    const REPOS = [
      {
        id: 'iptv-org',
        tier: 'mega',
        full: 'iptv-org/iptv',
        role: 'Mega agregador · M3U8 + API JSON',
        declared: '82K+',
        declaredFloor: 82000,
        m: { stars: 144053, forks: 8600, lang: 'TypeScript', license: 'Unlicense', pushed: '2026-11-15T00:12:47Z' },
        clone: 'git clone https://github.com/iptv-org/iptv.git',
        features: [
          'Owner: 30.000+ canales publicos mundiales. Medido: 11.502 entradas #EXTINF en index.m3u y 18.689 objetos en api/streams.json.',
          'Owner: categorias 4K/UHD separadas en categories/4k.m3u y categories/8k.m3u. Medido: ambas devuelven HTTP 404. El API publica 30 categorias y ninguna es 4K.',
          'Owner: playlists por pais, idioma y categoria. Medido: countries/us.m3u responde 200 con 1.497 canales; categories/sports.m3u responde 200 con 525.',
          'Owner: auto-actualizacion diaria via GitHub Actions. Medido: ultimo push 2026-11-15T00:12:47Z, el mismo dia de la medicion.',
          'Owner: M3U8 estandar con tvg-logo, tvg-name y group-title. Medido: index.m3u abre con #EXTM3U y 2,64 MB de cuerpo.',
        ],
        endpoints: [
          { label: 'index.m3u', url: 'https://iptv-org.github.io/iptv/index.m3u', status: 200, note: '11.502 canales · 2,64 MB' },
          { label: 'countries/us.m3u', url: 'https://iptv-org.github.io/iptv/countries/us.m3u', status: 200, note: '1.497 canales' },
          { label: 'categories/sports.m3u', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u', status: 200, note: '525 canales' },
          { label: 'api/streams.json', url: 'https://iptv-org.github.io/api/streams.json', status: 200, note: '18.689 streams · 14.712 con campo quality' },
          { label: 'categories/4k.m3u', url: 'https://iptv-org.github.io/iptv/categories/4k.m3u', status: 404, note: 'declarado como fuente 4K por el owner; no existe' },
          { label: 'categories/8k.m3u', url: 'https://iptv-org.github.io/iptv/categories/8k.m3u', status: 404, note: 'declarado como fuente 8K por el owner; no existe' },
        ],
        flags: [
          { tone: 'ok', label: 'MEDIDO OK', text: 'Existe, esta activo y las estrellas declaradas se quedaron cortas: 144.053 frente a 82 K+ (x1,76).' },
          { tone: 'bad', label: '4K INEXISTENTE', text: 'Las dos URLs que el catalogo da como fuente directa 4K/8K devuelven 404. La ruta real al 2160p es filtrar api/streams.json por quality.' },
        ],
      },
      {
        id: 'dearbulut',
        tier: 'mega',
        full: 'dearbulut/iptv',
        role: 'Mega agregador · API JSON + health checks',
        declared: '1.5K+',
        declaredFloor: 1500,
        m: { stars: 41, forks: 17, lang: 'TypeScript', license: 'MIT', pushed: '2026-11-15T06:41:42Z' },
        clone: 'git clone https://github.com/dearbulut/iptv.git',
        features: [
          'Owner: 39.000+ canales con health checks automaticos. No medido: la cifra cuenta el catalogo del repo, no lo que sirve la lista.',
          'Owner: JSON API estatica gratuita via GitHub Pages en api/channels.json y api/4k.json. Medido: las dos devuelven 404. La API real vive bajo /api/v1/ (OpenAPI 3.1) y channels.json pesa 26,6 MB.',
          'Owner: EPG XMLTV mergeado automaticamente. Declarado; no sondeado en esta medicion.',
          'Owner: web player integrado. Medido: la raiz https://dearbulut.github.io/iptv/ responde 200 con 8,5 KB.',
          'Owner: check de streams cada 6 horas. Declarado; el workflow no se ejecuto aqui, pero el push del repo es del mismo dia.',
        ],
        endpoints: [
          { label: 'api/v1/openapi.json', url: 'https://dearbulut.github.io/iptv/api/v1/openapi.json', status: 200, note: '22,4 KB · OpenAPI 3.1.0 · ruta real' },
          { label: 'api/v1/channels.json', url: 'https://dearbulut.github.io/iptv/api/v1/channels.json', status: 200, note: '26,6 MB · la API real esta en /v1/' },
          { label: 'raiz del sitio', url: 'https://dearbulut.github.io/iptv/', status: 200, note: '8,5 KB · enlaza a api/v1/openapi.json' },
          { label: 'api/channels.json', url: 'https://dearbulut.github.io/iptv/api/channels.json', status: 404, note: 'ruta declarada por el owner; movida a /api/v1/' },
          { label: 'api/4k.json', url: 'https://dearbulut.github.io/iptv/api/4k.json', status: 404, note: 'ruta declarada por el owner; no existe ni en /v1/' },
        ],
        flags: [
          { tone: 'bad', label: 'INFLADO x37', text: 'Declarado 1,5 K+; medido 41 estrellas. La diferencia es de 37 veces.' },
          { tone: 'warn', label: 'ENDPOINTS MOVIDOS', text: 'Las dos rutas JSON declaradas dan 404; el arbol real cuelga de /api/v1/ y esta documentado con OpenAPI 3.1.' },
        ],
      },
      {
        id: 'guovin',
        tier: 'mega',
        full: 'Guovin/iptv-api',
        role: 'Mega agregador · scraper + validador + API',
        declared: '3.5K+',
        declaredFloor: 3500,
        m: { stars: 26130, forks: 7732, lang: 'Python', license: 'AGPL-3.0 (SPDX: NOASSERTION)', pushed: '2026-10-14T01:21:43Z' },
        clone: 'git clone https://github.com/Guovin/iptv-api.git',
        features: [
          'Owner: auto-scraper + validator + speed tester. Coincide con la descripcion oficial del repo.',
          'Owner: salida M3U / TXT / API REST. Declarado en la descripcion oficial.',
          'Owner: soporte IPv4/IPv6, Docker, GitHub Actions y GUI. Declarado; no ejecutado en esta medicion.',
          'Owner: filtrado por calidad (4K, HD, SD) y canales custom por categoria. Declarado; el filtro no se ejecuto aqui.',
        ],
        endpoints: [],
        flags: [
          { tone: 'info', label: 'SUBCONTADO x7,5', text: 'Declarado 3,5 K+; medido 26.130 estrellas. El catalogo del owner lo infravaloro siete veces y media.' },
          { tone: 'warn', label: 'AGPL-3.0 DE VERDAD', text: 'GitHub devuelve NOASSERTION, pero el archivo LICENSE (26,6 KB) es AGPL-3.0. Copyleft fuerte: si lo expones como servicio de red, la obligación de publicar el fuente aplica.' },
        ],
      },
      {
        id: 'freearhey',
        tier: 'validator',
        full: 'freearhey/iptv-checker',
        role: 'Validador · Node CLI',
        declared: '800+',
        declaredFloor: 800,
        m: { stars: 632, forks: 106, lang: 'JavaScript', license: 'MIT', pushed: '2026-03-06T14:15:53Z' },
        clone: 'git clone https://github.com/freearhey/iptv-checker.git',
        features: [
          'Owner: Node.js CLI profesional. Coincide con la descripcion oficial del repo.',
          'Owner: detecta resolucion real frente a etiqueta (expone el 4K falso). Declarado; la API y el flag --resolution-check no se ejecutaron aqui.',
          'Owner: check de codecs H264/HEVC/AV1, latencia y buffer, salida JSON. Declarado; no ejecutado.',
          'Owner: ejemplo new IPTVChecker().checkStream(url) con results.resolution.real. Declarado; el esquema de retorno no esta verificado en esta medicion.',
        ],
        endpoints: [],
        flags: [
          { tone: 'warn', label: 'DORMIDO 8 MESES', text: 'Ultimo push 2026-03-06, ocho meses antes de la medicion. Sigue sirviendo como sonda, pero no esperes correcciones.' },
          { tone: 'warn', label: 'SUBESTIMADO', text: 'Declarado 800+; medido 632 estrellas.' },
        ],
      },
      {
        id: 'shadialhasan',
        tier: 'validator',
        full: 'shadialhasan/iptv-m3u-validator',
        role: 'Validador · concurrente',
        declared: '500+',
        declaredFloor: 500,
        m: { stars: 0, forks: 0, lang: 'Python', license: 'MIT', pushed: '2026-10-01T10:56:44Z' },
        clone: 'git clone https://github.com/shadialhasan/iptv-m3u-validator.git',
        features: [
          'Owner: enterprise-grade concurrente, multithreading para miles de streams. Declarado; no ejecutado.',
          'Owner: latency tracker por region y purga automatica de canales muertos. Declarado; no ejecutado.',
          'Owner: exporta JSON con health metrics. Declarado; el esquema no esta verificado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'bad', label: 'NO SOSTENIDO', text: '0 estrellas y 0 forks medidos frente a 500+ declaradas. El repo existe y tuvo push el 2026-10-01, pero no tiene senal comunitaria: tratalo como codigo sin auditar.' },
        ],
      },
      {
        id: 'dispatcharr',
        tier: 'proxy',
        full: 'Dispatcharr/Dispatcharr',
        role: 'Proxy · Web UI + DVR',
        declared: '1.2K+',
        declaredFloor: 1200,
        m: { stars: 4514, forks: 353, lang: 'Python', license: 'AGPL-3.0', pushed: '2026-11-14T22:27:11Z' },
        clone: 'git clone https://github.com/Dispatcharr/Dispatcharr.git',
        features: [
          'Owner: Web UI moderna 2024/2025. Coincide con la descripcion oficial del repo.',
          'Owner: proxy y relay de streams, DVR con Comskip, EPG matching, M3U + Xtream Codes, catch-up/timeshift y VOD organizado. Declarado; no ejecutado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'ok', label: 'MEDIDO OK', text: '4.514 estrellas frente a 1,2 K+ declaradas; push del 2026-11-14, un dia antes de la medicion.' },
          { tone: 'warn', label: 'AGPL-3.0', text: 'Copyleft fuerte. Si lo embebes en un servicio de red, la obligacion de publicar el codigo aplica. Decide con criterio legal, no con un README.' },
        ],
      },
      {
        id: 'tuliprox',
        tier: 'proxy',
        full: 'euzu/tuliprox',
        role: 'Proxy · Rust',
        declared: '800+',
        declaredFloor: 800,
        m: { stars: 595, forks: 64, lang: 'Rust', license: 'MIT', pushed: '2026-11-14T16:50:58Z' },
        clone: 'git clone https://github.com/euzu/tuliprox.git',
        features: [
          'Owner: Rust de ultra rendimiento, gateway self-hosted. Coincide con la descripcion oficial del repo.',
          'Owner: M3U, Xtream Codes, HDHomeRun, Plex, Emby y Jellyfin; filtrado, merging, scheduling y web delivery. Declarado; no ejecutado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'warn', label: 'SUBESTIMADO', text: 'Declarado 800+; medido 595. Activo (push 2026-11-14) y con licencia MIT.' },
        ],
      },
      {
        id: 'kptv-proxy',
        tier: 'proxy',
        full: 'kpirnie/kptv-proxy',
        role: 'Proxy · Go',
        declared: '400+',
        declaredFloor: 400,
        m: { stars: 101, forks: 32, lang: 'Go', license: 'MIT (SPDX: NOASSERTION)', pushed: '2026-11-10T12:42:34Z' },
        clone: 'git clone https://github.com/kpirnie/kptv-proxy.git',
        features: [
          'Owner: Go de alto rendimiento con agregacion multi-fuente. Coincide con la descripcion oficial del repo.',
          'Owner: deduplicacion automatica, failover y M3U8 unificado con opciones avanzadas. Declarado; no ejecutado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'bad', label: 'INFLADO x4', text: 'Declarado 400+; medido 101 estrellas y 32 forks.' },
          { tone: 'warn', label: 'MIT EN EL ARCHIVO', text: 'GitHub no la clasifica (NOASSERTION), pero el LICENSE (1,9 KB) es MIT: permisiva. La discrepancia es del clasificador SPDX, no del repo.' },
        ],
      },
      {
        id: 'iptv-org-epg',
        tier: 'epg',
        full: 'iptv-org/epg',
        role: 'EPG · XMLTV / Schedules Direct',
        declared: '2K+',
        declaredFloor: 2000,
        m: { stars: 3510, forks: 551, lang: 'HTML', license: 'Unlicense', pushed: '2026-11-15T04:09:52Z' },
        clone: 'git clone https://github.com/iptv-org/epg.git',
        features: [
          'Owner: guia electronica para miles de canales con multiples fuentes (XMLTV, Schedules Direct). Coincide con la descripcion oficial.',
          'Owner: salida JSON + XML y match automatico canal-EPG. Declarado; no ejecutado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'ok', label: 'MEDIDO OK', text: '3.510 estrellas frente a 2 K+ declaradas; push del mismo dia de la medicion.' },
          { tone: 'info', label: 'LENGUAJE HTML', text: 'GitHub clasifica el repo como HTML. No implica que sea un sitio estatico: es la heuristica de GitHub sobre los datos del repo.' },
        ],
      },
      {
        id: 'alperokur',
        tier: 'epg',
        full: 'alperokur/xtream-api-proxy-epg',
        role: 'EPG · proxy Xtream',
        declared: '300+',
        declaredFloor: 300,
        m: { stars: 2, forks: 2, lang: 'JavaScript', license: 'MIT', pushed: '2025-07-26T09:15:40Z' },
        clone: 'git clone https://github.com/alperokur/xtream-api-proxy-epg.git',
        features: [
          'Owner: proxy Xtream Codes con EPG custom y deploy en Vercel. Declarado; el repo no tiene descripcion, asi que no hay nada que confirmar.',
          'Owner: metadata overrides dinamicos y JSON API para integraciones. Declarado; no ejecutado.',
        ],
        endpoints: [],
        flags: [
          { tone: 'bad', label: 'NO SOSTENIDO', text: '2 estrellas y 2 forks medidos frente a 300+ declaradas. El repo no tiene descripcion.' },
          { tone: 'bad', label: 'ABANDONADO 16 MESES', text: 'Ultimo push 2025-07-26, dieciseis meses antes de la medicion.' },
        ],
      },
      {
        id: 'drone9988',
        tier: '4k',
        full: 'Drone9988/IPTV',
        role: 'Especializado 4K · auto-tagging',
        declared: '600+',
        declaredFloor: 600,
        m: { stars: 0, forks: 0, lang: 'Python', license: 'sin licencia', pushed: '2026-11-15T05:09:03Z' },
        clone: 'git clone https://github.com/Drone9988/IPTV.git',
        features: [
          'Owner: auto-tagging por calidad (1080p FHD, 720p HD, 4K UHD) y playlist dedicada fhd.m3u8. Declarado; el repo no tiene descripcion ni archivo de licencia.',
          'Owner: update automatico cada 6 horas con GitHub Actions. Medido: push del 2026-11-15T05:09:03Z, si esta activo.',
        ],
        endpoints: [],
        flags: [
          { tone: 'bad', label: 'NO SOSTENIDO', text: '0 estrellas y 0 forks medidos frente a 600+ declaradas.' },
          { tone: 'bad', label: 'SIN LICENCIA', text: 'GitHub devuelve null: no hay licencia. Sin licencia no existe permiso de redistribucion por defecto.' },
        ],
      },
    ];

    // -----------------------------------------------------------------------
    // El 4K real, contado sobre api/streams.json de iptv-org (medido).
    // -----------------------------------------------------------------------
    const REAL_4K = {
      streams: 18689,
      withQuality: 14712,
      quality2160: 20,
      quality8k: 0,
      dist: [
        { label: '1080p', n: 5769 },
        { label: '720p', n: 5118 },
        { label: '576p', n: 2423 },
        { label: '480p', n: 446 },
        { label: '360p', n: 273 },
        { label: '2160p', n: 20, accent: true },
      ],
      recipe:
        "curl -s https://iptv-org.github.io/api/streams.json \\\n" +
        "  | jq -r '.[] | select(.quality == \"2160p\") | \"#EXTINF:-1,\" + .title + \"\\n\" + .url' \\\n" +
        "  > real-4k.m3u   # 20 entradas medidas el 2026-11-15",
    };

    // -----------------------------------------------------------------------
    // Stack recomendado: el catalogo original, reordenado por lo medido.
    // -----------------------------------------------------------------------
    const STACK = [
      { role: 'Agregador base', repo: 'iptv-org/iptv', why: '144.053 estrellas y push del mismo dia. El 4K real se filtra desde api/streams.json, no desde categories/4k.m3u.', tone: 'ok' },
      { role: 'Agregador con health checks', repo: 'dearbulut/iptv', why: 'Activo y con API JSON real, pero 41 estrellas, no 1,5 K+, y la API esta en /api/v1/. Valoralo por el dato servido, no por su fama.', tone: 'warn' },
      { role: 'Automatizacion de filtrado', repo: 'Guovin/iptv-api', why: '26.130 estrellas: el segundo repo mas grande del catalogo y el que mas se subestimo. Licencia NOASSERTION: leela.', tone: 'ok' },
      { role: 'Sonda de resolucion', repo: 'freearhey/iptv-checker', why: 'Sirve para medir resolucion real contra etiqueta, con mantenimiento cero desde 2026-03-06. Usalo como sonda, no como dependencia viva.', tone: 'warn' },
      { role: 'Proxy con UI y DVR', repo: 'Dispatcharr/Dispatcharr', why: '4.514 estrellas, activo. AGPL-3.0: la obligacion de copyleft aplica si lo expones como servicio.', tone: 'warn' },
      { role: 'Proxy permisivo en Rust', repo: 'euzu/tuliprox', why: '595 estrellas y MIT: la opcion menos restrictiva del bloque de proxies.', tone: 'ok' },
      { role: 'EPG', repo: 'iptv-org/epg', why: '3.510 estrellas, Unlicense y push del mismo dia. El unico componente del stack sin friccion legal.', tone: 'ok' },
      { role: 'Descartar hasta nueva evidencia', repo: 'shadialhasan, alperokur, Drone9988, kptv-proxy', why: 'Declaraciones de 300-600 estrellas que la API no sostiene (0, 2, 0 y 101). Uno lleva 16 meses sin push y otro no tiene licencia.', tone: 'bad' },
    ];

    // -----------------------------------------------------------------------
    // Pipeline del owner, paso a paso, con lo que respondio la realidad.
    // -----------------------------------------------------------------------
    const PIPELINE = [
      {
        n: 1,
        owner: 'curl -o 4k.m3u https://iptv-org.github.io/iptv/categories/4k.m3u',
        status: 'MEDIDO 404',
        tone: 'bad',
        real: 'La categoria 4K no existe: HTTP 404. El reemplazo medido es filtrar api/streams.json por quality == "2160p", que devuelve 20 streams.',
      },
      {
        n: 2,
        owner: 'npx iptv-checker -i 4k.m3u -o verified.json --resolution-check',
        status: 'NO EJECUTADO',
        tone: 'warn',
        real: 'Requiere Node y red. El flag --resolution-check y el esquema de salida son declarados por el owner; no se verificaron en esta sesion.',
      },
      {
        n: 3,
        owner: "jq '.channels | map(select(.quality.resolution == \"3840x2160\"))' verified.json > real-4k.json",
        status: 'NO EJECUTADO',
        tone: 'warn',
        real: 'El esquema .channels[].quality.resolution es declarado. Ninguna salida real de iptv-checker se inspecciono aqui, asi que el jq es una hipotesis, no un filtro probado.',
      },
      {
        n: 4,
        owner: 'node generate-m3u.js real-4k.json > supreme-4k.m3u',
        status: 'NO EJECUTADO',
        tone: 'warn',
        real: 'generate-m3u.js no existe en este repo ni se aporto con el catalogo. El paso final del pipeline es, hoy, un archivo que hay que escribir.',
      },
    ];

    const JSON_EXAMPLE = [
      '{',
      '  "channels": [',
      '    {',
      '      "id": "cnn-4k-us",',
      '      "name": "CNN UHD",',
      '      "url": "https://example.com/cnn-4k.m3u8",',
      '      "quality": { "label": "4K", "resolution": "3840x2160", "codec": "HEVC", "bitrate": "20000", "verified": true },',
      '      "epg": { "id": "cnn.us", "url": "https://epg.example.com/cnn.xml" },',
      '      "metadata": { "category": "News", "country": "US", "language": "eng", "logo": "https://logo.example.com/cnn.png" },',
      '      "health": { "status": "online", "latency_ms": 45, "last_check": "2025-01-20T10:30:00Z" }',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const HARD_TRUTHS = [
      {
        tone: 'bad',
        lead: '4 de las 4 URLs que el catalogo da como endpoint estan en 404.',
        body: 'categories/4k.m3u, categories/8k.m3u, api/channels.json y api/4k.json devuelven 404. Cualquier pipeline que empiece por copiar esa linea muere en el paso 1.',
      },
      {
        tone: 'bad',
        lead: 'El "rey del 4K" sirve 20 streams 2160p, no 30.000 canales 4K.',
        body: 'iptv-org declara quality en 14.712 de sus 18.689 streams. Solo 20 son 2160p y ninguno es 8K. La mayor parte del catalogo son 1080p (5.769) y 720p (5.118).',
      },
      {
        tone: 'bad',
        lead: '4 de 11 repos tienen estrellas insostenibles.',
        body: 'dearbulut 41 (declarado 1.5K+), shadialhasan 0 (500+), alperokur 2 (300+) y Drone9988 0 (600+). El catalogo no exagero en todos por igual: a Guovin lo infravaloro x7,5.',
      },
      {
        tone: 'warn',
        lead: 'La suma declarada no mide nada.',
        body: 'El suelo declarado es 93,6 K estrellas; lo medido es 179.578. El error va en las dos direcciones, asi que ni el total sirve para ordenar.',
      },
      {
        tone: 'warn',
        lead: 'Renombrar 1080p como 4K no es una mejora, es la degradacion inversa.',
        body: 'La ley ANTI_DEGRADATION y Fake_4K_Detector del repo prohiben declarar 4K lo que no lo es. El 4K se mantiene 4K; lo que se corrige es la ruta, no la etiqueta.',
      },
    ];

    // -----------------------------------------------------------------------
    // Presentacion
    // -----------------------------------------------------------------------
    function fmt(n) {
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function ratioLabel(measured, floor) {
      if (!floor) return null;
      const r = measured / floor;
      if (r >= 1) return '+' + 'x' + (Math.round(r * 100) / 100).toString().replace('.', ',');
      return '-' + 'x' + Math.round(1 / r);
    }

    function ratioTone(measured, floor) {
      if (!floor) return 'info';
      const r = measured / floor;
      if (r >= 1.5) return 'ok';
      if (r >= 0.75) return 'info';
      return 'bad';
    }

    function daysSince(iso) {
      const d = Math.round((Date.parse(MEASURED.at) - Date.parse(iso)) / 86400000);
      if (d <= 0) return 'hoy';
      if (d === 1) return 'hace 1 dia';
      return 'hace ' + d + ' dias';
    }

    function useCopy() {
      const [copied, setCopied] = useState(null);
      useEffect(() => {
        if (!copied) return undefined;
        const t = setTimeout(() => setCopied(null), 1800);
        return () => clearTimeout(t);
      }, [copied]);
      const copy = (key, value) => {
        const fail = () => setCopied('__error__');
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => setCopied(key), fail);
          } else {
            fail();
          }
        } catch (e) {
          fail();
        }
      };
      return [copied, copy];
    }

    function Styles() {
      return h('style', null, `
        .i4k-page {
          height: 100%; overflow: auto; padding: 26px 30px 48px;
          color: var(--dsw-alias-label-primary, #e8e8e8);
          background: var(--dsw-alias-bg-base, #16181c);
          font-size: 13.5px; line-height: 1.62;
          -webkit-font-smoothing: antialiased;
        }
        .i4k-wrap { max-width: 980px; margin: 0 auto; }
        .i4k-h1 { font-size: 20px; font-weight: 660; margin: 0 0 5px; letter-spacing: -0.015em; }
        .i4k-lead { margin: 0 0 12px; font-size: 12.8px; color: var(--dsw-alias-label-secondary, #a8adb6); max-width: 74ch; }
        .i4k-stamp {
          display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center;
          font-size: 11.4px; color: var(--dsw-alias-label-secondary, #a8adb6);
          padding: 9px 12px; border-radius: 8px; margin-bottom: 20px;
          background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        }
        .i4k-stamp b { color: var(--dsw-alias-label-primary, #e8e8e8); font-weight: 620; }
        .i4k-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr)); gap: 10px; margin: 0 0 22px; }
        .i4k-stat {
          padding: 11px 13px; border-radius: 9px;
          background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        }
        .i4k-stat-n { font-size: 17.5px; font-weight: 660; letter-spacing: -0.02em; line-height: 1.25; }
        .i4k-stat-l { font-size: 11.2px; color: var(--dsw-alias-label-secondary, #a8adb6); margin-top: 2px; }
        .i4k-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
        .i4k-filter {
          font: inherit; font-size: 12px; cursor: pointer; padding: 5px 11px; border-radius: 999px;
          color: var(--dsw-alias-label-secondary, #a8adb6);
          background: transparent; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.12));
        }
        .i4k-filter:hover { color: var(--dsw-alias-label-primary, #e8e8e8); border-color: var(--dsw-alias-border-l2, rgba(255,255,255,.24)); }
        .i4k-filter.on {
          color: var(--dsw-alias-bg-base, #16181c);
          background: var(--dsw-alias-brand-primary, #4a8fd4);
          border-color: var(--dsw-alias-brand-primary, #4a8fd4);
          font-weight: 600;
        }
        .i4k-count { opacity: .6; margin-left: 4px; font-variant-numeric: tabular-nums; }
        .i4k-card {
          padding: 16px 17px; border-radius: 11px; margin-bottom: 11px;
          background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
        }
        .i4k-card-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 9px; margin-bottom: 3px; }
        .i4k-name { font-size: 14.6px; font-weight: 660; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; letter-spacing: -0.01em; }
        .i4k-role { font-size: 11.8px; color: var(--dsw-alias-label-secondary, #a8adb6); }
        .i4k-flags { display: flex; flex-wrap: wrap; gap: 5px; margin: 9px 0 0; }
        .i4k-flag {
          font-size: 10.4px; font-weight: 640; letter-spacing: .02em;
          padding: 2px 8px; border-radius: 999px; white-space: nowrap;
          background: rgba(128,128,128,.14);
          background: color-mix(in srgb, var(--i4k-tone, #888) 16%, transparent);
          border: 1px solid var(--i4k-tone, #888);
          color: var(--i4k-tone, #888);
        }
        .i4k-starrow {
          display: flex; flex-wrap: wrap; align-items: center; gap: 7px;
          margin: 11px 0 7px; font-size: 12.6px;
        }
        .i4k-decl { color: var(--dsw-alias-label-secondary, #a8adb6); text-decoration: line-through; text-decoration-thickness: 1px; }
        .i4k-arrow { opacity: .45; }
        .i4k-meas { font-weight: 660; font-variant-numeric: tabular-nums; }
        .i4k-meta {
          display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0 0 10px;
          font-size: 11.4px; color: var(--dsw-alias-label-secondary, #a8adb6);
        }
        .i4k-meta span { white-space: nowrap; }
        .i4k-feat { margin: 0; padding-left: 17px; }
        .i4k-feat li { margin: 0 0 4px; font-size: 12.4px; }
        .i4k-eps { margin: 11px 0 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09)); padding-top: 9px; }
        .i4k-ep-legend { font-size: 10.6px; text-transform: uppercase; letter-spacing: .06em; opacity: .55; margin-bottom: 5px; }
        .i4k-ep { display: grid; grid-template-columns: 150px 1fr auto; gap: 2px 10px; padding: 4px 0; align-items: baseline; }
        .i4k-ep-label { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.4px; }
        .i4k-ep-url { font-size: 10.9px; color: var(--dsw-alias-label-secondary, #a8adb6); overflow-wrap: anywhere; }
        .i4k-ep-note { grid-column: 2 / 4; font-size: 10.9px; opacity: .62; }
        .i4k-clone { display: flex; gap: 8px; align-items: flex-start; margin: 11px 0 0; }
        .i4k-code {
          flex: 1; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.6px;
          padding: 7px 9px; border-radius: 7px; overflow-wrap: anywhere;
          background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.26));
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));
          white-space: pre-wrap;
        }
        .i4k-copy {
          font: inherit; font-size: 11.2px; cursor: pointer; padding: 6px 10px; border-radius: 7px;
          color: var(--dsw-alias-label-secondary, #a8adb6); white-space: nowrap;
          background: transparent; border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.14));
        }
        .i4k-copy:hover { color: var(--dsw-alias-label-primary, #e8e8e8); border-color: var(--dsw-alias-border-l2, rgba(255,255,255,.26)); }
        .i4k-section { margin-top: 30px; }
        .i4k-h2 { font-size: 14.2px; font-weight: 660; margin: 0 0 3px; letter-spacing: -0.01em; }
        .i4k-sub { margin: 0 0 13px; font-size: 12.2px; color: var(--dsw-alias-label-secondary, #a8adb6); max-width: 76ch; }
        .i4k-truth { padding: 11px 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
        .i4k-truth:first-of-type { border-top: none; padding-top: 0; }
        .i4k-truth-lead { font-weight: 645; font-size: 12.9px; margin: 0 0 3px; }
        .i4k-truth-body { margin: 0; font-size: 12.2px; color: var(--dsw-alias-label-secondary, #a8adb6); }
        .i4k-bar-row { display: grid; grid-template-columns: 62px 1fr 62px; gap: 9px; align-items: center; margin-bottom: 4px; }
        .i4k-bar-label { font-family: ui-monospace, Consolas, monospace; font-size: 11.2px; text-align: right; }
        .i4k-bar-track { height: 9px; border-radius: 5px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.26)); overflow: hidden; }
        .i4k-bar-fill { height: 100%; border-radius: 5px; background: var(--dsw-alias-label-secondary, #6b7280); }
        .i4k-bar-fill.accent { background: var(--dsw-alias-brand-primary, #4a8fd4); }
        .i4k-bar-n { font-size: 11.2px; font-variant-numeric: tabular-nums; opacity: .78; }
        .i4k-stack { display: grid; grid-template-columns: 168px 1fr; gap: 3px 12px; padding: 8px 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
        .i4k-stack:first-of-type { border-top: none; }
        .i4k-stack-role { font-size: 12.2px; font-weight: 620; }
        .i4k-stack-body { font-size: 12.2px; color: var(--dsw-alias-label-secondary, #a8adb6); }
        .i4k-stack-repo { font-family: ui-monospace, Consolas, monospace; font-size: 11.2px; color: var(--dsw-alias-label-primary, #e8e8e8); opacity: .85; }
        .i4k-step { padding: 9px 0; border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08)); }
        .i4k-step:first-of-type { border-top: none; }
        .i4k-step-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 4px; }
        .i4k-step-n {
          width: 19px; height: 19px; border-radius: 50%; flex: 0 0 auto;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 10.6px; font-weight: 700;
          background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.3));
          border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.2));
        }
        .i4k-step-real { margin: 0 0 0 27px; font-size: 12.2px; color: var(--dsw-alias-label-secondary, #a8adb6); }
        .i4k-pre {
          margin: 0; padding: 11px 13px; border-radius: 8px; overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.5px; line-height: 1.55;
          background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.28));
          border: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08));
          white-space: pre;
        }
        .i4k-foot {
          margin-top: 30px; padding-top: 14px;
          border-top: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.09));
          font-size: 11.4px; color: var(--dsw-alias-label-secondary, #a8adb6);
        }
        .i4k-foot p { margin: 0 0 6px; }
        .i4k-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.2px; }
        @media (max-width: 640px) {
          .i4k-page { padding: 18px 14px 36px; }
          .i4k-ep { grid-template-columns: 1fr auto; }
          .i4k-ep-note { grid-column: 1 / 3; }
          .i4k-stack { grid-template-columns: 1fr; }
        }
      `);
    }

    function Badge(props) {
      return h('span', {
        className: 'i4k-flag',
        style: { '--i4k-tone': TONE[props.tone] || TONE.info },
      }, props.children);
    }

    function EndpointRow(props) {
      const ep = props.ep;
      const ok = ep.status === 200;
      return h('div', { className: 'i4k-ep' },
        h('span', { className: 'i4k-ep-label' }, ep.label),
        h('span', { className: 'i4k-ep-url' }, ep.url),
        h(Badge, { tone: ok ? 'ok' : 'bad' }, String(ep.status)),
        h('span', { className: 'i4k-ep-note' }, ep.note)
      );
    }

    function RepoCard(props) {
      const r = props.repo;
      const delta = ratioLabel(r.m.stars, r.declaredFloor);
      const deltaTone = ratioTone(r.m.stars, r.declaredFloor);
      const [copied, copy] = useCopy();
      const copyKey = 'clone:' + r.id;
      return h('div', { className: 'i4k-card' },
        h('div', { className: 'i4k-card-head' },
          h('span', { className: 'i4k-name' }, r.full),
          h('span', { className: 'i4k-role' }, r.role),
          delta ? h(Badge, { tone: deltaTone }, delta) : null
        ),
        h('div', { className: 'i4k-starrow' },
          h('span', { className: 'i4k-decl' }, 'declarado ' + r.declared),
          h('span', { className: 'i4k-arrow' }, '/'),
          h('span', { className: 'i4k-meas' }, 'medido ' + fmt(r.m.stars) + ' estrellas'),
          h('span', { className: 'i4k-role' }, '· ' + fmt(r.m.forks) + ' forks')
        ),
        h('div', { className: 'i4k-meta' },
          h('span', null, r.m.lang || 'lenguaje n/d'),
          h('span', null, r.m.license || 'sin licencia'),
          h('span', null, 'push ' + r.m.pushed.slice(0, 10) + ' (' + daysSince(r.m.pushed) + ')'),
          h('span', null, r.m.stars === 0 ? 'sin senal comunitaria' : 'activo')
        ),
        h('ul', { className: 'i4k-feat' }, r.features.map((f, i) => h('li', { key: i }, f))),
        r.endpoints.length ? h('div', { className: 'i4k-eps' },
          h('div', { className: 'i4k-ep-legend' }, 'Endpoints sondeados el ' + MEASURED.atLocal),
          r.endpoints.map((ep) => h(EndpointRow, { key: ep.label, ep }))
        ) : null,
        h('div', { className: 'i4k-clone' },
          h('div', { className: 'i4k-code' }, r.clone),
          h('button', {
            type: 'button',
            className: 'i4k-copy',
            onClick: () => copy(copyKey, r.clone),
            title: 'Copiar el comando de clonado',
            'aria-label': 'Copiar: ' + r.clone,
          }, copied === copyKey ? 'copiado' : 'copiar')
        ),
        h('div', { className: 'i4k-flags' }, r.flags.map((f, i) => h(Badge, { key: i, tone: f.tone }, f.label))),
        h('ul', { className: 'i4k-feat', style: { marginTop: '8px', listStyle: 'none', paddingLeft: '0' } },
          r.flags.map((f, i) => h('li', { key: 't' + i, style: { opacity: .78, fontSize: '12px' } }, f.text))
        )
      );
    }

    function Section(props) {
      return h('div', { className: 'i4k-section' },
        h('h2', { className: 'i4k-h2' }, props.title),
        props.sub ? h('p', { className: 'i4k-sub' }, props.sub) : null,
        props.children
      );
    }

    // -----------------------------------------------------------------------
    // Icono de la barra lateral izquierda. El sidebar es el dueno del boton:
    // aqui solo se dibuja el glifo. `size` es la arista pedida, `active` marca
    // el panel seleccionado. Marco 4K + tres barras = calidad medida, no promesa.
    // -----------------------------------------------------------------------
    function SidebarIcon(props) {
      const size = (props && props.size) || 20;
      const active = !!(props && props.active);
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.62 },
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
        h('path', { d: 'M4 8.5V4.5h4.5' }),
        h('path', { d: 'M15.5 4.5H20v4' }),
        h('path', { d: 'M4 15.5v4h4.5' }),
        h('path', { d: 'M20 15.5v4h-4.5' }),
        h('path', { d: 'M8 16v-3.2', strokeWidth: 2.4 }),
        h('path', { d: 'M12 16V9.6', strokeWidth: 2.4 }),
        h('path', { d: 'M16 16V6.4', strokeWidth: 2.4, opacity: active ? 1 : 0.9 })
      );
    }

    function Page() {
      const [tier, setTier] = useState('all');
      const [copied, copy] = useCopy();

      const counts = useMemo(() => {
        const c = { all: REPOS.length };
        REPOS.forEach((r) => { c[r.tier] = (c[r.tier] || 0) + 1; });
        return c;
      }, []);

      const visible = tier === 'all' ? REPOS : REPOS.filter((r) => r.tier === tier);

      const totals = useMemo(() => {
        const measured = REPOS.reduce((a, r) => a + r.m.stars, 0);
        const declared = REPOS.reduce((a, r) => a + r.declaredFloor, 0);
        const inflated = REPOS.filter((r) => r.m.stars < r.declaredFloor * 0.75).length;
        return { measured, declared, inflated };
      }, []);

      const maxBar = REAL_4K.dist.reduce((a, d) => Math.max(a, d.n), 0);

      return h('div', { className: 'i4k-page' },
        h(Styles),
        h('div', { className: 'i4k-wrap' },

          h('h1', { className: 'i4k-h1' }, 'Repos supremos IPTV 4K — declarado frente a medido'),
          h('p', { className: 'i4k-lead' },
            'Los 11 repositorios que el catálogo del owner propone para 4K, cada uno con dos columnas: lo que el catálogo afirma y lo que devolvieron la API de GitHub y una petición real a cada endpoint. El mapa se conserva completo; las cifras y las URLs se sustituyen por las medidas.'
          ),

          h('div', { className: 'i4k-stamp' },
            h('span', null, 'Medido ', h('b', null, MEASURED.atLocal)),
            h('span', null, 'Fuente: ', h('b', null, MEASURED.sources)),
            h('span', null, 'Sin caché intermedia: cada cifra se leyó una vez, hoy.')
          ),

          h('div', { className: 'i4k-stats' },
            h('div', { className: 'i4k-stat' },
              h('div', { className: 'i4k-stat-n' }, String(REPOS.length)),
              h('div', { className: 'i4k-stat-l' }, 'repos del catálogo')),
            h('div', { className: 'i4k-stat' },
              h('div', { className: 'i4k-stat-n' }, fmt(totals.measured)),
              h('div', { className: 'i4k-stat-l' }, 'estrellas medidas (declarado: 93,6 K)')),
            h('div', { className: 'i4k-stat' },
              h('div', { className: 'i4k-stat-n' }, totals.inflated + ' de ' + REPOS.length),
              h('div', { className: 'i4k-stat-l' }, 'declaraciones insostenibles')),
            h('div', { className: 'i4k-stat' },
              h('div', { className: 'i4k-stat-n' }, String(REAL_4K.quality2160)),
              h('div', { className: 'i4k-stat-l' }, 'streams 2160p reales en iptv-org'))
          ),

          h('div', { className: 'i4k-filters' },
            TIERS.map((t) => h('button', {
              key: t.id,
              type: 'button',
              className: 'i4k-filter' + (tier === t.id ? ' on' : ''),
              onClick: () => setTier(t.id),
              'aria-pressed': tier === t.id,
            }, t.label, h('span', { className: 'i4k-count' }, String(counts[t.id] || 0))))
          ),

          visible.map((r) => h(RepoCard, { key: r.id, repo: r })),

          h(Section, {
            title: 'Verdades duras de la medición',
            sub: 'Lo que el catálogo no dice y el sondeo sí. Cada punto se puede reproducir con las skills iptv-4k-source-truth-audit e iptv-4k-pipeline-automation.',
          },
            HARD_TRUTHS.map((t, i) => h('div', { className: 'i4k-truth', key: i },
              h('p', { className: 'i4k-truth-lead' },
                h(Badge, { tone: t.tone }, 'MEDIDO'),
                ' ',
                t.lead
              ),
              h('p', { className: 'i4k-truth-body' }, t.body)
            ))
          ),

          h(Section, {
            title: 'El 4K real: 20 streams, no 30.000',
            sub: 'Distribución del campo quality en api/streams.json de iptv-org: ' + fmt(REAL_4K.withQuality) + ' de ' + fmt(REAL_4K.streams) + ' streams lo declaran. La escala es lineal contra 1080p.',
          },
            h('div', null, REAL_4K.dist.map((d) => h('div', { className: 'i4k-bar-row', key: d.label },
              h('span', { className: 'i4k-bar-label' }, d.label),
              h('div', { className: 'i4k-bar-track' },
                h('div', {
                  className: 'i4k-bar-fill' + (d.accent ? ' accent' : ''),
                  style: { width: Math.max(1.2, (d.n / maxBar) * 100) + '%' },
                })
              ),
              h('span', { className: 'i4k-bar-n' }, fmt(d.n))
            ))),
            h('div', { className: 'i4k-clone', style: { marginTop: '13px' } },
              h('div', { className: 'i4k-code' }, REAL_4K.recipe),
              h('button', {
                type: 'button', className: 'i4k-copy',
                onClick: () => copy('recipe', REAL_4K.recipe),
                title: 'Copiar la receta medida',
              }, copied === 'recipe' ? 'copiado' : 'copiar')
            ),
            h('p', { className: 'i4k-sub', style: { marginTop: '9px' } },
              'Lo medido: ' + fmt(REAL_4K.quality2160) + ' streams con quality 2160p y ' + REAL_4K.quality8k + ' con 8K. La receta está copiada de la medición, no del catálogo. Renombrar los 5.769 streams de 1080p como 4K sería la degradación inversa que prohíbe la ley ANTI_DEGRADATION: el 4K se mantiene 4K y lo que se corrige es la ruta.'
            )
          ),

          h(Section, {
            title: 'Stack recomendado, revisado por medición',
            sub: 'El mismo stack del catálogo, reordenado por lo que sobrevivió al sondeo. Donde el catálogo decía "usa esto", aquí dice por qué.',
          },
            STACK.map((s, i) => h('div', { className: 'i4k-stack', key: i },
              h('div', { className: 'i4k-stack-role' }, s.role),
              h('div', { className: 'i4k-stack-body' },
                h('span', { className: 'i4k-stack-repo' }, s.repo),
                ' — ',
                s.why
              )
            ))
          ),

          h(Section, {
            title: 'Pipeline 4K: declarado frente a ejecutado',
            sub: 'Los cuatro pasos del catálogo. Solo el paso 1 se intentó de verdad, y falló; su reemplazo está medido. Los pasos 2-4 no se ejecutaron en esta sesión.',
          },
            PIPELINE.map((p) => h('div', { className: 'i4k-step', key: p.n },
              h('div', { className: 'i4k-step-head' },
                h('span', { className: 'i4k-step-n' }, String(p.n)),
                h('span', { className: 'i4k-mono', style: { flex: '1 1 320px', overflowWrap: 'anywhere' } }, p.owner),
                h(Badge, { tone: p.tone }, p.status)
              ),
              h('p', { className: 'i4k-step-real' }, p.real)
            ))
          ),

          h(Section, {
            title: 'Esquema JSON del catálogo — declarado, no producido',
            sub: 'Se reproduce tal cual lo entregó el owner para no perder información. No es la salida de ninguna herramienta ejecutada: verified:true y health.status:"online" son campos prometidos, no mediciones.',
          },
            h('pre', { className: 'i4k-pre' }, JSON_EXAMPLE)
          ),

          h('div', { className: 'i4k-foot' },
            h('p', null,
              'Regla legal: solo streams, listas, credenciales y servidores autorizados por el propietario. Nada de evasión de proveedores, bypass de DRM, robo de señal ni abuso de ISP. Las cifras de este panel describen repositorios públicos, no contenido.'
            ),
            h('p', null,
              'Licencias: se verificaron dos veces — campo SPDX de la API y el archivo LICENSE real. Donde GitHub dice NOASSERTION, el texto dice AGPL-3.0 (Guovin/iptv-api) y MIT (kpirnie/kptv-proxy). Gana el archivo; el SPDX solo no basta.'
            ),
            h('p', null,
              'Procedencia: GitHub REST y GET directo, ' + MEASURED.atLocal + '. Las estrellas y los push cambian: este panel es una foto, no un reloj. Re-medir antes de decidir con estas cifras.'
            ),
            h('p', null,
              'Este panel declara. Quien aplica son las skills: iptv-supreme-repos-4k (catálogo completo), iptv-4k-source-truth-audit (cómo se mide), iptv-4k-pipeline-automation (cómo se construye sin mentir).'
            )
          )
        )
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Icono en la barra lateral izquierda. El id direcciona el panel `main`.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'iptv-4k-supremo',
          order: 26,
          label: 'Repos IPTV 4K',
        }, SidebarIcon));

        // Panel central con la MISMA key que el id del icono.
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'iptv-4k-supremo',
        }, Page));
      },
    };
  },
});
