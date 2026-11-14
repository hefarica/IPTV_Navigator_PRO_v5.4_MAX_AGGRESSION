# REVISIÓN INDEPENDIENTE — Gate de exclusión mutua del proveedor (t42)

**Fecha:** 2026-11-14 · **Rol:** revisor adversarial (no autor del gate) · **Tarea revisada:** t42
**VPS:** `hetzner-iptv` (ubuntu-2gb-ash-1, 3 vCPU) · **Zona:** `Etc/UTC` · **Solo lectura** salvo estado sintético bajo `/tmp`.
**Prohibiciones respetadas:** `wg0`/`eth0` no tocados · OTT Navigator único player · `configs/app.toml`, `live_exec_policy.rs`, `bundle_builder` no tocados · sin commit · sin deploy.

---

## 0. VEREDICTO

**`needs_revision`.** El gate es un buen *árbitro de política* y un mal *mutex*, y falla abierto en tres estados que no entiende.

| Criterio de aceptación | Resultado |
|---|---|
| Ataque de carrera ejecutado, con nº literal de canaries alcanzado | **2** (lock desligado + ventana TOCTOU de 0,56-0,63 s) y **2** (systemctl roto + lock distinto). **Con el lock intacto: 1** |
| Guard por fecha en ≥5 estados | **11 estados** probados: 6 fail-closed correctos, 3 fail-open, 2 correctos por diseño |
| Tiempo ffmpeg → gate | **medido**: 0,56-0,63 s hasta que la unidad es visible; 587 ms por decisión; flush del log = 0 |
| Zap durante canary | **no mitigado y no declarado** → F-05 |
| "Canary corre siempre" | **falso por construcción** desde el fix: 48 decisiones, **0 ALLOW** |
| Ataques no ejecutados | declarados en §7; bajan la confianza a **media** |

**Confianza del veredicto: MEDIA.** Las 5 familias de ataque se ejecutaron contra los bytes reales del VPS, pero **no** se ejecutó un canary real durante el ataque (habría costado una conexión al proveedor del operador), **no** se pudo medir la latencia real ffmpeg→SYN (no hay canary corriendo: todos los ticks son DENY) y **no** se probó un fallo real de systemd ni un salto de reloj real. Todo lo que sigue son medidas del gate/worker reales con estado sintético, y está dicho cuál es cuál.

---

## 1. Identidad de los bytes revisados (verificada por mí)

| Artefacto | Bytes/Líneas reportadas por t42 | SHA-256 medido por mí |
|---|---|---|
| `/opt/ape-pulse/lib/provider-gate.sh` | 265 L, `f1784354…` | **`f178435421e4dd22ccd97af4a23d84a190f6a3327042af2cb9738316c4a6bcaa`** ✔ coincide |
| `/opt/ape-pulse/ape-pulse-canary-worker.sh` | 150 L, `a13dd676…` | **`a13dd676b028a7b28c5e7b8c25f154bf9c74ed9a534122b199c6df6ebe70ecde`** ✔ coincide |
| `/etc/systemd/system/ape-canary@.service` | — | `TimeoutStartSec=60`, `RuntimeMaxSec=300`, `Restart=on-failure`, `RestartSec=10`, `StartLimitIntervalSec=600`/`Burst=3` en `[Unit]` |

> **Corrección de una lectura propia (stale log):** `journalctl` muestra un warning del **Nov 13 11:18:42** —`Unknown key name 'StartLimitIntervalSec' in section 'Service'`—. **Es histórico**: hoy las líneas 7-8 están en `[Unit]`. No es un hallazgo vigente. Lo dejo escrito para que nadie lo recicle.

---

## 2. ATAQUE 1 — CARRERA

Método: los **bytes reales** de gate y worker, con `PG_*`/`APE_CANARY_*` (costura de test documentada en el propio código) apuntando a estado sintético en `/tmp`, `PG_LOG=/dev/null`. Nada escribe en producción.

