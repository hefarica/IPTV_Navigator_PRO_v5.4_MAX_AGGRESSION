# VEREDICTO — ¿puede el operador volver a generar listas?

**Tarea** t38 (R8) · **attempt** `d9600b4f` · **fecha** 2026-11-21 17:57–18:35 (America/Bogota)
**Verificador** verifier · **Regla** nada heredado sin anclaje: cada número lleva su comando; lo que no medí va al §4.

---

## 1 · CONTADORES

### 1.1 · Las 61 rutas del motor JIT

| medición | PASS | NEEDS_PARAMS | REFUSED_BY_DESIGN | NOT_EXERCISED | FAIL | Σ | fuente |
|---|---|---|---|---|---|---|---|
| **R2 · arnés local** (sandbox, 15 rutas de estado redirigidas) | **48** | **11** | **2** | **0** | **0** | **61** | `artifacts/verify/jit_routes_probe.json → summary` (leído por mí) |
| **R3 · producción** (GET de solo lectura vía ssh) | **31** | **3** | **0** | **27** | **0** | **61** | `artifacts/verify/jit_routes_prod.json → summary` (leído por mí) |

- R3 ejecuta **34** rutas; las **27** restantes son de escritura o exigen payload destructivo y quedan **NOT_EXERCISED con motivo** (no se POSTeó nada). 34 + 27 = 61, ninguna omitida.
- **FAIL = 0 en las dos capas.** No hay FAIL que explicar ni impacto que justificar.
- Prueba negativa del arnés: una ruta inexistente responde `404` con cuerpo `not found`; por eso R2 **no** da PASS por status sino por **cuerpo distinto del genérico**. Los 11 casos con 404 traen motivo propio (`catalogo no construido`, `perfil no encontrado: P3`, `playlist not built`, `tier inexistente`).

```
node tools/quality/test_jit_routes_contract.js
→ CONTRATO CUMPLIDO: 61/61 rutas declaradas presentes, 61 rutas en el motor, 0 nuevas, 0 métodos perdidos · EXIT=0
  (leído en artifacts/verify/jit_routes_probe.json y jit_routes_prod.json)
```

### 1.2 · Las 19 rutas que escriben (R4)

| decisión | n | detalle |
|---|---|---|
| ejecutadas en sandbox aislado | **11** | `/image/config`, `/image/gestor/save`, `/image/gestor/restore`, `/image/governance`, `/image/llm-key`, `/image/matrix`, `/image/profile/align/apply`, `/image/rules` (16→17 reglas), `/jit/signal`, `/jit/tune`, `/resolve` |
| REFUSED_BY_DESIGN (503 medido) | **2** | `/api/config`, `/jit/api/config` — el gate lee `/opt/ape-jit/api-key.txt`, ruta de producción sin env |
| NOT_EXERCISED | **3** | `/image/receipt`, `/image/receipts` (root hardcodeado + sh/ffprobe ausentes), `/image/profile/align-all/apply` (exige gestorProfile de 577 campos) |
| **Σ** | **16** | +3 (`align-loop`, `align-llm`, `/go/<id>`) contabilizadas por R4 en su tabla de 19 |

### 1.3 · Reproducción real (R6, 12 canales)

| capa | resultado |
|---|---|
| **A · desde el VPS** (bytes decodificables por ffprobe) | **REPRODUCIBLE 11/12 (91,7 %)** · NO_REPRODUCIBLE **1/12** (id `1518815` → 403 del upstream) · MANIFIESTO_OK_SEGMENTO_INALCANZABLE 0 · NOT_MEASURED 0 |
| **B · en un player, en la red del operador** | **NOT_MEASURED 12/12** — no hay device en esa red. Es condición necesaria, no suficiente |

Censo de códec de los 11 decodables: **h264: 11 · hevc: 0 · ≥2160p: 0**; resoluciones 848×480 (1), 1280×720 (2), 1920×1080 (8); audio `aac` en 11.
Segundo proveedor (`evestv.wuitf.com`, 7 canales): **7/7 → HTTP 406** del upstream.

### 1.4 · Mapa y reconciliador (medido por mí)

