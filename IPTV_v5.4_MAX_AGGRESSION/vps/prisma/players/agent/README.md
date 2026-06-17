# APE Outbound Player Agent (NAT-friendly · sin WireGuard · sin ADB-in)

> **Problema:** el VPS no puede ADB-in a un Fire Stick tras el NAT del ISP (sin WG). `eth0` es
> público pero el device no es alcanzable en `:5555`. **Solución (este módulo):** invertir el
> sentido — un agente vive EN el device y (1) hace el **wake-on-zap LOCAL** y (2) se sincroniza
> con el VPS por **conexión SALIENTE 443** (atraviesa cualquier NAT).

## Componentes

| Archivo | Dónde corre | Rol |
|---|---|---|
| `ape-outbound-agent.sh` | **en el device** (`/data/local/tmp/`) | wake-on-zap local + pull outbound + apply local + QoE |
| `ape-pull.php` (`vps/prisma/api/`) | VPS (PHP-FPM) | endpoint que el agente consulta por comandos (token-auth) |
| `ape-cmd-push.sh` | VPS (operador) | `enroll` token + `push` comando allowlisted a la cola del device |

## Flujo

```
ZAP (cambio de canal en el device)
  └─(local, sin red)→ ape-outbound-agent.sh detecta el zap (dumpsys media_session)
                       → apply_profile_local() : settings/setprop/sysfs LOCALES (China Box, SDR-safe)
                       = "cada zapping = un wake", aunque el VPS/WG estén caídos.

Operador / automatización del VPS quiere forzar reapply o empujar perfil:
  ape-cmd-push.sh push <device_id> apply_profile
     └→ /dev/shm/ape_cmd/<device_id>.jsonl
  device  ──GET 443 (saliente, NAT-friendly)──►  ape-pull.php?device=<id>
            (token va por header  Authorization: Bearer <tok>  → NO en la URL, no se loguea)
     ◄── {"commands":[{"type":"apply_profile"}]}  (deliver-once)
  agente → dispatch_cmd(apply_profile) → apply_profile_local()   (ENUM allowlisted, NUNCA shell)
```

El **VPS nunca entra** al device → no necesita WG ni alcanzar `10.200.0.3`. El device **tira**.

## Instalación (1 sola sesión ADB, desde cualquier host autorizado)

```sh
# 1) En el VPS: enrolar el device (genera token; guarda solo sha256)
bash vps/prisma/players/agent/ape-cmd-push.sh enroll firestick-cali
#    → imprime el TOKEN (cópialo)

# 2) Provisionar el agente + token en el device (1 vez, por ADB):
adb -s <device> push vps/prisma/players/agent/ape-outbound-agent.sh /data/local/tmp/ape-outbound-agent.sh
adb -s <device> shell "printf '%s' '<TOKEN>' > /data/local/tmp/ape-agent.token && chmod 600 /data/local/tmp/ape-agent.token"
adb -s <device> shell "setsid sh /data/local/tmp/ape-outbound-agent.sh </dev/null >/dev/null 2>&1 &"
#    (boot-persistence: relanzar por el watchdog existente / un trigger de arranque)

# 3) Empujar un comando cuando quieras (outbound, sin tocar el device):
bash vps/prisma/players/agent/ape-cmd-push.sh push firestick-cali apply_profile
```

## nginx (rate-limit OBLIGATORIO — ya cableado en snippet)

Usar el snippet versionado `vps/nginx/snippets/prisma-ape-pull-location.conf` (incluye `limit_req`,
`access_log off`, paso del header `Authorization`, y `fastcgi_read_timeout 8s`):

```nginx
# 1) en http{} (nginx.conf), UNA vez:
limit_req_zone $binary_remote_addr zone=ape_pull:1m rate=30r/m;
# 2) dentro del server{} de prisma (443):
include snippets/prisma-ape-pull-location.conf;
```

## Seguridad (canal device↔internet)

- **Token por-device**, enviado por **header `Authorization: Bearer`** (NO en query → no queda en
  `access.log`; `access_log off` además en la location), comparado **constant-time** (`hash_equals`)
  contra `sha256(token)` guardado en `db/ape_agent_tokens/<id>` (el VPS **nunca** guarda el token en
  claro; `chown root:www-data` + `640`). El token on-device va con `chmod 600`. Todo sobre **TLS:443**.
- Los comandos son un **ENUM allowlisted** (`wake|refresh|apply_profile|noop`). El agente los mapea
  a acciones **locales**; **NUNCA** transmite ni ejecuta shell del wire → un VPS comprometido **no**
  da RCE en el device.
- `ape-pull.php` debe ir **detrás de `limit_req`** (anti fuerza-bruta de token) + HTTPS.
- El agente NO mata el player, es idempotente (`get→compare→put`), single-instance, clean-detach.

## Límites honestos

- **Fire OS no es una China box**: los knobs vendor `aisr/aipq/memc/hdr_policy` pueden NO existir en
  un Fire Stick → ahí el lift real lo da **la LISTA** (cascada HEVC `hvc1.2.4`, KODIPROP/EXTVLCOPT)
  + el TV. El agente aplica lo que el device exponga (best-effort) y el wake-local igual dispara.
- Android no trae `curl` por defecto → el sync outbound usa `curl|wget|toybox` (best-effort). Si no
  hay cliente HTTP, **el wake-on-zap LOCAL sigue funcionando** (no depende de la red); solo se omite
  el pull del VPS. Para garantizar el sync, empujar un `curl` estático arm en el install.
- `hdr_policy=1` (SOURCE) es **SDR-safe** (no fuerza HDR en TV SDR); requiere root → `su -c` best-effort.

> Los anchors de playlist son metadata; la instalación y el wake reales requieren ruta VPS desplegada
> y host/dispositivo ADB autorizado o runtime compatible. Las capas China Box/Huawei 4K–8K usan
> intención privada APE y guardas públicas: HDR/4K/8K solo se declaran públicamente cuando el probe,
> la fuente, el transcode y el display lo prueban.
