# Reconciliación LAB ↔ app: qué emite cada perfil (medido)

Fecha de la medición: ronda 22. Todo lo de aquí está **medido ejecutando el emisor real**
en un sandbox de Node (`vm` con DOM simulado), no a ojo. Lo que no se pudo medir va al final,
en «NO COMPUTADO».

## 1. Qué se cambió y por qué

Antes de esta ronda el emisor (la función que escribe la lista M3U8) sólo tomaba del JSON del
laboratorio (`contracts/lab/...CALIBRATED_BULLETPROOF_v9.3.json`) el `network-caching` de los
seis perfiles «.5»; los seis perfiles base (P0…P5) seguían con el valor de una copia v8
antigua (5 000 ms todos). Además, el módulo que publica esos valores
(`ape-lab-12p-reconcile.js`) y la capa 12P (`lab-12p-conformance.js`) usaban **el mismo nombre
global** (`window.APE_LAB_12P`), y en la página se carga después la capa 12P, que machacaba
el puente: en un navegador real el puente quedaba muerto.

Cambios de esta ronda:

1. `ape-lab-12p-reconcile.js` pasa a publicarse como `window.APE_LAB_12P_RECONCILE` (v1.2.0).
   El emisor usa ese nombre en sus cuatro puntos de consulta.
2. El emisor pide al puente el `network-caching` de **los 12** perfiles (antes sólo los «.5»).
3. Función nueva `networkCachingEmittedMs(id)`: emite el valor **declarado** por el laboratorio,
   recortado al techo que el propio perfil aguanta (`buffer_effective_s`). No inventa nada.
4. La declaración de cabecera `#EXT-X-APE-CACHING-PRECEDENCE` publica también `LAB_NC=` y
   deja de saltarse los «.5».
5. El arnés de regeneración (`_vps_stage/tests/regen_headless/`) carga el puente antes que el
   config, igual que la página, y avisa en su traza (`puente12p=cargado`).

## 2. Tabla de los 12 perfiles (medida)

| perfil | `network-caching` declarado | buffer declarado ms | techo efectivo s | techo ms | **se emite ms** |
|--------|---------------------------:|--------------------:|-----------------:|---------:|----------------:|
| P0     | 19 000 | 19 000 | 15 | 15 000 | **15 000** (recortado, es el defecto D1 del LAB) |
| P0.5   | 15 000 | 15 000 | 20 | 20 000 | **15 000** |
| P1     | 12 000 | 12 000 | 24 | 24 000 | **12 000** |
| P1.5   | 12 000 | 12 000 | 20 | 20 000 | **12 000** |
| P2     | 10 000 | 10 000 | 24 | 24 000 | **10 000** |
| P2.5   | 10 000 | 10 000 | 20 | 20 000 | **10 000** |
| P3     |  8 000 |  8 000 | 27 | 27 000 | **8 000** |
| P3.5   | 10 000 | 10 000 | 20 | 20 000 | **10 000** |
| P4     | 10 000 | 10 000 | 30 | 30 000 | **10 000** |
| P4.5   | 10 000 | 10 000 | 20 | 20 000 | **10 000** |
| P5     |  5 000 |  5 000 | 17 | 17 000 | **5 000** |
| P5.5   | 12 000 | 12 000 | 20 | 20 000 | **12 000** |

Los 12/12 emiten lo que el laboratorio declara; en 11/12 coincide exactamente y **sólo P0 baja**
de 19 000 a 15 000 ms porque su propia política no aguanta más. El valor declarado no se pierde:
queda publicado en la cabecera como `LAB_NC=`.

## 3. Listas regeneradas (bytes y sha256 medidos)

| fixture | antes (ronda anterior) | ahora, capa 12P apagada | ahora, capa 12P encendida |
|---------|------------------------|-------------------------|---------------------------|
| `mini_15` (15 canales) | 868 821 B · `a9a13c03…` · 14 402 líneas | **929 193 B · `34e93ff3…` · 14 620 líneas** | **936 798 B · `de790969…` · 14 650 líneas** |
| `mini_inherit_6_4K` (6 canales 4K) | 357 365 B · `21a54954…` · 5 528 líneas | **358 335 B · `4da3eff5…` · 5 540 líneas** | **358 335 B · `4da3eff5…` · 5 540 líneas** (idéntica) |

Crecen porque ahora cada canal declara los valores del laboratorio (más líneas `#EXTVLCOPT:`)
y la cabecera publica los 12 perfiles con `LAB_NC=`.

Equivalencia con la capa 12P: en `mini_15`, al encenderla sólo se añaden **2 etiquetas por canal**
(15 × `#EXT-X-APE-BUFFER-POLICY` + 15 × `#EXT-X-APE-INPUT-DEMAND`, 30 líneas); quitándolas y
normalizando los contadores `LINES=`, las dos listas son **idénticas byte a byte**
(14 620 líneas, sha256 normalizado `7f8cf3d6…`). En la fixture 4K las dos son ya idénticas sin
tocar nada (esa ruta del emisor no emite las etiquetas de la capa 12P: cobertura parcial conocida).

## 4. Pruebas

- `npm test`: **11 suites, 710 PASS / 0 FAIL**, exit 0 (incluye las 55 de
  `ape-12p-reconciliation.test.js`, que comprueban perfil a perfil que se emite lo del LAB).
- Runner completo de `frontend/tests`: **43 suites = 38 en verde + las mismas 5 rojas
  preexistentes** (`integration`, `performance`, `proxy-auth`, `rea-6k-lab-provenance`,
  `t13-governor`), sin ninguna roja nueva.
- `ape-cache-buster-guard.test.js`: el token de `index-v4.html` coincide con el sha256 del
  generador (`a8d07a25…`, 983 061 B).

## 5. NO COMPUTADO (dicho claramente)

- **Que un reproductor real no corte: no medido.** Sin tráfico real no se puede demostrar.
  Lo medido es que suelo, objetivo, techo y buffer emitidos salen de la misma fuente (el JSON
  del laboratorio) en los 12 perfiles.
- La página `index-v4.html` **no se ha abierto en un navegador**: todo se midió en sandbox de
  Node con DOM simulado.
- La fixture 4K no ejercita la ruta que emite las etiquetas de la capa 12P (0 etiquetas con el
  flag encendido, sin regresión con el flag apagado).
- Los perfiles «.5» siguen sin existir en `APE_PROFILE_MATRIX` / `APE_PROFILES_CONFIG`: no se ha
  medido qué pinta el Profile Manager para ellos.
