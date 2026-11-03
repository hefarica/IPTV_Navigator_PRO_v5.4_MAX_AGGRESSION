# 17 · Landing / intent de enrolamiento (Nivel 1, repo-only)

**Estado:** implementado en repo, **NO desplegado**. Cero cambios en VPS/nginx vivo, cero APK instalado, cero commit.
**Archivos:** `vps/landing/index.html` · `vps/landing/player-only/{master,media}.m3u8` + `frame.ts` · `vps/nginx/snippets/ape-landing.conf` (server{}) · `vps/nginx/snippets/ape-landing-map.conf` (http{}) · `vps/landing/_dev/serve_local.py` (dev, NO desplegar).

## 1. Flujo

```
        GET /ape/install            (una sola URL para todos)
                  │
   browser (200 text/html) ────┴──── player (302)
        ▼                                   ▼
 landing/index.html            player-only/master.m3u8 → media.m3u8 → frame.ts
```
Nunca se sirve HTML como vídeo: un player que recibe `text/html` falla el parseo del manifest.

## 2. Por qué son DOS snippets (no es preferencia)

`map` sólo es válido en `http{}`; `location` sólo en `server{}` (manual de nginx). Un archivo mixto **no pasaría `nginx -t`**.
`ape-landing-map.conf` → `http{}` (clasifica `$http_user_agent` en `$ape_ua_class`); `ape-landing.conf` → `server{}` con `location = /ape/install`, `types`, `default_type text/html`, `add_header Cache-Control "no-store" always`.
Mapeo repo→host: `vps/landing/` → `/var/www/html/ape/` (misma raíz que el APK ya publicado: `vps/nginx/snippets/prisma-ara-dist.conf:22`).

## 3. Frame estático (generado, no inventado)

```
ffmpeg -f lavfi -i color=c=0x0b0f17:s=1280x720:r=1:d=2 -vf "drawtext=...'ABRE EN NAVEGADOR'..." -c:v libx264 -profile:v baseline -level 3.1 -pix_fmt yuv420p -g 1 -t 2 -f mpegts frame.ts
```
`ffprobe`: `h264`, `1280x720`, `mpegts`, `duration=1.5`, `size=28200`. `CODECS` se omite en el master: no se declara un codec no verificado.

## 4. Package e intent (sin adornos)

- **Package real = `com.ape.crystalagent`** (`android/ape-crystal-agent/app/build.gradle.kts:26`; `AndroidManifest.xml:3`).
- **`org.ape.companion` NO existe en el repo**: `git grep -n -F 'org.ape' HEAD` → **exit 1, 0 matches**. No se usa: un intent con package inexistente no resuelve. Queda **NOT_RUN**.
- **La app NO declara `scheme="ape"` ni `CATEGORY_BROWSABLE`**: `AndroidManifest.xml:29-33` sólo `MAIN`/`LAUNCHER` + `LEANBACK_LAUNCHER`. El intent **no resuelve** y Android cae en `S.browser_fallback_url` → descarga del APK. **Device: NOT_RUN**.
- Requisitos Android a implementar en la app: `<data android:scheme="ape" android:host="enroll"/>` + `CATEGORY_BROWSABLE`/`CATEGORY_DEFAULT` + `exported="true"`, y **gesto de usuario** (el `href` es un `<a>` real, nunca salto automático).

## 5. Fallback APK

`S.browser_fallback_url` → **`/ara/agent.apk`** ya publicado (`vps/ara/version.json:6`; `prisma-ara-dist.conf:18,22`). En el HTML es relativo y el JS lo vuelve absoluto (`location.origin`) porque Chrome exige URL absoluta; sin JS el enlace sigue válido. Sin dominio hardcodeado.
Menor: `version.json` dice `versionName "2.0.0"` y `build.gradle.kts:30` `1.0.0` (mismo `versionCode 1`, mismo tamaño 34 192 621 B).

## 6. Qué NO hace

- Una `.m3u8` **no instala nada** (RFC 8216 §6.3.1 ignora tags desconocidos); este flujo no lo pretende.
- El intent no instala: como máximo abre la app; sin handler deriva al APK.
- No toca el VPS, no recarga nginx, no publica el APK, no verifica firma.
- Landing sin telemetría ni token: 0 secretos, 0 requests externos.

## 7. Riesgos

| # | Riesgo | Mitigación declarada |
|---|---|---|
| R1 | **Deep link abierto**: cualquier app puede registrar `scheme=ape` y capturar el intent | Verificar package+firma en la app receptora; no transportar secretos en el intent |
| R2 | **Phishing por APK**: fallback fuera de Play; DNS/host alterado sirve otro binario | HTTPS + `sha256` publicado en `version.json` + verificación en la app |
| R3 | **Sideload** (orígenes desconocidos) | Ya documentado en `/ara/install.html` (texto, sin enlaces nuevos) |
| R4 | **UA spoof** (un player envía UA de Chrome y recibe HTML) | Sólo afecta UX: el player falla el manifest; no hay bypass de seguridad |
| R5 | **404 catch-all `^~ /ape/`**: si se despliega en otro path, tapa el endpoint | Snippet tal cual + `nginx -t` y `curl` antes de servir |

## 8. Verificación ejecutada (exit codes reales)

`_dev/serve_local.py` **lee los mismos dos snippets** (patrones UA + `types`) y replica la tabla de decisión:

| Caso | Resultado |
|---|---|
| Chrome Android TV (`Mozilla/5.0 … Chrome/124 …`) | **200** `text/html; charset=utf-8`, `X-APE-Landing: browser` |
| TiviMate / OTT Navigator / VLC | **302** → `/ape/landing/player-only/master.m3u8`, `X-APE-Landing: player` (los 3) |
| Cadena 302 (master → media → frame.ts) | **200** `application/vnd.apple.mpegurl` / **200** idem / **200** `video/mp2t` 28 200 B |
| Traversal `../../index.html` · path ajeno `/ape/secret.txt` | **404** / **404** |
| HTML | 1 sola `<a>`, `rel="noopener noreferrer"`, 0 `href/src` externos, 0 secretos, `package=com.ape.crystalagent` |
| Intent (JS, node) | `intent://enroll#Intent;scheme=ape;package=com.ape.crystalagent;S.browser_fallback_url=https%3A%2F%2F…%2Fara%2Fagent.apk;end` regex OK |
| Lint snippets | llaves 11/11 y 10/10; `map` sólo en el archivo http; 0 rutas internas en líneas activas |

**NOT_RUN declarado:** `nginx -t` y semántica real de `map`/`if`+`return` (no hay binario nginx en Windows ni en WSL de este host); dispositivo (intent, gesto, `BROWSABLE`); descarga/instalación del APK; `org.ape.companion` (no existe).

## 9. Deuda

1. Declarar `<intent-filter>` `ape://enroll` con `BROWSABLE` y verificar emisor (package+firma).
2. `nginx -t` en staging y `curl -A` contra nginx real (hoy sólo la réplica).
3. Prueba en device (Android TV + teléfono): gesto → intent → app.
4. Alinear `versionName` de `version.json` con `build.gradle.kts`.