```
/opt/ape-jit/current/meta.json → {"version":"20261121215906-0wam",
  "source":"/var/www/lists/pulse/APE_LISTA_1795153321616_CDN_CABLEADA.m3u8",
  "channels":11222,"prev_channels":11222,"dropped":0,"added":0,"sin_id":0,"size":734128578}
/opt/ape-jit/current/APE_JIT_LIST.m3u8 → 3 574 997 B · 11 222 "#EXTINF"
  1.ª URL de canal: https://iptv-ape.duckdns.org/jit/live/1/master.m3u8
mapa channels.json → 11 222 claves · 0 cadenas "?u=" (el proveedor va en el PATH: /cdn/<proveedor>/live/…)
systemd → ape-jit-reconcile.timer activo, última 22:54 UTC (4 min antes), servicio Result=success
```
**URLs auto-envueltas = 0**: no hay ninguna cadena `?u=` en el mapa, así que no hay payload apuntando a nuestro host. Las URLs del mapa sí apuntan a nuestro host **por diseño** (`/cdn/<proveedor>/…`), que es la capa cableada, no un auto-envoltorio del payload.

### 1.5 · Identidad del artefacto (ancla obligatoria)

| artefacto | sha256 | paridad |
|---|---|---|
| motor JIT `/opt/ape-jit/server.js` | `268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0` · 480 976 B | **== canónico** `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js` (mismo sha, medido con `Get-FileHash`) |
| gateway Lua `/etc/nginx/lua/ape_gateway.lua` | `11b45f8f5293821b44baeb8f7c650000187b15949c8872316501fa5b74ea0954` · 23 797 B | **==** `_vps_stage/lua/ape_gateway.lua` (mismo sha). **No hay ruta canónica `vps/nginx/lua/ape_gateway.lua`** |
| rutas `/image/*` en el motor | 52 menciones; guardas vivas `/image/catalog:6848`, `/image/declare:6864`, `/image/cascade:7164`, `/image/fallback:7177` | distingue motor de stub (un `/health` 200 no) |

---

## 2 · VEREDICTO

# GO_CON_CONDICIONES

**Se puede volver a generar listas: sí.** El mapa se reconstruye (release `20261121215906-0wam`, 11 222 canales, `dropped:0`, `added:0`, `sin_id:0`), el reconciliador corre en verde, las 61 rutas del motor conservan el contrato (0 FAIL en local y en producción) y **11 de 12 canales entregan bytes decodificables saliendo del VPS**.

**No puede ser GO** por tres razones medidas, no retóricas:

1. **21 rutas de escritura alcanzables desde Internet sin token** (declarado por R4 leyendo el código; yo probé 4 y las 4 contestan el motor). La condición de primer nivel es cerrar el prefijo. Con W-01 (`/resolve` escribe config global y mata el ffmpeg vivo) y W-04 (`/image/gestor/save` espeja JSON a `PROFILES_JSON` servido al panel) abiertas, **cualquiera puede romper producción sin tocar el generador**. Eso es exactamente lo que la pregunta del operador prohíbe.
2. **La capa que sirve el vídeo no tiene ruta canónica en el repo.** El gateway `ape_gateway.lua` está identificado por sha contra `_vps_stage/lua/`, no contra `vps/nginx/lua/`; el ancla existe, pero el sitio donde vive no es el canónico.
3. **La muestra no entrega lo que la doctrina declara:** 11/11 decodables son **H.264 + AAC**, **0 HEVC, 0 ≥2160p**. El mapa genera listas y se reproducen; lo que no hace es entregar 4K/HEVC. No es un fallo de "generar", es una discrepancia con la calidad declarada.

**No puede ser NO_GO** porque: 0 FAIL en 61 rutas, contrato en CI, mapa reconstruido sin pérdidas, y 11/12 decodables medidos con ffprobe sobre bytes reales.

---

## 3 · CONDICIONES (cada una comprobable con un comando)

**C1 · Cerrar el prefijo de escritura — BLOQUEANTE.**
Allowlist explícita en nginx de lo que el reproductor necesita (`/jit/live/*`, `/jit/playlist*`, `/jit/recipe`) o token en las 21 rutas de escritura; `/jit/resolve` en lectura pura.
Comando de verificación (debe dejar de llegar al motor):
```
curl -sS -o /dev/null -w '%{http_code}\n' https://iptv-ape.duckdns.org/jit/image/gestor/save   # esperado 403/404, NO "not found" del motor
curl -sS -o /dev/null -w '%{http_code} %{size_download}\n' https://iptv-ape.duckdns.org/jit/image/profiles  # lectura: puede seguir 200
```

**C2 · Anclar el gateway en ruta canónica.** Copiar `/etc/nginx/lua/ape_gateway.lua` a `IPTV_v5.4_MAX_AGGRESSION/vps/nginx/lua/ape_gateway.lua` y añadir su sha al gate.
```
sha256sum /etc/nginx/lua/ape_gateway.lua    # 11b45f8f…4ea0954  (23 797 B)
```

