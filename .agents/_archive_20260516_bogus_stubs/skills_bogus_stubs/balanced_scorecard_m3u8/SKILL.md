---
name: balanced_scorecard_m3u8
description: "Balanced Scorecard permanente para la evaluación de listas M3U8 generadas. Contiene los criterios de evaluación, pesos, historia completa de 17+ listas, y el benchmark actual (OMEGA CRYSTAL V5 — 796 líneas/canal). TODO generador DEBE ser evaluado contra este scorecard después de cada generación."
---

# 📊 SKILL: Balanced Scorecard M3U8 — Evaluación Permanente

> **AUTORIDAD**: Este documento define los criterios OBLIGATORIOS de evaluación para toda lista M3U8 generada.
> Toda generación DEBE ser evaluada contra este scorecard. No hay excepciones.
> **Actualizado 2026-04-07**: Alineado al estándar OMEGA CRYSTAL V5 (796 líneas/canal, 10 capas L0-L10).

---

## 1. Criterios de Evaluación (10 dimensiones)

| # | Dimensión | Peso | Qué evalúa | Score 100 = |
| - | --------- | ---- | ----------- | ----------- |
| 1 | **EXTHTTP** | 12% | Headers HTTP JSON por canal | 1/canal, JSON bien formado, sid+nonce presentes |
| 2 | **KODIPROP** | 8% | Propiedades Kodi/inputstream | **65/canal**, DASH+HLS adaptive, Widevine+FairPlay |
| 3 | **EXTVLCOPT** | 12% | Opciones VLC por canal | **110/canal**, 12 subsecciones, sin duplicados por key |
| 4 | **EXT-X-APE** | 8% | Tags APE custom (stealth, tokens, QoS) | **470/canal** (23 secciones × ~20), CORTEX+TRANSPORT |
| 5 | **Audio** | 8% | Canales de audio correctos | Codec/bitrate apropiados, Atmos/DTS/TrueHD |
| 6 | **HDR/Color** | 8% | Perfiles P0-P5 correctos | BT.2020, PQ/HLG, 5000 nits, distribución coherente |
| 7 | **Bugs** | 12% | Bugs bloqueantes en generación | 0 bugs = 100 |
| 8 | **WAF/URL** | 12% | URLs limpias, sin WAF triggers | 100% URLs sin `?params` peligrosos |
| 9 | **Multi-Server** | 10% | Cada canal usa SU servidor | N servidores, 0 mezcla de credenciales |
| 10 | **Integrity** | 10% | Conteo canales entrada = salida | EXTINF == URLs, 1:1 ratio, **796 líneas/canal exactas** |

### Fórmula

```
TOTAL = sum(Score_i × Peso_i) para i=1..10
```

---

## 2. Cómo Auditar una Lista

### Script de Auditoría Rápida

```javascript
// Guardar como /tmp/audit_m3u8.js y ejecutar: node /tmp/audit_m3u8.js <path>
const fs = require('fs');
const readline = require('readline');
const f = process.argv[2];
const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });

let lines=0, extinf=0, urls=0, extvlcopt=0, kodiprop=0, extxape=0, exthttp=0;
let cmaf=0, phantom=0, telchemy=0, extattrfromurl=0;
let blocks=0, curSize=0, sizes=[], curVlc=0, vlcs=[];
const hosts = {};

rl.on('line', l => {
    lines++; const t = l.trim();
    if (t.startsWith('#EXTINF:')) {
        extinf++;
        if (blocks > 0) { sizes.push(curSize); vlcs.push(curVlc); }
        blocks++; curSize = 1; curVlc = 0;
    } else if (blocks > 0) {
        curSize++;
        if (t.startsWith('#EXTVLCOPT:')) { extvlcopt++; curVlc++; }
        else if (t.startsWith('#KODIPROP:')) kodiprop++;
        else if (t.startsWith('#EXT-X-APE')) extxape++;
        else if (t.startsWith('#EXTHTTP:')) exthttp++;
        else if (t.startsWith('#EXT-X-CMAF')) cmaf++;
        else if (t.startsWith('#EXT-X-PHANTOM-HYDRA')) phantom++;
        else if (t.startsWith('#EXT-X-APE-TELCHEMY')) telchemy++;
        else if (t.startsWith('#EXTATTRFROMURL')) extattrfromurl++;
        if (/^https?:\/\//.test(t)) {
            urls++;
            try { const h = new URL(t.split('|')[0]).hostname; hosts[h]=(hosts[h]||0)+1; } catch(e){}
        }
    }
});

rl.on('close', () => {
    if (blocks > 0) { sizes.push(curSize); vlcs.push(curVlc); }
    const avg = a => a.length ? (a.reduce((s,v)=>s+v,0)/a.length).toFixed(1) : '0';
    console.log('── OMEGA CRYSTAL V5 SCORECARD ──');
    console.log(`EXTINF: ${extinf} | URLs: ${urls} | 1:1: ${extinf===urls?'YES ✅':'NO ❌'}`);
    console.log(`Lines/ch: ${avg(sizes)} | Target: 796 | ${Math.round(avg(sizes))===796?'✅':'⚠️ DELTA: '+(avg(sizes)-796)}`);
    console.log(`L1 VLC/ch: ${avg(vlcs)} | Target: 110`);
    console.log(`L2 HTTP/ch: ${(exthttp/extinf).toFixed(1)} | Target: 1`);
    console.log(`L3 KODI/ch: ${(kodiprop/extinf).toFixed(1)} | Target: 65`);
    console.log(`L4 CMAF/ch: ${(cmaf/extinf).toFixed(1)} | Target: 25`);
    console.log(`L6 TELCHEMY/ch: ${(telchemy/extinf).toFixed(1)} | Target: 10`);
    console.log(`L7 ATTR/ch: ${(extattrfromurl/extinf).toFixed(1)} | Target: 53`);
    console.log(`L8 APE/ch: ${(extxape/extinf).toFixed(1)} | Target: 470`);
    console.log(`L9 PHANTOM/ch: ${(phantom/extinf).toFixed(1)} | Target: 13`);
    console.log('SERVERS:');
    Object.entries(hosts).sort((a,b)=>b[1]-a[1]).forEach(([h,c]) => {
        console.log('  '+h+': '+c+' ('+ ((c/urls)*100).toFixed(1)+'%)');
    });
    console.log('Total servers:', Object.keys(hosts).length);
});
```