| # | Escenario | Comando (resumen) | Salida literal | Lectura |
|---|---|---|---|---|
| 1a | 8 decisiones del gate concurrentes, estado idle | 8× `provider_gate_decide canary` en background | `RACE_A decides=8 allow=8 deny=0` | **El gate NO es un mutex.** Es una consulta de política: 8 de 8 admiten. La exclusión no vive aquí |
| 1b | 2 workers, **lock compartido**, 2 tickets | `wk lockA & ; wk lockA &` | `RACE_B lock_compartido launches=1` | El `flock -n` (`worker:74`) serializa. Correcto |
| 1c | lock desligado (`rm`) **con la unidad ya viva** | `wk lockS1 &` → esperar `UNITFLAG` → `rm lock` → `wk lockS2` | `RACE_F1 lock_desligado_unidad_viva launches=1` | **Defensa en profundidad**: el gate ve la unidad y deniega (`canary_already_live`). El lock no es la única barrera |
| 1d | lock desligado y **2º worker a +50 ms** (antes de que exista la unidad) | `wk lockT1 & ; sleep 0.05 ; rm lock ; wk lockT2` | `RACE_F2 toctou_50ms launches=2` | **2 CANARIES.** La ventana es real |
| 1e | `systemctl` roto + locks distintos | `PG_SYSTEMCTL=/nonexistent` | `RACE_D systemctl_roto_Y_lock_distinto launches=2` + `canary_live=""` y `decision=ALLOW` | **El gate queda ciego y no lo dice** (F-04) |

### 2.1 La ventana TOCTOU, medida

La unidad no existe durante **0,56-0,63 s** desde que el worker arranca:

```
WORKER_RUN1 start_a_unidad_visible_ms=632
WORKER_RUN2 start_a_unidad_visible_ms=558
WORKER_RUN3 start_a_unidad_visible_ms=586
```

Descomposición del coste: `node -e` = **27 ms** (×2 por ticket, `worker:99-100`), una decisión del gate con 28 unidades = **234 ms** (stub) / **587 ms** (real), dos decisiones por tick (`worker:82` y `:118`) → **~0,5-0,6 s** entre el `ALLOW` que autoriza y el momento en que otro revisor podría ver la unidad.

**Consecuencia exacta:** el `flock` es lo único que cubre esa ventana. Y el `flock` es un fichero (`/run/ape-canary.lock`) que se puede **desligar**: `exec 9>"$LOCK"` no verifica identidad de inodo. Si algo lo borra entre dos workers (un `tmpfiles.d`, un `rm` de operador, un `/run` limpiado), los dos trabajan sobre inodos distintos y **se alcanzan 2**.

> **Honestidad sobre el alcance:** sin desligar el lock, **no** conseguí 2. El resultado "2" exige la precondición *lock desligado*. No es un ataque remoto; es un fallo de robustez del mutex. Pero la aceptación dice que si se alcanzan 2 el veredicto no puede ser `pass`, y se alcanzan.

---

## 3. ATAQUE 2 — EL GUARD POR FECHA (11 estados)

Comando por estado: log sintético de una línea + `provider_gate_decide canary`. Salida literal recortada a `decision/reason/age/signal`.

