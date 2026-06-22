# APE Buffer Governor v2.0 — Security Model

> **Estado:** F0 (build-only local). Crate Rust compila; `cargo check/test/clippy` VERDE
> (4/4 tests). Bind `127.0.0.1:8090`. El baseline dorado `ape-crystal-rust` (`:8084`,
> `/shield/`) está **CONGELADO E INTACTO**. Nada de esto está en producción: el deploy a
> VPS es F1+ y requiere OK explícito (`CONFIRM=yes`).
>
> **Verdad honesta:** la validación E2E real (`pytest` contra `:8090` vivo + `nginx -t`
> real en OpenResty) es **gate de F1**, no de F0 — requiere Linux/VPS. En Windows, App
> Control impide ejecutar el binario local, así que F0 valida por compilación y revisión
> estática, no por ejecución. Este documento describe el modelo de seguridad **tal como
> está codificado**, distinguiendo lo verificado por build de lo que aún espera F1.

Fuentes (todas en `vps/buffer-governor/`):

| Componente | Archivo | Rol de seguridad |
|---|---|---|
| Rust monolito | `rust/src/main.rs` | Router axum loopback, `SegmentFetcher::classify`, bind `:8090` |
| Contrato | `rust/src/lib.rs` | `enum ErrorClass` (clasificación 401/403/429/5xx) |
| Nginx | `nginx/buffer_governor.conf` | Server de control loopback `:8091`, `allow 127.0.0.0/8; deny all`, sin open proxy |
| systemd | `systemd/ape-buffer-governor.service` | User no-root + hardening sandbox |
| Sniper Lua | `lua/ape_buffer_sniper.lua` | Reporte fire-and-forget a `:8090`, sin token en logs |
| CI/CD | `tools/cicd/deploy_buffer_governor.sh` | 15 gates; F0 termina en gate 8 |

---

## 1. Superficie de red — dos puertos loopback, cero exposición externa

El Governor introduce **dos** sockets, ambos atados a loopback. Ninguno escucha en una
interfaz pública.

| Puerto | Proceso | Bind | Quién habla |
|---|---|---|---|
| `:8090` | Rust (`ape-buffer-governor`) | `127.0.0.1:8090` (hardcoded `SocketAddr::from(([127,0,0,1], 8090))`) | Solo nginx (upstream) y los Lua snipers vía cosocket loopback |
| `:8091` | nginx server de control | `listen 127.0.0.1:8091` | Solo procesos locales (curl de smoke, /metrics scrape) |

- **`:8090` NO es `:8084`.** `:8084` es `ape-crystal-rust`, el motor vivo (baseline dorado).
  El número de puerto está fijado en código (`main.rs:700`), comentado en
  `buffer_governor.conf` y verificado por el deploy gate 9 (`ss -tlnp | grep ":8090 "` debe
  estar **libre**) y gate 10 (`:8084` debe seguir **activo**). Esto cierra el **bloqueo #1**
  (colisión de puerto con el motor vivo).
- El server nginx de control `:8091` añade defensa en profundidad sobre el bind loopback:
  ```nginx
  listen 127.0.0.1:8091;
  allow 127.0.0.0/8;
  deny all;
  ```
  Aunque el bind ya impide tráfico externo, el `allow/deny` es una segunda barrera por si
  alguien lo re-expone por error.
- El Rust `:8090` **no proxia video**. Solo expone endpoints de control/telemetría
  (`/buffer/state`, `/prefetch/*`, `/segment/fetch|probe`, `/live-edge/probe`,
  `/qoe/event`, `/metrics`, `/health`).

---

## 2. SSRF guard — el open proxy fue ELIMINADO, no parcheado (bloqueo #2)

El `buffer_governor.conf` original entregado contenía un patrón **open-proxy / SSRF**:

```nginx
# PATRÓN PELIGROSO (entregado, AHORA ELIMINADO):
proxy_pass http://$arg_upstream_host$uri;
```

