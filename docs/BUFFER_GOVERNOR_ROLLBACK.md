# APE Buffer Governor v2.0 — Procedimiento de Rollback

> **Estado al escribir este documento:** F0 = **build-only local**. El crate Rust compila
> (`cargo check/test/clippy` VERDE, 4/4 tests), pero **nada está desplegado en el VPS**. El
> baseline dorado (`ape-crystal-rust` en `:8084`, frontera `/shield/`) está **CONGELADO E INTACTO**.
> Este runbook describe cómo revertir cada fase **una vez que F1+ toque el VPS**. En F0 no hay nada
> que revertir salvo archivos del workspace.

> **VERDAD HONESTA (no negociable):** los gates de E2E real — `pytest test_buffer_governor.py`
> (gate 6, requiere el binario vivo en `:8090`) y `nginx -t` real (gate 8, requiere OpenResty) —
> son **gates de F1**, NO de F0. Corren en **Linux/VPS**. En Windows el **App Control** bloquea
> ejecutar el binario local, así que el E2E **no se puede validar en la máquina de build**. Cualquier
> afirmación de "verde E2E" que no venga del VPS es falsa.

---

## 0. Principios de rollback (cardinales)

1. **El rollback NUNCA frena la reproducción.** Detener el Governor = el tráfico vuelve al passthrough
   del baseline. Un Governor caído debe ser un *no-op*, jamás un freeze.
2. **El rollback es aditivo-inverso.** Cada fase solo AÑADE (un `include`, un `require` no-bloqueante,
   un servicio en `:8090`). Revertir = quitar exactamente eso, en orden inverso, y `reload` (no
   `restart`) de nginx.
3. **El baseline es sagrado.** `:8084` (`ape-crystal-rust`) y la frontera `/shield/{TOKEN}/{HOST}/{PATH}`
   **no se tocan en ningún paso de ningún rollback.** Si un rollback exige tocar `:8084` o `/shield/`,
   el rollback está mal diseñado: **ABORTAR**.
4. **`reload`, no `restart`.** Toda reversión de nginx termina en `nginx -t && nginx -s reload`. Nunca
   `systemctl restart nginx` fuera de ventana de mantenimiento.
5. **Backups primero.** Gate 1 del deploy escribió `.agent/backups/buffer-governor/baseline_<TS>.txt`.
   El `include` de nginx y los wrappers Lua se respaldan **antes** de añadirse; restaurar = `cp` del
   backup + `reload`.

---

## 1. Mapa de fases (qué añade cada una, qué revierte el rollback)

| Fase | Comando deploy | Qué AÑADE al sistema | Qué revierte su rollback |
|------|----------------|----------------------|--------------------------|
| **F0** | `f0-build` | Nada en el VPS. Solo artefactos de build locales (`rust/target/`, binario). | Limpiar workspace (`cargo clean`, `git checkout`). Cero impacto en prod. |
| **F1** | `f1-shadow` (`CONFIRM=yes`) | Binario en `/opt/ape-buffer-governor`, `ape-buffer-governor.service` en `:8090`, server de control en `:8091`. **Shadow:** observa, no influye en `/shield/`. | `systemctl stop+disable ape-buffer-governor`; quitar unit; liberar `:8090`/`:8091`. |
| **F2** | (interno de `f1`→`f3`) | Wrappers Lua `require(...)` enganchados en el `location ~ ^/shield/` ya existente (no-bloqueantes, reportan a `:8090`). | Comentar/quitar los `require(...)`; restaurar el `location /shield/` del backup; `reload`. |
| **F3** | `f3-canary5` (`CONFIRM=yes`) | Canary 5%: el `include buffer_governor.conf` enruta solo canales de prueba al server de control. | Quitar el `include` (o su `if` de canary); `nginx -t`; `reload`. Canales vuelven a passthrough. |
| **F4** | (canary ampliado) | Canary ampliado (p.ej. 25–50%). Mismo `include`, mayor cohorte. | Reducir cohorte al 0% o quitar el `include`; `reload`. |
| **F5** | `f5-full` (`CONFIRM=yes`) | Governor activo para el 100% de canales aptos. | Bajar cohorte a 0% (`include` fuera) → `stop` servicio → `reload`. Vuelta total al baseline. |