| Estado | Salida | ¿Fail-open o fail-closed? | ¿Correcto? |
|---|---|---|---|
| A. zap hace 10 s | `DENY reason=player_active player_age_s=10 player_signal=zap` | closed | **Sí** |
| B. zap de otro día (24 h) | `ALLOW reason=idle_admit age=86401` | open | **Sí** (nadie juega) |
| **C. zap con fecha futura (+5 h)** | `ALLOW reason=idle_admit **player_age_s=-17999**` | **OPEN** | **NO** — F-03 |
| D. mes inválido (`Novv`) | `DENY reason=player_state_unknown_failclosed age=unknown` | closed | **Sí** |
| **E. log vacío** | `ALLOW reason=idle_admit player_signal=none` | **OPEN** | **NO** — F-02 |
| F2. línea truncada **con** patrón de zap | `DENY reason=player_state_unknown_failclosed` | closed | **Sí** |
| F3. mes malo **con** patrón de zap | `DENY reason=player_state_unknown_failclosed` | closed | **Sí** |
| F4. timestamp vacío `[-]` **con** patrón de zap | `DENY reason=player_state_unknown_failclosed` | closed | **Sí** |
| G. log ausente | `DENY reason=player_state_unknown_failclosed` | closed | **Sí** |
| H. zap de otro mes (30 d) | `ALLOW reason=idle_admit age=2592002` | open | **Sí** |
| I. día 32 | `DENY reason=player_state_unknown_failclosed` | closed | **Sí** |
| J. otro año (2025) | `ALLOW reason=idle_admit age=31540337` | open | **Sí** |
| **K. timestamp con offset `-0500`** | `ALLOW reason=idle_admit **player_age_s=-64062**` | **OPEN** | **NO** — F-03 |

**Corrección de un test propio:** en el primer pase probé "log truncado" con una línea que **no contenía** el patrón de zap; el resultado `ALLOW` era del fixture, no del gate. Repetido con el patrón de zap presente (F2) → `DENY`. Queda corregido y el fixture malo no se usa como evidencia.

**Los tres fail-open, con su disparador real:**
- **Edad negativa** (C, K): el gate exige `age -ge 0` (`gate:217`); si el epoch cae en el futuro **salta la rama de player activo y admite**. Disparadores: salto de reloj hacia atrás (NTP), o `$time_local` no-UTC. **Hoy `TZ=Etc/UTC` y el log sale `+0000`, así que K no ocurre; pero el gate ignora el offset (`$5`) y asume UTC: cambiar la TZ del VPS lo abre en silencio.**
- **Log vacío** (E): `pg_player_last_seen` devuelve `''` = "idle CONOCIDO" (`gate:123`), y `''` no es `ERR`. **Ausencia de evidencia se lee como evidencia de ausencia.** Con `logrotate` `daily` + `create` + `postrotate invoke-rc.d nginx rotate`, si ese `rotate` falla (su salida va a `/dev/null`), el fichero nuevo se queda vacío **para siempre** → el gate admitiría con el operador viendo la tele.

---

## 4. ATAQUE 3 — LATENCIA: ¿cuánto tarda el canary en consumir antes de que el gate lo sepa?

| Medición | Valor | Fuente |
|---|---|---|
| Escritura del zap en el log | **0 ms de buffer** | `sites-enabled/default:56`: `access_log /var/log/nginx/playlist_access.log ape_playlist;` **sin `buffer=` ni `flush=`** |
| Coste de una decisión del gate (real, 28 unidades) | **587 / 422 / 408 / 395 ms** (n=4; dispersión 192 ms) | `provider_gate_decide canary` cronometrado |
| Coste con stub sin unidades | **234 ms** | idem |
| `systemctl list-units` (1 llamada) | **5 ms** | medido |
| `systemctl show` (1 unidad) | **7 ms** × 28 unidades | `gate:151` dentro del bucle |
| `node -e` (2 por ticket) | **27 ms** × 2 | `worker:99-100` |
| Worker arranque → unidad visible | **558 / 586 / 632 ms** (n=3) | harness 1e |

**Conclusión medida:** el gate **no puede** enterarse del zap antes de que exista: el log es unbuffered, así que la señal está en disco al instante y la decisión la ve en la siguiente llamada. **La latencia que importa no es la del zap, es la del canary**: entre el `ALLOW` de `:118` y la unidad visible pasan **0,56-0,63 s**; en esa ventana el gate responde "idle" con verdad —la unidad aún no existe— y es exactamente la ventana que usó el ataque 1d para llegar a 2.