Eso permitía a cualquier cliente elegir el upstream vía query string
(`?upstream_host=...`) — un SSRF clásico: el VPS habría buscado cualquier host que el
atacante pusiera, incluyendo IPs internas/metadata de la nube (`169.254.169.254`),
servicios privados (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), o loopback de otros
servicios.

**Cómo se cerró:** la línea fue **borrada por completo**, no mitigada. El Buffer Governor
**no es un proxy de tráfico de video.** La única frontera que toca upstreams sigue siendo
el `shield-location.conf` existente (`/shield/{TOKEN}/{HOST}/{PATH}`), que ya valida y fija
sus propios hosts. El `buffer_governor.conf` solo expone endpoints de control loopback;
no hay `proxy_pass` a un host derivado de input del cliente en ninguna parte del conf.

### SSRF residual en `SegmentFetcher::fetch` — alcance y mitigación de capa

El Rust sí tiene un cliente HTTP (`reqwest`) que puede hacer GET de un `segment_uri`:

```rust
// main.rs — POST /segment/fetch
let uri = body.get("segment_uri").and_then(|u| u.as_str()) ...;
let result = st.fetcher.fetch(&uri).await;   // GET arbitrario al URI dado
```

Honestamente: en F0, `SegmentFetcher::fetch` **no** implementa todavía una allowlist de
host ni un deny de IP privada en el cuerpo del fetcher — fetcha el URI que recibe. Esto es
**aceptable bajo el modelo de despliegue actual y NO reabre el bloqueo #2** por estas
razones de capa:

1. **`:8090` es loopback-only.** El único cliente que puede POST a `/segment/fetch` es
   nginx (vía el sniper Lua) o un proceso local. No es alcanzable desde Internet.
2. **El `segment_uri` que el sniper reporta es `ngx.var.uri`** (el path del shield ya
   resuelto/validado por la frontera `/shield/`), no un host arbitrario controlado por el
   cliente. El sniper extrae channel/stream/variant de la querystring, pero el URI de
   trabajo viene del request ya autenticado por el shield.
3. **Defensa de capa = la frontera `/shield/`.** El host real de upstream lo fija el
   shield-location, no el Governor. El Governor observa y planifica; no elige hosts nuevos.

**Pendiente F1 (recomendado, documentado como deuda):** antes de habilitar
`/segment/fetch` con URIs de fuera del path del shield, añadir en `SegmentFetcher::fetch`
(a) un **deny de IP privada/loopback/link-local** tras resolver DNS (`10/8`, `172.16/12`,
`192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`), y (b) una
**allowlist de hosts del proveedor autorizado**. La política es **deny-by-default**: solo
hosts propios del proveedor autorizado, alineado con la REGLA LEGAL Y ÉTICA (rotar solo
hosts propios del proveedor; 0 evasión ilegal). Hasta entonces, el loopback-bind + la
frontera `/shield/` son la garantía operativa.

---

## 3. Token validation vía `/shield/` — el Governor NO reimplementa auth

El token de autorización vive **exclusivamente** en la frontera `/shield/{TOKEN}/{HOST}/{PATH}`
del baseline dorado. El Buffer Governor **no valida tokens** y **no los necesita**: corre
detrás de esa frontera. Cuando un request llega a las fases Lua del shield, ya pasó la
validación de token del shield-location. El sniper se engancha *dentro* de ese wrapper ya
autenticado:

```
cliente → /shield/{TOKEN}/{HOST}/{PATH}   (shield-location valida TOKEN)
            └─ rewrite/header/body/log_by_lua  (request YA autenticado)
                 └─ ape_buffer_sniper.intercept_request/response()  ← el Governor observa aquí
```

Consecuencias de seguridad:

- **No hay segunda copia del esquema de auth** que pueda divergir o quedar débil. Un único
  punto de verdad: el shield.
