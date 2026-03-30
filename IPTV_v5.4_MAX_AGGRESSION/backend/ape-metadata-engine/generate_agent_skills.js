const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '.agent', 'skills');

if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

const skills = [
    {
        name: 'M3U_Playlist_Parser',
        desc: 'Ingiere listas M3U estándar y extrae topología sin reproducir video.',
        logic: 'Lee #EXTM3U y separa bloques por #EXTINF. Devuelve array de canales y URLs brutas.'
    },
    {
        name: 'M3U8_Manifest_Parser',
        desc: 'Descompone HLS Playlists (RFC 8216) separando tags y segmentos.',
        logic: 'Distingue Master vs Media playlist. Convierte URLs relativas a absolutas basadas en el origen.'
    },
    {
        name: 'EXTINF_Extractor',
        desc: 'Aísla la identidad nominal del canal desde el tag originario.',
        logic: 'Usa regex para extraer tvg-id, group-title y el channel_name después de la coma.'
    },
    {
        name: 'EXT_X_STREAM_INF_Extractor',
        desc: 'Cuantifica calidad física y codecs del HLS manifest.',
        logic: 'Extrae BANDWIDTH, RESOLUTION, CODECS y FRAME-RATE del Master Playlist.'
    },
    {
        name: 'HTTP_Header_Analyzer',
        desc: 'Extrae telemetría técnica de las cabeceras de red.',
        logic: 'Inspecciona Server, Content-Type, Content-Length y cabeceras custom X-APE-*.'
    },
    {
        name: 'HTTP_Status_Classifier',
        desc: 'Traduce códigos HTTP upstream a un estado operativo.',
        logic: '200=active, 206=active_partial, 403=blocked_auth, 404=offline_missing, 50x=degraded.'
    },
    {
        name: 'Stream_Fingerprinting',
        desc: 'Genera hash SHA-256 estático de las propiedades físicas del canal.',
        logic: 'sha256(RESOLUTION|CODEC|BANDWIDTH). Ignora fragmentos temporales (.ts).'
    },
    {
        name: 'Request_to_Channel_Correlator',
        desc: 'Vincula un request anonimizado con la identidad real del canal.',
        logic: 'Prioriza X-APE-Channel-Name, luego #EXTINF, luego token de la URL.'
    },
    {
        name: 'Duplicate_Stream_Detector',
        desc: 'Agrupa streams dispares que comparten el mismo fingerprint físico.',
        logic: 'Si hashA == hashB, agrupar bajo duplicate_group_HashA.'
    },
    {
        name: 'Stream_Stability_Scorer',
        desc: 'Puntúa de 0 a 100 la fiabilidad del stream basado en latencia y códigos de error.',
        logic: 'Latencia < 200ms = 100pts. Pierde 10pts por cada 100ms extra. Errores 4xx/5xx = 0pts.'
    },
    {
        name: 'Multi_Channel_Monitor',
        desc: 'Trackea concurrentemente listas en tiempo real sin IO blocker.',
        logic: 'Mantiene un Map en memoria indexado por channel_name con el último payload activo.'
    },
    {
        name: 'Channel_Inference_Engine',
        desc: 'Infiere identidad deductiva si faltan cabeceras o tags.',
        logic: 'Extrae tokens del URL path via regex (e.g., /live/sports/espn.m3u8 -> espn).'
    },
    {
        name: 'Query_Params_Analyzer',
        desc: 'Audita variables GET pasadas al resolver.',
        logic: 'Parsea ?token= o ?id= para perfilar la sesión y la seguridad (URLSearchParams).'
    },
    {
        name: 'CDN_Server_Identifier',
        desc: 'Clasifica el Vendor Upstream desde las cabeceras HTTP.',
        logic: 'Busca firmas conocidas en cabecera Server: Cloudflare, nginx, Xtream Codes.'
    },
    {
        name: 'Cross_Playlist_Correlator',
        desc: 'Establece mapeos entre canales de Lista A y Lista B.',
        logic: 'Cruza arrays iterando sobre Fingerprints exactos para armar clusters de backup.'
    },
    {
        name: 'Channel_State_History',
        desc: 'Conserva la ventana deslizante (sliding window) de latencia y status local.',
        logic: 'Retiene los últimos 10 probes HTTP por canal para análisis temporal.'
    },
    {
        name: 'Degradation_Detector',
        desc: 'Alerta preventivamente antes del timeout del player (Zapping predictor).',
        logic: 'Si TTFB > TargetDuration HLS o la derivada de latencia sube 200%, activa alerta.'
    },
    {
        name: 'RealTime_Event_Aggregator',
        desc: 'Compila todas las extracciones en el Output JSON Mandatorio.',
        logic: 'Unifica todos los inputs (1 al 17) y emite un objeto estructurado según contrato.'
    }
];

skills.forEach(skill => {
    const dir = path.join(SKILLS_DIR, skill.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const ds = `---
name: ${skill.name}
description: ${skill.desc}
---

# ${skill.name}

## Objetivo
${skill.desc}

## Restricciones Críticas
- **Cero Reproducción:** NO decodificar, descargar frames, ni usar FFprobe sobre streams de video (.ts).
- Todo debe inferirse por texto puro (Manifests orientados a RFC 8216) y HTTP headers.

## Lógica Interna
${skill.logic}

## Inputs
- Metadatos M3U/M3U8, Headers HTTP, y/o sub-resultados de skills anteriores.

## Outputs
- Componentes del payload JSON final.

## Errores Detectables
- Timeout de cabecera.
- M3U8 truncados.
- Falsos streams (text/html captive portals).
`;

    fs.writeFileSync(path.join(dir, 'SKILL.md'), ds);
    console.log(`[+] Creada Skill del Agente: ${skill.name}`);
});

console.log('\\n[✓] ¡Las 18 Skills HLS Metadata-Only fueron incrustadas en el Agente Antigravity (.agent/skills/)!');