**No medido (y por qué):** el tramo `unidad visible → primer SYN al proveedor` no se midió end-to-end porque exigía lanzar un canary real (consume la única conexión del operador). Cota inferior: los 558-632 ms ya medidos. Esto baja la confianza de este apartado a **media**.

---

## 5. ATAQUE 4 — UN ZAP MIENTRAS EL CANARY YA CORRE

**Hecho:** nada desaloja al canary. `ape-canaryctl` sabe hacer `stop` (`:98-100`) pero **el worker no lo llama en ningún punto**; `grep -n stop` sobre worker y gate: **0 coincidencias**. El worker se limita a esperar (`worker:144`).

**¿Declarado?** El gate declara no poder garantizar: cuota del proveedor, doble conexión del player, `ape-canaryctl` manual, `Restart=on-failure`, y que el latido se emita siempre (`gate:41-48`). **No declara** que un zap durante un canary en curso queda sin dueño resuelto. El worker declara lo mismo (`worker:30-35`).

**Decisión: NO MITIGADO y NO DECLARADO → F-05.** Un canary dura 136-194 s medidos (`CANARY_OK … wall=136s` en el journal; 146-194 s en el incidente). En esa ventana, un zap del operador compite por la única conexión. El gate no miente sobre lo que ve, pero **miente por omisión** sobre lo que no puede hacer.

---

## 6. ATAQUE 5 — ¿PUEDE EL OPERADOR QUEDARSE SIN CANARY PARA SIEMPRE?

**Sí, y de hecho es el estado actual.** No es una hipótesis: es lo que dice la producción.

| Evidencia | Valor |
|---|---|
| Decisiones del gate con el campo `player_signal` (versión vigente) | **48** |
| …de ellas `ALLOW` | **0** |
| Primera decisión con `player_signal` | `2026-11-14T02:00:02Z` |
| Reparto | `player_active` 42 · `canary_already_live` 5 · `idle_admit` 9 (las 9 ALLOW son de la versión **anterior**, sin `player_signal`: `player_age_s=324…484`, el fail-open que t42 llamó H4) |
| Cadencia de señales | zap `z=1` cada ~10 s y latido `okhttp/4.12.0` cada ~31 s (`conviva` 251 líneas, `zap` 604) |
| Canary ejecutado con éxito | 1: `CANARY_OK … 3840x2160 fps=5 cpu_pct=37.80% wall=136s` (01:56:45Z) |

Con `PG_PLAYER_WINDOW=180` y señales cada 10-31 s, **mientras el operador ve la tele el player está siempre activo**; el canary solo corre si el operador deja de ver ≥180 s. La promesa «el canary corre siempre» **no se cumple literalmente, y no puede cumplirse** bajo la escalera que el propio operador pidió (player manda siempre).

**Decisión: es ACEPTABLE como diseño y NO es aceptable como promesa.** El gate hace lo correcto (protege producción); lo que está mal es el contrato verbal: hay que declarar «el canary corre siempre que no pueda molestar», no «siempre». Con la tele encendida, la cuota de diagnóstico es **cero**. Si el diagnóstico es un requisito, necesita una ventana propia (p. ej. `ape-canaryctl start` manual en mantenimiento, que ya está declarado como fuera del gate).

---

## 7. ATAQUES QUE NO SE EJECUTARON (y cómo bajan la confianza)

| Ataque | Por qué no | Efecto en la confianza |
|---|---|---|
| Canary **real** durante la carrera (2 ffmpeg de verdad contra el proveedor) | Consume la única conexión del operador y puede repetir el incidente 461/502 | El "2" es de **admisiones**, no de conexiones simultáneas al proveedor. Baja a **media** |
| Fallo real de `systemctl`/dbus en caliente | No se puede provocar sin tocar systemd de producción | F-04 está demostrado por trayectoria de código + stub, no por fallo real |
| Salto de reloj real (`date -s`) | Prohibido: afecta a todo el VPS | F-03 demostrado con log sintético; el disparador real (NTP) no se forzó |
| Rotación de log fallida | Exigiría romper `logrotate` | F-02 demostrado con log vacío sintético; el camino a "permanente" es documental |
| Zap durante canary con canary real | Igual que el primero | F-05 se sostiene en `grep stop = 0` y en la duración medida, no en una colisión reproducida |