> Los nombres de fase del script son `f0-build | f1-shadow | f3-canary5 | f5-full`. F2 y F4 son
> sub-pasos lógicos (Lua-hook y canary-ampliado) dentro de esa progresión. El rollback se describe
> por F1–F5 para cubrir cada superficie tocada.

---

## 2. Rollback por fase (procedimiento exacto)

### F0 — build-only (sin impacto en prod)

No hay nada desplegado. "Rollback" = revertir el workspace.

```bash
cd vps/buffer-governor/rust && cargo clean
git checkout -- vps/buffer-governor/    # descartar cambios locales si procede
# Verificar que el baseline ni se enteró:
ssh ape-vps 'systemctl is-active ape-crystal-rust'   # → active
ssh ape-vps 'ss -tlnp | grep ":8084 "'               # → sigue escuchando
```

Criterio de éxito: `:8084` activo, `:8090`/`:8091` **inexistentes** en el VPS.

---

### F1 — shadow service en `:8090` (rollback)

```bash
# 1) Parar y deshabilitar el servicio (NO toca nginx ni :8084)
ssh ape-vps 'systemctl stop ape-buffer-governor && systemctl disable ape-buffer-governor'

# 2) Confirmar que :8090 y :8091 quedaron libres
ssh ape-vps 'ss -tlnp | grep -E ":8090 |:8091 " || echo "PUERTOS LIBRES OK"'

# 3) (opcional) retirar la unit y el binario
ssh ape-vps 'rm -f /etc/systemd/system/ape-buffer-governor.service && systemctl daemon-reload'
ssh ape-vps 'rm -rf /opt/ape-buffer-governor'

# 4) Verificar baseline intacto
ssh ape-vps 'systemctl is-active ape-crystal-rust && curl -s --max-time 3 http://127.0.0.1:8084/health'
```

En shadow el Governor no influía en el tráfico, así que detenerlo es invisible para los players.
**`/shield/` no se tocó en F1**, por lo que no hay nada que restaurar en nginx.

---

### F2 — wrappers Lua en `/shield/` (rollback)

Los wrappers son `require("ape_buffer_sniper").intercept_response()` (y los otros 5 módulos)
añadidos dentro del `location ~ ^/shield/` **existente**, en fases Lua ya enganchadas. Son
**no-bloqueantes** (reportan a `:8090`, `pcall`-safe, **CERO `ngx.exit`** — invariante respetado).

```bash
# 1) Restaurar el location /shield/ desde el backup tomado antes de F2
ssh ape-vps 'cp /etc/nginx/.backups/shield_location_<TS>.conf /etc/nginx/conf.d/<archivo-shield>.conf'
#    (alternativa quirúrgica: comentar SOLO las líneas require(...) del Governor)

# 2) Validar y recargar (NUNCA restart)
ssh ape-vps 'nginx -t && nginx -s reload'

# 3) Confirmar que /shield/ sirve verbatim igual que el baseline
ssh ape-vps 'curl -sI --max-time 5 "http://127.0.0.1/shield/<TOKEN>/<HOST>/<PATH>.m3u8" | head -5'
```

Como los wrappers eran `pcall`-safe, quitarlos no cambia el byte servido. El rollback aquí es
**reversión de hooks**, no de lógica de stream.

---

### F3 / F4 — canary (rollback)

El canary se activa con el `include` de `buffer_governor.conf` (server de control en `:8091`) más
una regla que enruta solo la cohorte de prueba.

```bash
# 1) Sacar el include (o poner la cohorte canary a 0%)
ssh ape-vps 'sed -i "/include .*buffer_governor.conf;/d" /etc/nginx/nginx.conf'   # o el snippet que lo incluye

# 2) Validar + reload
ssh ape-vps 'nginx -t && nginx -s reload'

# 3) Confirmar que la cohorte volvió a passthrough del baseline
ssh ape-vps 'curl -s --max-time 3 http://127.0.0.1:8091/buffer/state'   # debe dejar de recibir tráfico de canary
```

El server de control vive en `:8091` y **no sirve video ni toca `/shield/`** (solo endpoints de
control loopback). Quitar el `include` desconecta el canary sin afectar a los canales no-canary.

---

