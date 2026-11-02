---
description: IPTV PREMIUM — carga el perfil IPTV_PREMIUM, la skill iptv-suprema-2026-premium y ejecuta auditoría, receta de canal, perfil P0-P5 o verificación de evidencias. No emite juicio de calidad salvo que se pida.
argument-hint: "[audit|channel|recipe|profile|verify] [target]"
allowed-tools: Read, Glob, Grep, Skill
---

# /suprema-2026

**Propósito:** cargar el perfil `IPTV_PREMIUM` y operar con la skill `iptv-suprema-2026-premium` sobre una lista, un canal o una evidencia. La salida separa `declared / observed / resolved / applied / verified`.

## Uso

```text
/suprema-2026
/suprema-2026 audit <list-or-url>
/suprema-2026 channel <index|name> <list>
/suprema-2026 recipe <P0..P5>
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 preset <name>
/suprema-2026 verify <evidence-path>
```

## Flujo

1. Leer `profiles/IPTV_PREMIUM.json` y `.agents/skills/iptv-suprema-2026-premium/SKILL.md`.
2. Identificar el modo y el target.
3. Adquirir evidencia; registrar ruta, hash y fecha.
4. Aplicar el modelo de cuatro ámbitos.
5. Separar `declared / observed / resolved / applied / verified`.
6. Producir el reporte.
7. Declarar límites; no rellenar datos ausentes.

## Modos

### `audit`
Audita estructura, canales, URLs, perfiles, capas y muestra HTTP limitada. Nunca lanza 10k peticiones sin control de rate-limit.

### `channel`
Extrae el bloque completo del canal, mapea cada valor a su ámbito y describe la cadena de imagen. No emite juicio de calidad.

### `recipe`
Devuelve la receta P0–P5 y la composición `IPTV_PREMIUM`; distingue `source`, `classification`, `reconstruction`, `presentation` y `variant`.

### `profile`
Muestra el perfil y su matriz de madurez.

### `verify`
Comprueba hashes, JSON y evidencia; no convierte una declaración en medición.

## Salida

```text
.agents/reports/suprema-2026_<timestamp>.md
```

## Reglas

- No fabricar resolución, codec, HDR, audio, CMAF, latencia ni calidad.
- No presentar una declaración como medición.
- No exponer credenciales.
- No modificar VPS, LAB ni listas de producción.
- No emitir juicio de calidad si no se pidió.

## Ejemplos

```text
/suprema-2026 profile IPTV_PREMIUM
/suprema-2026 channel 159 artifacts/audit/2026-11-02_APE_LISTA_1793589060441/playlist.m3u8
/suprema-2026 recipe P4
/suprema-2026 audit https://iptv-ape.duckdns.org/lists/APE_LISTA_1793589060441.m3u8
/suprema-2026 verify artifacts/audit/2026-11-02_APE_LISTA_1793589060441/AUDIT_REPORT.md
```