---

## 8. LO QUE SÍ AGUANTA (verificado, no elogio)

Un revisor que solo destruye no sirve. Esto pasó los ataques:

1. **El `flock` serializa de verdad**: 2 workers, 2 tickets, lock compartido → **1** lanzamiento.
2. **El gate es una segunda barrera real**: con el lock desligado y la unidad ya viva → **1** lanzamiento (`canary_already_live`). La observación de unidades, cuando funciona, cierra el hueco.
3. **6 de 11 estados de fecha fallan cerrados** con el mensaje correcto, incluido el que más importa: timestamp truncado **con** patrón de zap → `DENY`.
4. **No hay latencia de buffer en el log**: escritura inmediata. Mi hipótesis de un `flush=5s` era falsa; se refuta con el `access_log` real.
5. **El latido es real y viene del device**: `okhttp/4.12.0` cada ~31 s en el log que el gate lee. La señal del player no depende del navegador.
6. **El fix de H2 es estructuralmente correcto**: `activating` cuenta como vivo (`gate:153`) y hay re-verificación tras `PG_SETTLE` (`gate:254-263`). El agujero de 10 s de `RestartSec` está cubierto por diseño.
7. **`StartLimitIntervalSec=600/Burst=3` en `[Unit]`**: el fusible de reinicios existe y está bien puesto hoy.

---

## 9. FINDINGS

| ID | Sev. | Problema | Fix requerido |
|---|---|---|---|
| **F-01** | **alta** | **TOCTOU de 0,56-0,63 s** entre el `ALLOW` de `worker:118` y la existencia de la unidad; el `flock` es la única cobertura y es un fichero desligable (`exec 9>"$LOCK"` no verifica inodo). Alcanzados **2** canaries con el lock desligado | (a) mutex que no dependa de un path: `systemd-run --unit=ape-canary-mutex` (systemd rechaza el segundo `start` de la misma unidad) o `flock` sobre un **directorio**; (b) tras `$CTL start`, esperar hasta 2 s a que `pg_canary_live_units` la vea y, si no aparece, `ape-canaryctl stop` y DENY |
| **F-02** | **alta** | **Log vacío ⇒ `ALLOW`** (`player_signal=none`). Ausencia de evidencia leída como evidencia de ausencia. Con `logrotate` `create`+`rotate` fallido, el fail-open se vuelve permanente | Tratar `0 líneas` como `unknown` → `DENY`; exigir frescura (`mtime` < `PG_PLAYER_WINDOW`) o un centinela periódico en el log. Escotilla explícita `PG_ALLOW_EMPTY_LOG=1` para instalación nueva |
| **F-03** | **alta** | **Edad negativa ⇒ `ALLOW`** (`gate:217` exige `age -ge 0`). Disparadores: salto de reloj atrás, o `$time_local` no-UTC (el gate ignora el offset `$5` y asume UTC). Medido: `+5h → age=-17999 ALLOW`; `-0500 → age=-64062 ALLOW` | Si `age < -5` → `DENY reason=player_state_unknown_failclosed` (reloj no fiable). Parsear el offset del campo `$5` o forzar `TZ=UTC` en el parseo y verificarlo al arrancar |
| **F-04** | **alta** | **`systemctl` roto ⇒ gate ciego**: `list-units … \|\| true` (`gate:155`) descarta el exit code; si falla, `canary_live=""` y **`ALLOW`** sin señal de error. Medido | Comprobar el exit code: si `list-units` falla → `ERR` → `DENY`. Distinguir "0 unidades" (exit 0, salida vacía) de "consulta rota" (exit ≠ 0) |
| **F-05** | **media** | **Zap durante canary: no mitigado y no declarado.** `grep stop` = 0 en worker y gate; el canary dura 136-194 s y nada lo desaloja. La lista de límites (`gate:41-48`) omite este caso | O se mitiga (en el bucle de espera: si `player_age < PG_PLAYER_WINDOW` y hay canary vivo → `ape-canaryctl stop`), o se declara explícitamente en `gate:41-48`, `worker:30-35` y en el contrato |
| **F-06** | **media** | **«El canary corre siempre» es falso**: 48 decisiones de la versión vigente, **0 ALLOW**; zap cada 10 s + latido cada 31 s mantienen `player_active` indefinidamente. La cuota de diagnóstico con la tele encendida es 0 | Declarar la promesa como «corre siempre que no pueda molestar» y dar una ventana explícita de diagnóstico (mantenimiento/manual), o relajar la escalera **solo** con autorización escrita del operador |
| **F-07** | **media** | **Latencia lineal con el glob de unidades**: 587 ms por decisión a 28 unidades; `pg_canary_live_units` hace **1 `systemctl show` por unidad** (`gate:151`) y el glob crece +1 por canary (28 `failed` ahora, sin `reset-failed` salvo en `stop/rollback`, que el worker nunca llama). A 300 unidades ≈ 2,1 s por decisión ×2 = 4 s de ventana | Una sola llamada: `systemctl show -p ActiveState 'ape-canary@*'` o `list-units --state=active,activating,reloading,deactivating`; y `systemctl reset-failed` tras cada corrida |
| **F-08** | **baja** | `PG_LOG=/var/log/ara/provider-gate.log` **no existe**: `pg_log` solo se llama en el camino de espera agotada (`gate:251,261`), así que un auditor que busque ahí no encuentra **ninguna decisión**. Las decisiones están en `/var/log/ara/canary.log` (worker), no en el log del gate | O registrar cada decisión en `PG_LOG` con rotación, o quitar esa ruta de la cabecera para no prometer un rastro que no existe |

