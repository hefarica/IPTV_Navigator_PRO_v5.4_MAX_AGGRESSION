---
trigger: always_on
---



# SOP: SHIELDED = Nombre de Archivo, NUNCA URLs Internas

> **REGLA CARDINAL INMUTABLE — 2026-04-28**

## Definición

SHIELDED en el ecosistema IPTV significa **SOLO** renombrar el archivo M3U8 con sufijo `_SHIELDED.m3u8` al subirlo al VPS. Las URLs internas de los canales son y DEBEN SER directas al proveedor (`http://proveedor/live/user/pass/id.m3u8`).

## Arquitectura

```
URL principal (SHIELDED):
  https://iptv-ape.duckdns.org/lists/APE_LISTA_xxx_SHIELDED.m3u8
  ↑ Servida desde el VPS

URLs internas (DIRECTAS — correcto por diseño):
  http://nfqdeuxu.x1megaott.online/live/USER/PASS/123.m3u8
  http://tivigo.cc/live/USER/PASS/456.m3u8
  ↑ El WireGuard tunnel las captura y las rutea por NGINX

Player → WireGuard → VPS (DNS hijack + NGINX) → SurfShark → Proveedor
```

## Prohibiciones absolutas

1. **NUNCA** modificar `m3u8-typed-arrays-ultimate.js` para agregar `/shield/` a URLs
2. **NUNCA** modificar `generateChannelEntry()` para wrapping de URLs
3. **NUNCA** modificar `buildChannelUrl()` ni `buildUniversalUrl()` para shielding
4. **NUNCA** transformar `http://proveedor/` → `https://iptv-ape.duckdns.org/shield/{hash}/proveedor/`
5. **NUNCA** sugerir que los freezes se arreglan "shieldeando las URLs internas"

## Único punto de shielding en código

`gateway-manager.js` línea ~738: `finalFilename.replace(/\.m3u8$/i, '_SHIELDED.m3u8')`

## Evidencia

Lista `APE_LISTA_1777243113563_SHIELDED.m3u8`: 15,444 URLs directas, 0 con `/shield/`, funciona perfectamente via WireGuard tunnel.
