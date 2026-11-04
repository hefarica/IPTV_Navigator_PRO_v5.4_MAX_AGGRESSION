# Zapping-Canary-Resolve — análisis y plan corregido

**Fecha:** 2026-11-04
**Estado:** ANÁLISIS. Nada desplegado. Producción intacta.
**Motivo:** el operador ordenó «deja todo como estaba» tras un intento de implementación que rompió el endpoint. Este documento recoge lo aprendido para que el siguiente intento no repita los mismos errores.

---

## 1 · Lo que se intentó, y por qué falló

Se escribió `canary-resolve.php` (435 líneas) y se desplegó al VPS **sin ejecutarlo nunca**. Secuencia real:

| Paso | Qué pasó |
|---|---|
| 1 | Se creó el fichero y se desplegó. Devolvió `302` |
| 2 | Se interpretó el 302 como «funciona». **Era el fallback porque el canary no existe** |
| 3 | Se añadió diagnóstico. Devolvió vacío |
| 4 | Se movió el diagnóstico. Devolvió `500` |
| 5 | Se movió otra vez. **El endpoint normal pasó a 500** |
| 6 | Revert total: 4 commits + limpieza del huérfano en el VPS |

**Error de método, no de código:** se usó el VPS de producción como banco de pruebas para un fichero nuevo que nunca se había ejecutado.

**Errores concretos de código, todos detectables antes de desplegar:**
- El diagnóstico usaba `CTL` y `CANARY_ROOT` **antes** de que se definieran las constantes → `Undefined constant` → 500
- El diagnóstico se colocó **después** de la validación de `$u`, así que nunca se alcanzaba
- Se confió en un validador propio de paréntesis que dio **tres falsos positivos** (comentarios `// 1)`, regex `'#^https?://#i'` con `//` dentro, `foreach ([` multilínea)

**Lección:** `php -l` en el CI detectó que la sintaxis era válida. **No detectó el orden de las constantes, porque es un error de runtime.** Un fichero nuevo necesita ejecutarse, no sólo lintearse.

---

## 2 · El diseño recibido no es implementable tal cual

Verificado contra el repositorio y el VPS:

| El diseño asume | Realidad medida |
|---|---|
| `Binario /opt/ara/canary/bin/ape-canary --daemon --port 9000` | **No existe.** El canary real es `ape-visual-emulate.sh`, invocado por `ape-canaryctl` dentro del unit `ape-canary@<id>.service`. Es **one-shot**, no daemon |
| `Clases CanaryClient.php, ResolveEngine.php, CacheManager.php` | **No existen** en el repo |
| `Redis` para persistencia y caché | **No instalado** en el VPS de IPTV |
| `206 Partial Content` sobre el manifiesto | **Imposible**: un manifiesto generado on-the-fly no tiene fichero que trocear. El 206 sólo es físico sobre la lista estática de `/lists/` |
| `HTTP/2 keep-alive` desde el player | Depende del player, no del VPS. OTT/TiviMate/ExoPlayer abren y cierran según su política |

**Además, el script `canary-resolve-perfect-loop.sh` contiene acciones que violan la doctrina del repo:**

- `iptables -A INPUT -p tcp --dport 9000 -j DROP` → mutación de firewall sin autorización (`iptv-vps-touch-nothing`)
- Instalación de `fail2ban` y escritura en `/etc/fail2ban/jail.local` → no autorizado
- `while true` externo + `Restart=always` + `StartLimitBurst` → dos mecanismos de reintento en conflicto
- `$_ENV['APE_SECRET'] ?? 'default'` → secreto por defecto hardcodeado (viola no-hardcode)
- `cp /root/ape-deploy-force-v2-*/canary/ape-canary` → dependencia de un directorio que probablemente no existe

---

## 3 · Lo que SÍ existe, y la interfaz real

```
ape-canaryctl start  <id> --from-list <playlist[.gz]> [--seconds N]
ape-canaryctl start  <id> --source-url <url>          [--seconds N]
ape-canaryctl status <id>
ape-canaryctl stop   <id>
ape-canaryctl rollback <id>
ape-canaryctl logs   <id>

unit   : ape-canary@<id>.service
env    : /etc/ara/canary/<id>.env   (debe definir CANARY_SOURCE_URL)
salida : /var/lib/ara/canary/<id>/status.json
límites: RuntimeMaxSec=300, Restart=no, CPUQuota=40%, MemoryMax=1G
pre    : ExecStartPre=/usr/local/bin/ara-skill check --for-canary
```