- El Governor **no puede ser usado para saltarse el token**: sus endpoints son loopback y
  solo reciben metadata (channel_id, media_sequence, buffer %), nunca emiten contenido al
  cliente.
- El sniper **nunca** reconstruye ni reenvía el `{TOKEN}` a `:8090`. Lo que reporta es
  channel/stream/variant id + el path (`ngx.var.uri`), no el secreto de auth.

---

## 4. 403 clasificado, no oculto (bloqueo #3)

El conf original convertía `403 → 200` de forma **ciega e infinita** (un anti-patrón que
enmascara el bloqueo del proveedor y puede entrar en bucle). Eso fue **eliminado**.

En su lugar, el `SegmentFetcher` **clasifica** el status del upstream según el contrato
`ErrorClass` (`lib.rs`):

```rust
pub enum ErrorClass {
    AuthTokenProblem,    // 401/403 de auth → NO ocultar infinito
    ProviderBlock,       // 403/429 anti-sharing → cooldown
    TemporaryUpstream,   // 5xx/timeout → BLACK/backoff
}

// main.rs — SegmentFetcher::classify
401 => Some(ErrorClass::AuthTokenProblem),
403 | 429 => Some(ErrorClass::ProviderBlock),
500..=599 => Some(ErrorClass::TemporaryUpstream),
_ => None,    // 2xx/3xx → fresco, sin clasificar
```

**INVARIANTE codificado (`main.rs:217`):** *el 403 nunca se convierte en 200 ciego e
infinito*. Verificado por el test `fetcher_classifies_403_as_provider_block_not_hidden`
(parte de los 4/4 verdes):

```
classify(403) == ProviderBlock
classify(401) == AuthTokenProblem
classify(503) == TemporaryUpstream
classify(200) == None
```

El 403 clasificado fluye al `no_repeat_guard`, que decide HOLD/RESYNC/cooldown según la
FSM (un `ProviderBlock` entra en cooldown; un `AuthTokenProblem` no se oculta como éxito).
Esto preserva el **anti-403 4-capas** sin mentirle al pipeline: un bloqueo real del
proveedor se trata como tal, no se disfraza de éxito.

---

## 5. Sin token en logs

Política de logging del Governor:

- **Rust (`:8090`):** los logs (`tracing` nivel INFO) registran `uri` y `error_class` en
  fallos de fetch, pero el `uri` que ve el Rust es el path de segmento del shield, no el
  `{TOKEN}`. No hay `info!`/`warn!` que imprima un token de auth.
- **Sniper Lua:** `ape_buffer_sniper` extrae `channel_id`, `stream_id`, `variant_id` y
  `segment_uri` (`ngx.var.uri`). El `{TOKEN}` es el primer componente del path del shield y
  **deliberadamente no se extrae ni se loguea**. Los `ngx.log(ngx.INFO, ...)` del sniper
  registran solo eventos de conexión al Governor (`connect ... failed`, `send failed`),
  nunca el secreto.
- **nginx control `:8091`:** `/metrics` y `/health` tienen `access_log off` — ni siquiera
  generan línea de acceso, reduciendo la superficie de fuga y el ruido.

> **Nota de capa:** si el shield-location existente escribe el path completo (incluyendo
> `{TOKEN}`) en su propio `access_log`, eso es propiedad del baseline dorado, fuera del
> alcance de este componente. El Governor no añade ninguna nueva ruta de fuga del token.

---

## 6. Hardening systemd

`ape-buffer-governor.service` corre como **servicio loopback de control sin privilegios**:

| Directiva | Valor | Propósito de seguridad |
|---|---|---|
| `User` / `Group` | `ape-auditor` (no-root) | Sin privilegios; un compromiso no es root |
| `NoNewPrivileges` | `true` | Bloquea escalada vía setuid/setgid |
| `ProtectSystem` | `strict` | `/usr`, `/boot`, `/etc` montados read-only |
| `ProtectHome` | `true` | `/home`, `/root` inaccesibles |
| `PrivateTmp` | `true` | `/tmp` aislado por servicio |
| `ReadWritePaths` | `/dev/shm /opt/ape-buffer-governor` | Única escritura permitida (RAMdisk + binario) |