### Checklist Manual

1. [ ] EXTINF count == URL count (Integrity)
2. [ ] Lines/canal = 796 exactas (OMEGA V5 Compliance)
3. [ ] L1 VLC/canal = 110 (12 subsecciones)
4. [ ] L2 EXTHTTP/canal = 1 (JSON con sid+nonce)
5. [ ] L3 KODIPROP/canal = 65
6. [ ] L4 CMAF/canal = 25 (7 niveles fallback)
7. [ ] L8 APE/canal = 470 (23 secciones)
8. [ ] L9 PHANTOM/canal = 13
9. [ ] 0 bare hostnames, 0 placeholder URLs (URL Quality)
10. [ ] 0 CRED_MISSING (Multi-Server)
11. [ ] Todos los servidores conectados aparecen (Multi-Server)
12. [ ] VLC keys sin duplicados por canal
13. [ ] Tag order: L0→L1→L2→L3→L4→L5→L6→L7→L8→L9→L10

---

## 3. Historia Completa (Benchmark)

| # | Versión | Fecha | Score | Hito |
| - | ------- | ----- | ----- | ---- |
| 1 | v5.0 INTEGRATED | Feb 20 | 29.4 | Primera lista |
| 2 | v5.1 ANTI_FREEZE | Feb 25 | 36.9 | Anti-freeze |
| 3 | v5.2 LCEVC_INJECTED | Mar 1 | 42.5 | LCEVC injection |
| 4 | v5.3 FUSION | Mar 5 | 46.3 | Fusion protocol |
| 5 | v5.4 MAX_AGGRESSION | Mar 8 | 52.5 | Max Aggression |
| 6 | TYPED_ARRAYS 0307 | Mar 7 | 54.8 | Typed Arrays motor |
| 7 | TYPED_ARRAYS 0314 | Mar 14 | 57.8 | Mejoras continuas |
| 8 | TYPED_ARRAYS 0315 | Mar 15 | 58.8 | Mejoras continuas |
| 9 | TYPED_ARRAYS 0321 | Mar 21 | 60.4 | Pre-quality fix |
| 10 | 0322 Audio+VLC Fix | Mar 22 | 76.6 | Audio fix, VLC dedup |
| 11 | 0322 Advanced Quality | Mar 22 | 83.4 | HDR/Color, Quality |
| 12 | 0323 WAF-CLEAN | Mar 23 | 92.4 | WAF triggers eliminados |
| 13 | 0325 placeholder | Mar 25 | 38.0 | Regresión credenciales |
| 14 | 0325 partial | Mar 25 | 55.0 | Primer fix parcial |
| 15 | 0326 single-srv | Mar 26 | 85.0 | URLs correctas, 1 server |
| 16 | 0326 MULTI-SRV | Mar 26 | 97.4 | 3 servers, 0 mezcla |
| 17 | **0407 OMEGA CRYSTAL V5** | **Apr 7** | **99.0** | **796 líneas/canal, 10 capas L0-L10, monolítico, polimorfismo + idempotencia** |

---

## 4. Targets OMEGA CRYSTAL V5

| Métrica | Target | Actual (#17) |
| --- | --- | --- |
| Score total | ≥98 | **99.0** ✅ |
| URLs válidas | 100% | 100% ✅ |
| Servidores | = conectados | N/N ✅ |
| Lines/canal | **796 exactas** | 796 ✅ |
| L1 VLC/canal | 110 | 110 ✅ |
| L2 HTTP/canal | 1 | 1 ✅ |
| L3 KODI/canal | 65 | 65 ✅ |
| L8 APE/canal | 470 | 470 ✅ |
| EXTINF:URL ratio | 1:1 | 1:1 ✅ |
| Bugs | 0 | 0 ✅ |