**Estado actual del canary en el VPS (del diagnóstico previo del operador):**
- `/var/lib/ara/canary/` vacío — **nunca ha corrido**
- `/etc/ara/canary/` vacío — **sin `env.common` ni `<id>.env`**
- `ape-canary@` **disabled**, sin instancia
- `/var/log/ara/` no existe

**⇒ El canary es inarrancable tal como está: sin `<id>.env` el script muere con `CANARY_FAIL: falta CANARY_SOURCE_URL`.**

---

## 4 · Diseño corregido, sobre lo que existe

```
player pide canal
  → canary-resolve.php?u=<origen>&d=<device_b64>
  → ¿hay status.json fresco (<300s) para este canal?
      SÍ → usar lo medido
      NO → invocar: ape-canaryctl start r<hash> --source-url <u> --seconds 6
           → esperar status.json (máx 12s)
           → cachear en disco /var/cache/ara/resolve/
  → resolver: perfil = min(techo del device, resolución MEDIDA)
  → componer cartucho con bitrate/resolución/fps REALES
  → responder
```

**Códigos de respuesta — sólo los que son ciertos:**
- **200** manifiesto generado (siempre; no hay fichero que trocear)
- **206** SÓLO si se sirve la lista estática de `/lists/` con `Range`
- **302** fallback al origen cuando el canary no puede medir

**Persistencia sin Redis:** ficheros JSON en `/var/cache/ara/resolve/<sha1>.json` con TTL. `file_put_contents(..., LOCK_EX)` es suficiente para este volumen.

**Wake-up sin daemon:** no hace falta un proceso permanente. `ape-canaryctl start` es idempotente por id; si ya hay una medición fresca, el endpoint no lo invoca. Un `systemd` timer cada 60 s puede mantener caliente el canal en uso, pero **no es requisito**.

---

## 5 · Plan de validación antes de tocar producción

**Regla que este documento impone:** ningún fichero nuevo llega al VPS sin haberse ejecutado antes.

1. **Comprobar que `ape-canaryctl` existe** en el VPS:
   `curl .../canary-resolve.php?diag=1` (modo lectura, sin invocar el canary)
2. **Crear el `<id>.env`** que falta:
   `/etc/ara/canary/<id>.env` con `CANARY_SOURCE_URL=<url de prueba>`
   Sin esto, el canary muere y no hay nada que medir.
3. **Ejecutar el canary a mano una vez** y verificar que produce `status.json`:
   `ape-canaryctl start test --source-url <url> --seconds 6 && cat /var/lib/ara/canary/test/status.json`
4. **Sólo si el paso 3 produce un `status.json` válido**, escribir el endpoint.
5. **Probar el endpoint contra ese `status.json` ya existente** (sin invocar el canary desde PHP). Eso aísla el PHP del canary.
6. **Sólo entonces** conectar la invocación desde PHP.
7. Desplegar con el gate `php -l` que ya existe en el workflow.

**Cada paso es verificable de forma independiente.** El intento fallido saltó del 1 al 7.

---

## 6 · Lo que este documento NO resuelve

- **No crea el `<id>.env`.** Requiere decidir qué URL de prueba usar y con qué credenciales.
- **No verifica que `ape-visual-emulate.sh` funcione.** Eso exige ejecutarlo, con ffmpeg y ~6 s de captura.
- **No mide CPU/RAM reales** del canary con 3 vCPU.
- **No toca `/lists/`, `/sync`, `/ara` ni el catálogo global.**
- **No despliega nada.**

---

## 7 · Estado de producción al escribir esto

```
url2-cartridge    : 200
/url2/canal.m3u8  : 200
ape-parity-tags   : 200
canary-resolve    : 404  (retirado)
```

**Commit del revert:** `15c62a80` + `0065598b` (limpieza del huérfano).
**El fichero `canary-resolve.php` no existe en el repo.**