Caps de recursos que también son barrera de disponibilidad (no ahogar nginx ni el Crystal
Engine — FREEZELESS):

| Directiva | Valor | Efecto |
|---|---|---|
| `Nice` / `CPUWeight` | `10` / `30` | Prioridad por debajo de nginx y del motor Crystal |
| `CPUQuota` | `120%` | Techo de CPU (≈1.2 cores) — no monopoliza la caja |
| `MemoryMax` | `256M` | Límite duro de RAM |
| `OOMScoreAdjust` | `600` | **Se mata ANTES** que nginx/Crystal si hay presión de memoria |
| `TasksMax` | `64` | Límite de threads/procesos |
| `Restart` | `on-failure` + `StartLimitBurst=5`/`60s` | Auto-recupera, pero no entra en crash-loop |

El alto `OOMScoreAdjust=600` es intencional: bajo presión de memoria, el kernel sacrifica
el Governor **antes** que el streaming. Pérdida de telemetría > freeze de video.

---

## 7. Resumen — los 3 bloqueos cerrados

| # | Bloqueo (conf entregado) | Riesgo | Cómo se cerró | Verificación |
|---|---|---|---|---|
| 1 | Bind en `:8084` | Colisión con `ape-crystal-rust` (motor vivo) → caída del baseline | Puerto cambiado a `:8090` (hardcoded en Rust, conf y unit) | Deploy gate 9 (`:8090` libre) + gate 10 (`:8084` vivo) |
| 2 | `proxy_pass http://$arg_upstream_host$uri` | Open proxy / SSRF (host elegido por el cliente, alcance a IPs privadas/metadata) | Línea **eliminada**; el Governor no proxia video; única frontera = `/shield/` existente | Revisión del conf (sin `proxy_pass` a host de input); deny de IP privada + allowlist = deuda F1 documentada |
| 3 | `403 → 200` ciego e infinito | Enmascara bloqueo del proveedor, posible bucle | `SegmentFetcher::classify` → `ErrorClass` (Auth/ProviderBlock/Temporary); 403 nunca = 200 ciego | Test `fetcher_classifies_403_as_provider_block_not_hidden` (4/4 verdes) |

---

## 8. Frontera honesta F0 vs F1

| Garantía | Estado en F0 | Qué falta para F1 |
|---|---|---|
| Bind loopback `:8090`/`:8091` | Codificado y revisado | Confirmar con `ss -tlnp` en VPS (gate 9) |
| Open proxy eliminado | Verificado por revisión del conf | `nginx -t` real en OpenResty (gate 8, F1) |
| 403 clasificado | Verificado por unit test (4/4) | E2E `pytest` contra `:8090` vivo (gate 6, F1) |
| Sin token en logs | Verificado por revisión de código | Auditar `access_log` del shield en VPS |
| Hardening systemd | Unit escrito | `systemd-analyze security ape-buffer-governor` en VPS |
| Deny IP privada + allowlist en el fetcher | **No implementado** (loopback + `/shield/` mitigan) | Implementar en `SegmentFetcher::fetch` antes de aceptar URIs externos |

**Línea de fondo:** el modelo de seguridad cierra los 3 bloqueos por arquitectura
(loopback-bind, eliminación del open proxy, clasificación del 403) y por hardening
systemd. La validación dinámica (E2E + `nginx -t`) y el endurecimiento del fetcher
(deny IP privada + allowlist) son **gates de F1** y aún no se han ejecutado, por las
restricciones de plataforma (Windows App Control) y por la disciplina de no tocar prod
sin OK. El baseline dorado (`:8084` / `/shield/`) permanece congelado e intacto.
