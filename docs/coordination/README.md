# Coordinación — señales para que dos sesiones no se pisen

**Lee esto antes de escribir en el repo, en `Downloads` o en un device.**

Este repo ya tenía un protocolo (`COORDENADAS_SESIONES.md` + `tools/session-guard.js`). Esto **no lo
reemplaza**: documenta las **cuatro capas de señal** que hay que respetar y cubre el hueco que el
protocolo original no veía — los recursos **fuera del repo**.

---

## 1 · Las cuatro capas (ninguna sola basta)

| # | Capa | Artefacto | Quién la ve | Estado |
|---|---|---|---|---|
| 1 | Máquina (repo) | `.session/locks.json` vía `node tools/session-guard.js` | cualquier agente que corra el tool | operativa |
| 2 | Máquina (externos) | `.session/external-claims.json` vía `node tools/coord/external-claim.js` | cualquier agente que corra el tool | **operativa** |
| 3 | Humano | `COORDENADAS_SESIONES.md` (§1 regla de oro, §2 registro, §3 locks, §98 sesión actual) | quien lo lea | operativa |
| 4 | Físico | `<recurso>.APE_LOCK` junto al recurso | quien liste el directorio | **NO operativa** — el sandbox deniega escritura fuera del workspace (`EPERM`). Ver §5. |

Regla dura: **un lock ausente no es permiso; es ausencia de señal.** Si vas a escribir donde no hay
lock, **tú eres quien lo reclama primero** (regla 2 de §1 del ledger).

---

## 2 · Recursos fuera del repo (el hueco que se cerró)

`tools/session-guard.js` resuelve rutas contra el `cwd`, así que **no ve** lo que vive en
`C:\Users\HFRC\Downloads` ni el device ADB. Pero ahí es donde ocurre el trabajo del pipeline y donde
una colisión **corrompe el SSOT**:

| Recurso | Qué es | Por qué una colisión duele |
|---|---|---|
| `lab` | `Downloads\APE_M3U8_LAB_v8_FIXED.xlsm` | **Excel abre el libro en EXCLUSIVA**: dos instancias → `~$` huérfano + corrupción silenciosa (`iptv-excel-safe-mode` regla 1) |
| `lists` | `Downloads\APE_LISTA_*.m3u8` (~300, las nuevas de 1,29 GB) | regenerar mientras otra sesión lee produce lectura truncada; y un `.m3u8` truncado se sube y se sirve |
| `adb` | device por ADB | un `install`/`am start` concurrente reinicia el agente bajo los pies del otro |

### Uso

```bash
node tools/coord/external-claim.js status                  # qué está tomado ahora
node tools/coord/external-claim.js claim lab --task <t> --reason "<por que>" --ttl 90
node tools/coord/external-claim.js check lab lists adb     # exit 1 si ajeno o STALE
node tools/coord/external-claim.js release lab
node tools/coord/external-claim.js heartbeat --note "sigo en hoja 6"
```

Semántica que **no** se puede malinterpretar:

- `writes:false` ⇒ reclamar **NO autoriza a escribir**. Declara intención de lectura y avisa.
- Un TTL vencido **no se renueva solo**: pasa a `STALE` y el tool exige `--force --reason`. Es a
  propósito: un lock fantasma que se auto-renueva bloquea a todos para siempre.
- `claim` sobre algo tomado por otro **falla con exit 1**. No hay reclamo silencioso.

---

## 3 · Estado vivo (2026-11-07/08)

```
lab    TOMADO   desktop-commander@observed  (TTL 240 min)  leyó hoja 6_NIVEL_2_PROFILES
lists  TOMADO   desktop-commander@observed  (TTL 240 min)  escaneó APE_LISTA_*.m3u8
adb    LIBRE                                adb devices = 0 dispositivos
```

Locks del repo (`session-guard.js status`): **ninguno**. Las 3 filas de `COORDENADAS_SESIONES.md` §3
(t44/t45/t47) están **expiradas** — no figuran en `locks.json` y sus heartbeats tienen 8–13 días. Ese
detalle está reconciliado en §98.2. **Si t44/t45 siguen vivas, deben re-reclamar antes de escribir.**

---

## 4 · Protocolo mínimo al entrar

1. `node tools/session-guard.js status` → ¿hay locks del repo?
2. `node tools/coord/external-claim.js status` → ¿hay locks externos?
3. Leer `COORDENADAS_SESIONES.md` §1 y la última sección (§98).
4. Reclamar **solo lo que vas a tocar**, con motivo y TTL. No reclamar "por si acaso".
5. Anunciar cada escritura en el ledger (regla 2) con SHA-256 previo.
6. Liberar al cerrar. Un lock que no se libera es deuda de otro.

**Antes de desplegar al VPS:** `COORDENADAS_SESIONES.md` §4 — fila con hora + 15 min de margen +
`nginx -t` + `php -l` + `luac -p` + rollback escrito. Y la doctrina `iptv-vps-touch-nothing`.

---

## 5 · Limitación declarada, no tapada

El marcador físico (capa 4) **intenta** escribirse junto al recurso y el sandbox lo deniega:

```
EPERM: operation not permitted, open 'C:\Users\HFRC\Downloads\APE_M3U8_LAB_v8_FIXED.xlsm.APE_LOCK'
```

⇒ hoy las señales efectivas son las capas **1, 2 y 3**. Para activar la capa 4, el operador debe
crear el fichero o correr el tool con escritura sobre `Downloads`. **No se reporta como funcionando lo
que no funciona.**

---

## 6 · Cross-references

| Doctrina | Cuándo |
|---|---|
| `iptv-excel-safe-mode` | cualquier COM sobre el `.xlsm` (10 reglas; la 1 es la razón de este documento) |
| `iptv-vps-touch-nothing` | cualquier cambio en `/etc/nginx/`, `/opt/netshield/`, systemd del VPS |
| `iptv-surgical-commit-and-deploy-verify` | antes de `git commit`/`push`/deploy |
| `iptv-omega-no-delete` | nunca purgar funcionalidad existente |
| `COORDENADAS_SESIONES.md` §4 | ventana de deploy al VPS |
| `docs/monitoring/DESKTOP_COMMANDER_ACTIVITY.md` | qué hizo Desktop Commander y por qué no mide el avance de la APK |