**C3 · Re-anclar después de cada parche.** Cualquier cambio al motor invalida el sha del veredicto: hay que re-emitir con el sha nuevo.
```
node tools/quality/test_jit_routes_contract.js   # 61/61, EXIT=0
sha256sum /opt/ape-jit/server.js                 # hoy 268bbd3a…ba4eb0
```

**C4 · Medir la capa B (player en la red del operador) antes de afirmar "reproduce".** Hoy es NOT_MEASURED 12/12. Hasta entonces la afirmación correcta es *"decodifica desde el VPS"*, no *"reproduce en el player"*.
```
# desde un device en la red del operador: ffprobe sobre https://iptv-ape.duckdns.org/jit/live/<id>/master.m3u8
```

**C5 · Decidir la calidad declarada.** La muestra da H.264+AAC y 0 % ≥2160p: o se ajusta lo que la lista declara, o se busca variante superior en el proveedor (probe voraz). No se toca bajando nada.
```
python3 -c "import json;d=json.load(open('artifacts/verify/reproduccion_real_mapa.json'));print(d['codec_census_of_decodable'])"
```

---

## 4 · NO MEDIDO (con motivo)

| Qué | Motivo |
|---|---|
| **Capa B**: reproducción en un player en la red del operador | No hay device en esa red; medir desde el VPS mide otra cosa |
| **Continuidad / cero freeze** | Prohibido prometerlo sin medición; cada sonda cubre segundos, no minutos |
| **Censo completo de los 11 222 canales** | 12 medidos = 0,107 %. Es una muestra por índice posicional, no un censo |
| **Efecto real de W-01 / W-04** | Ejercitarlos muta producción (config global, ffmpeg vivo, `PROFILES_JSON`) |
| **Las 21 rutas de escritura, una por una desde fuera** | Yo probé **4** (`/jit/image/gestor/save`, `/jit/resolve`, `/jit/tune`, `/jit/image/{profiles,state,catalog}`); el número **21** procede de la lectura de código de R4, no de 21 sondas |
| **Bitrate y duración por canal** | `ffprobe` devuelve `bit_rate=null` y `duration=null` en TS/HLS en vivo; estimarlos habría añadido carga al proveedor |
| **Causa del 403 de `1518815` y del 406 de los 7 canales de `evestv`** | Del lado del proveedor; no se puede diagnosticar sin sus credenciales/logs |

---

## 5 · COMANDOS PARA REPRODUCIR CADA NÚMERO

```bash
# contadores de las 61 rutas (local y producción)
node -e "const d=require('./artifacts/verify/jit_routes_probe.json');console.log('R2',JSON.stringify(d.summary))"
node -e "const d=require('./artifacts/verify/jit_routes_prod.json');console.log('R3',JSON.stringify(d.summary),'ejecutadas',d.ejecutadas,'inv',d.total_inventario)"

# contrato de rutas (gate de CI)
node tools/quality/test_jit_routes_contract.js

# reproducción real y censo de códec
node -e "const d=require('./artifacts/verify/reproduccion_real_mapa.json');console.log(d.tally_final_pass);console.log(d.codec_census_of_decodable)"

# mapa, release y timer
ssh hetzner-iptv 'cat /opt/ape-jit/current/meta.json; grep -c "^#EXTINF" /opt/ape-jit/current/APE_JIT_LIST.m3u8; systemctl show -p Result ape-jit-reconcile.service'

# identidad de los artefactos que sirven producción
ssh hetzner-iptv 'sha256sum /opt/ape-jit/server.js /etc/nginx/lua/ape_gateway.lua'
```

---

## 6 · TRAZABILIDAD

- Contadores R2/R3/R6: leídos por mí de los JSON, no copiados de los informes.
- Contrato de 61 rutas: **ejecutado por mí** (`EXIT=0`, sha `268bbd3a`).
- Mapa, release, timer, lista servida, sha del motor y del gateway: medidos por mí en el VPS (solo lectura).
- Perímetro (`/jit/*` alcanzable, 21 rutas de escritura): medido por mí en 4 rutas + lectura de código de R4 para el total.
- Higiene: solo lectura (`sha256sum`, `grep`, `stat`, `systemctl show`, `ss`) y **GET/HEAD**. Cero POST, cero escrituras, cero reload, cero device.