### F5 — 100% (rollback completo a baseline)

Orden inverso estricto: **cohorte → include → Lua hooks → servicio**.

```bash
# 1) Cohorte al 0% (o quitar el include del canary/full)
ssh ape-vps 'sed -i "/include .*buffer_governor.conf;/d" /etc/nginx/nginx.conf'

# 2) Quitar wrappers Lua del location /shield/ (restaurar backup F2)
ssh ape-vps 'cp /etc/nginx/.backups/shield_location_<TS>.conf /etc/nginx/conf.d/<archivo-shield>.conf'

# 3) nginx -t + reload (todo el tráfico vuelve a passthrough del baseline)
ssh ape-vps 'nginx -t && nginx -s reload'

# 4) Parar y deshabilitar el servicio Rust
ssh ape-vps 'systemctl stop ape-buffer-governor && systemctl disable ape-buffer-governor'

# 5) Verificación final de baseline
ssh ape-vps 'systemctl is-active ape-crystal-rust'                    # active
ssh ape-vps 'ss -tlnp | grep ":8084 "'                               # baseline escuchando
ssh ape-vps 'ss -tlnp | grep -E ":8090 |:8091 " || echo "GOV OFF OK"' # Governor fuera
```

---

## 3. Criterios de ROLLBACK AUTOMÁTICO

Durante canary (F3/F4) y full (F5) se vigila al Governor frente al baseline. **Si CUALQUIER condición
se cumple, el rollback automático se dispara** (parar servicio + revertir `include` + `reload`). El
gate 15 del deploy deja el rollback "listo"; el watcher de canary (gate 14) lo arma.

| # | Señal | Métrica/fuente | Umbral disparo | Acción |
|---|-------|----------------|----------------|--------|
| 1 | **Rebuffer ↑** | `rebuffer_count` (QoeIngest, `/qoe/event` + `/buffer/report`) vs baseline | rebuffer de la cohorte Governor **> baseline** (cualquier subida sostenida) | rollback inmediato |
| 2 | **duplicate_blocks > 0** | contador de bloques/segmentos repetidos (no-repeat ledger: `media_seq`/`uri`/`hash`/`PDT`) | **> 0** (CERO tolerancia — repetir video viejo viola la regla madre) | rollback inmediato |
| 3 | **5xx ↑** | tasa de `5xx` en el `location /shield/` (nginx access log / `/metrics`) | tasa de la cohorte **> baseline** | rollback inmediato |
| 4 | **buffer < 50%** | `buffer_avg` / health de buffer de la cohorte | **buffer medio < 50%** del objetivo (rompe la jerarquía `buffer>50%`) | rollback inmediato |

> Regla madre que estos umbrales protegen: **un buffer bajo NO se resuelve repitiendo video viejo.**
> Jerarquía de decisión del FSM: **continuidad > fresco > buffer>50% > calidad > procesamiento.**
> `duplicate_blocks > 0` y `buffer < 50%` atacan directamente esa jerarquía → cero tolerancia.

**Comando de rollback automático (lo que arma el gate 14/15):**

```bash
# Disparado por el watcher de canary cuando cualquier umbral se cruza
systemctl stop ape-buffer-governor \
  && sed -i '/include .*buffer_governor.conf;/d' /etc/nginx/nginx.conf \
  && nginx -t \
  && nginx -s reload
```

El watcher compara la cohorte Governor contra el baseline en ventanas cortas; ante duda, **revierte**
(la jerarquía premia continuidad sobre cualquier ganancia de calidad/proceso).

---

## 4. Restaurar el baseline (procedimiento de confianza)

Independiente de la fase, el "estado dorado" se restaura así:

```bash
# 1) Governor fuera
ssh ape-vps 'systemctl stop ape-buffer-governor 2>/dev/null; systemctl disable ape-buffer-governor 2>/dev/null'

# 2) nginx sin el include del Governor + sin wrappers Lua (restaurar backups)
ssh ape-vps 'sed -i "/include .*buffer_governor.conf;/d" /etc/nginx/nginx.conf'
ssh ape-vps 'cp /etc/nginx/.backups/shield_location_<TS>.conf /etc/nginx/conf.d/<archivo-shield>.conf'
ssh ape-vps 'nginx -t && nginx -s reload'

# 3) Baseline marker (gate 1) como referencia del estado congelado
cat .agent/backups/buffer-governor/baseline_<TS>.txt
#   → "baseline frozen @ <TS> — :8084 ape-crystal-rust untouched"
```