---

## 10. Reproducibilidad

Los dos harness corrieron en `/tmp` del VPS con los bytes reales:

```bash
# estado sintético + overrides documentados en el propio gate/worker
export UNITFLAG=$T/unit.active LAUNCHLOG=$T/launch.log
dec(){ PG_PLAYER_LOG="$1" PG_SYSTEMCTL="$ST" PG_JIT_ROOT="$T/none" PG_LOG=/dev/null PG_SETTLE=1 \
       bash -c '. /opt/ape-pulse/lib/provider-gate.sh; provider_gate_decide canary'; }
# fecha:  A..K  (zap hace 10 s / -24 h / +5 h / mes Novv / vacío / truncado / ausente / -30 d / día 32 / 2025 / -0500)
# carrera: 8 decides & ; wk lockA & wk lockA ; rm lock & wk lockB ; PG_SYSTEMCTL=/nonexistent
```

Salidas literales en §2, §3 y §4. Nada se escribió en rutas de producción (`PG_LOG=/dev/null`), ningún unit se arrancó y ningún fichero de `t42` se modificó: los SHA de §1 son los mismos que reportó t42.

---

## 11. RESPUESTA A LA PREGUNTA DEL CONTRATO

> *¿Garantiza el gate un solo propietario de la conexión del proveedor?*

**No por sí solo.** El gate garantiza que **ningún ticket se admite mientras el estado observable diga que el player manda**; la exclusión la sostiene el `flock` del worker, y esa exclusión se rompe si el lock desaparece (2 alcanzados) o si el gate queda ciego a las unidades (F-04). Además el gate **se abre** en tres estados que no entiende (log vacío, edad negativa, systemctl roto) — justo lo que el enunciado llama el hallazgo más grave posible.

**Con el lock intacto y systemctl sano, el gate aguanta.** Los cinco arreglos de F-01..F-04 lo dejan sin fail-open conocido; F-05 y F-06 son de declaración y de contrato, no de código.