---

## 5. Confirmación post-rollback: `/shield/` y `:8084` INTACTOS

**No declarar rollback completo hasta que los 4 checks pasen.**

```bash
# A) El motor Crystal baseline sigue vivo y escuchando en :8084
ssh ape-vps 'systemctl is-active ape-crystal-rust'          # → active
ssh ape-vps 'ss -tlnp | grep ":8084 "'                      # → escuchando

# B) El Governor está FUERA (puertos liberados)
ssh ape-vps 'ss -tlnp | grep -E ":8090 |:8091 " || echo "GOVERNOR OFF — OK"'

# C) La frontera /shield/ responde verbatim como el baseline
ssh ape-vps 'curl -sI --max-time 5 "http://127.0.0.1/shield/<TOKEN>/<HOST>/<PATH>.m3u8" | head -5'
#   → 200/302 esperado; cabeceras = baseline (sin headers añadidos por el Governor)

# D) nginx config válida tras la reversión
ssh ape-vps 'nginx -t'                                      # → syntax is ok / test is successful
```

### Checklist de cierre

- [ ] `ape-crystal-rust` (`:8084`) **active** y escuchando — baseline dorado intacto.
- [ ] `/shield/{TOKEN}/{HOST}/{PATH}` sirve verbatim, sin headers ni latencia del Governor.
- [ ] `:8090` (Rust Governor) y `:8091` (control loopback) **fuera** del VPS.
- [ ] `nginx -t` OK y se hizo `reload` (no `restart`).
- [ ] Ningún `ngx.exit` ni circuit-breaker añadido (invariante AUTOPISTA respetado).
- [ ] Marker de baseline (`baseline_<TS>.txt`) coincide con el estado restaurado.

---

## 6. Lo que el rollback NUNCA hace

- **Nunca** detiene, reinicia ni reconfigura `ape-crystal-rust` (`:8084`).
- **Nunca** reescribe URLs internas de `/shield/` (SHIELDED = filename-only; las URLs internas son
  directas al proveedor).
- **Nunca** introduce un `ngx.exit(503)` ni un circuit-breaker (VPS NET SHIELD = passthrough).
- **Nunca** baja `proxy_read_timeout` ni mete `keepalive` en upstreams Xtream.
- **Nunca** elimina canales para "recuperar" buffer (NO CHANNEL LOSS).
- **Nunca** usa `systemctl restart nginx` fuera de ventana — siempre `nginx -t && nginx -s reload`.

---

## Anexo — Inventario de superficies que un rollback puede tocar

| Superficie | Ruta | Acción de rollback |
|------------|------|--------------------|
| Servicio Rust | `ape-buffer-governor.service` → `:8090` (`/opt/ape-buffer-governor`) | `stop`+`disable`, retirar unit |
| Server de control | nginx `server { listen 127.0.0.1:8091; }` (en `buffer_governor.conf`) | quitar el `include` |
| Upstream | `upstream ape_buffer_governor { server 127.0.0.1:8090; }` | quitar el `include` |
| Wrappers Lua | 6 módulos (`ape_buffer_sniper`, `ape_prefetch_planner`, `ape_segment_pattern_learner`, `ape_live_edge_resync`, `ape_no_repeat_guard`, `ape_variant_escape`) en `location ~ ^/shield/` | restaurar backup del `location /shield/` |
| Backups | `.agent/backups/buffer-governor/baseline_<TS>.txt` (workspace) + `/etc/nginx/.backups/shield_location_<TS>.conf` (VPS) | fuente de verdad para restaurar |
| Baseline (NO TOCAR) | `ape-crystal-rust` `:8084` + frontera `/shield/` | verificar que sobrevivió, nada más |

> Reemplazar `<TS>`, `<TOKEN>`, `<HOST>`, `<PATH>`, `<archivo-shield>` y el alias `ape-vps` por los
> valores reales del despliegue. Los puertos `:8084` (baseline), `:8090` (Governor) y `:8091`
> (control) son fijos por diseño.
