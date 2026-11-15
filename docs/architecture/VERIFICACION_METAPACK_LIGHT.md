# VERIFICACIÓN — Metapack LIGHT (plantillas de perfil en cabecera + `mp` por canal)

**Rama:** `deploy/engine-restart-20261112` · **HEAD:** `3e3554e3cb02a28aec7ef46861627e51c29df077`
**Medido:** 2026-11-15 09:22-09:35 UTC en el VPS `178.156.147.234` y local (`node v24.12.0` / VPS `v20.20.0`).
**Verificador:** subagente `[verificar]`. **Único fichero escrito en el repo:** este documento.

> **Alcance.** Verifica (a) que la lista con plantillas reconstruye cualquier canal y (b) que sigue
> servible y compatible. **No** reemplaza la lista servida; no toca `m3u8-typed-arrays-ultimate.js`
> ni `ape-profiles-config.js`; no escribe en `/var/www/lists`.

---

## 0 · Veredicto

| Dimensión | Resultado |
|---|---|
| **Reconstrucción** | **VERIFICADA** — 22.190.137 líneas, **0 distintas**, contra los bytes del origen (§3) |
| **Servibilidad de la lista actual** | **PASS** — HTTP 200, 4.023.576 B, gate PASS 10/10 (§6) |
| **Compatibilidad de contenido con OTT** | **PASS fuerte** — `EXTINF`/`EXTHTTP`/`URL` idénticas en los 21.224 canales (§5) |
| **Adoptabilidad HOY** | **NO ADOPTABLE** — dos bloqueos medidos (§7) |

**Razón principal, determinista y reproducible:** el chequeo `proyeccion` del gate exige
**cero líneas `#EXT-X-APE-`** en la lista servida, y el metapack añade **10** por diseño. Apuntando el
gate al artefacto nuevo → **FAIL 9/10, exit 1**. Bajo la regla dura vigente («no se reemplaza … hasta
que el gate pase»), la lista nueva **no** satisface la condición. Esto no es una opinión de riesgo:
es un comando y su salida (§7.1).

---

## 1 · Gates de sintaxis

| # | Comando | Exit | Salida |
|---|---|---|---|
| 1a | `node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js` | **0** | *(sin salida)* |
| 1b | `node -c tools/quality/test_ape_profile_light.js` | **0** | *(sin salida)* |
| 1c | `node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-classifier.js` *(adicional)* | **0** | *(sin salida)* |

---

## 2 · Suite de calidad y auditoría de su código

**Comando:** `node --max-old-space-size=4096 tools/quality/test_ape_profile_light.js` → **exit 0**, **19/19 PASS**

```
[PASS] fixture alineado (mismo numero de canales en servida y origen)  — 600 canales
[PASS] light exit 0 con autoverificacion  — canales=600 formas=12 parche_medio=5.13
[PASS] cabecera: 1 indice #EXT-X-APE-PROFILE-INDEX  — 1 lineas
[PASS] cabecera: 1 plantilla por par declarado  — 5 plantillas / 5 pares
[PASS] plantillas: gzip+base64 legible y sha256 == indice  — P1+T8 P1+T9 P3+T5 P3+T6 P3+T7
[PASS] cada canal conserva su #EXTSHIMOTT (1 por canal)  — 600/600
[PASS] cada #EXTSHIMOTT lleva mp {p,v,n}  — 600/600
[PASS] los campos previos del shim se conservan (ver,id,v,hdr,tgt)  — 600/600
[PASS] EXTINF/EXTHTTP/URL de la lista servida intactos por canal  — 600/600
[PASS] verify-light exit 0 (reconstruccion completa del fixture)  — canales=600 lineas=627045 distintas=0
[PASS] OTT: #EXTM3U en la linea 1
[PASS] OTT: un #EXTINF, una URL y un #EXTSHIMOTT por canal  — extinf=600 urls=600 shimott=600
[PASS] OTT: cero lineas #EXT-X-APE- fuera de la cabecera  — 0
[PASS] NEGATIVO: plantilla corrupta -> verify-light 5  — exit 5
[PASS] NEGATIVO: valor corrupto en mp.n -> verify-light 5  — exit 5
[PASS] NEGATIVO: origen inexistente -> light != 0  — exit 5
[PASS] NEGATIVO: destino en /var/www/lists -> light 3  — exit 3
[PASS] idempotente: misma entrada -> mismo sha256  — 3b6561f0… vs 3b6561f0…
[PASS] --limit: parcial y NO verificado  — canales=25 truncado=true verificado=null
[SKIP] reconstruccion de 1/100/21000 sobre las listas completas: requiere --full
RESUMEN: 19/19 PASS
```

### 2.1 ¿La prueba reconstruye líneas o sólo cuenta tags? — **Reconstruye. Auditado en código.**

Leídos `tools/quality/test_ape_profile_light.js` (414 líneas) y `verifyLight` en
`ape-profile-project.js:1826-1976`.

| Qué se exige | Dónde (código) | Por qué no es un contador de tags |
|---|---|---|
| Reconstrucción **línea por línea** contra el **origen** | `ape-profile-project.js:1924-1937` → `for (let i = 0; i < bo.length; i++) … expected = lightRenderCompiled(...); … if (expected !== bo[i]) bad++` | Se re-renderiza cada línea del canal y se compara con la del fichero de 1,29 GB |
| El veredicto depende del conteo | `:1957-1963` → `ok: mismatches === 0 && ott.ape_fuera_cabecera === 0 && …` | Un solo byte distinto ⇒ `ok:false` |
| Patrón de oro = origen, no la propia salida | `:1878`, `:1933` | No se compara la lista contra sí misma |
| El comparador está **vivo** | `test:337-367` | Corrompe una plantilla y un `mp.n`; **falla con exit 5**. Un mero contador de tags no detectaría un nonce alterado |

**Dos límites honestos (no fallos):**

1. En la rama sin `--full` la prueba asevera `v1.json.ok === true`, **no** el contador crudo
   `lineas_distintas === 0`; la equivalencia es **transitiva** por `ok = mismatches === 0 && …`. El
   contador sólo se asevera explícitamente con `--full` (`test:403-404`).
2. El fixture son 600 canales y cubre **5 de 9 pares**, **sin ningún canal P4 ni P5**. Por eso §3 y §4
   se ejecutaron sobre las **listas reales completas**, no sobre el fixture.

---

## 3 · Generación propia sobre copia + 3 comparaciones de expansión (P1 / P3 / P4)

**Generación** (VPS, destino fuera de `/var/www/lists`):

```
node --max-old-space-size=2600 ape-profile-project.js light \
  /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8 \
  /root/metapack-verify/out_full.m3u8 \
  --origin /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8 \
  --gz --report /root/metapack-verify/report.json
```
→ `{"ok":true,"verificado":true,"canales":21224,"formas":40,"parche_medio_lineas":5.33,
"bytes_out":241369227,"bytes_out_gz":13679788,
"sha256_out":"5417fa0357abddc023da7849a5fd16d0594a8ef8842da8de4f3b09746b0b114e",
"sha256_out_gz":"0cd24aa4f6a5f816d8d7902356e0eeee92f12ae777673db07d974927510b95be",
"truncado_por_limite":false,"ms":85109}` · autoverificación interna `lineas:22190137, lineas_distintas:0`.

> La autoverificación del tool **no se usa como prueba**. Las comparaciones de abajo salen de un
> **reconstructor independiente** escrito para esta tarea (`indep-verify.js`), que **no importa**
> `ape-profile-project.js`, reimplementa el formato y **compara contra los bytes crudos del bloque en
> el fichero origen**.

**Comando:** `node indep-verify.js out_full.m3u8 …_CABLEADA.m3u8 --full --pick P1,P3,P4`
**Global: `ok:true` · `canales:21224` · `lineas_verificadas:22190137` · `lineas_distintas:0` ·
`canales_distintos:0` · `canales_sin_mp:0` · `problems:[]` · `ms:15965`**
*(artefacto: `/root/metapack-verify/indep_full.json`)*

| Perfil | Ordinal | Par | Variante | Líneas | Distintas | `sha256` reconstruido | `sha256` bytes del origen | ¿Igual? |
|---|---|---|---|---|---|---|---|---|
| **P1** | 22 | `P1+T9` | 1 / 3 | **1.041** | **0** | `01f3310ad9733862fba18a8fac38ad1a0b845442c99a10c2083e8999792df9e5` | `01f3310ad9733862fba18a8fac38ad1a0b845442c99a10c2083e8999792df9e5` | **SÍ** |
| **P3** | 1 | `P3+T7` | 0 / 5 | **1.044** | **0** | `26f9c2bcffc2813d7f58e963c89da6a68eb2a8feaa4ab764285f6cda2189c2fe` | `26f9c2bcffc2813d7f58e963c89da6a68eb2a8feaa4ab764285f6cda2189c2fe` | **SÍ** |
| **P4** | 14.568 | `P4+T5` | 2 / 5 | **1.047** | **0** | `5644e3e7149ea4d939ae64ae4e52f1edb8e2571768dff9901b7c05b6ebffd3e0` | `5644e3e7149ea4d939ae64ae4e52f1edb8e2571768dff9901b7c05b6ebffd3e0` | **SÍ** |

Cada fila cumple además `lineas_reconstruidas == lineas_origen`, `origen_termina_en_newline:true`,
`x_parches:0`, y **tres vías de hash coincidentes** (`sha256_reconstruido == sha256_origen_bytes ==
sha256_origen_por_lineas`). Son tres perfiles, tres variantes de forma, tres recuentos (1.041 / 1.044 /
1.047) y tres hashes distintos: no es un caso único que coincide por casualidad.

### 3.1 Las 9 plantillas de cabecera (`sha256` gzip == declarado en el índice)

| Par | `bytes_gz` | base64 chars | Variantes | Líneas de tabla | Vars | sha == índice |
|---|---|---|---|---|---|---|
| `P1+T5` | 23.565 | 31.420 | 2 | 1.067 | 34 | ✔ |
| `P1+T8` | 27.145 | 36.196 | 2 | 1.058 | 33 | ✔ |
| `P1+T9` | 24.908 | 33.212 | 3 | 1.093 | 34 | ✔ |
| `P3+T5` | 34.121 | 45.496 | 8 | 1.129 | 33 | ✔ |
| `P3+T6` | 33.150 | 44.200 | 6 | 1.102 | 33 | ✔ |
| `P3+T7` | 31.119 | 41.492 | 5 | 1.115 | 33 | ✔ |
| `P3+T9` | 29.913 | 39.884 | 6 | 1.135 | 34 | ✔ |
| `P4+T5` | 30.953 | 41.272 | 5 | 1.113 | 34 | ✔ |
| `P5+T5` | 28.249 | 37.668 | 3 | 1.093 | 34 | ✔ |

### 3.2 Corrección al censo de pares del enunciado

Censo independiente leyendo la **declaración real del origen** (`ape-profile=` del `#EXTINF` y
`"X-APE-Tier"` del `#EXTHTTP`, por bloque; `/root/metapack-verify/census.js`):

| Par | Declarado en la misión | **Medido** |
|---|---|---|
| `P3+T5` | 14.462 | 14.462 ✔ |
| `P3+T6` | 4.405 | 4.405 ✔ |
| `P3+T7` | 1.320 | 1.320 ✔ |
| `P1+T8` | 672 | 672 ✔ |
| `P1+T9` | 255 | 255 ✔ |
| `P3+T9` | 35 | 35 ✔ |
| `P1+T5` | 6 | 6 ✔ |
| **`P4+T5`** | **20** | **58** ✘ |
| **`P5+T5`** | **5** | **11** ✘ |
| **Suma** | **21.180** ✘ | **21.224** ✔ |

Los pares declarados **suman 21.180 y no cuadran con los 21.224 canales**; el censo medido suma
exactamente **21.224**. Confirmado por dos vías: el censo sobre el origen y el recuento de `mp.p` sobre
la lista generada.

---

## 4 · Formato para OTT — chequeos literales con `grep`/`awk`

Sobre `/root/metapack-verify/out_full.m3u8`. **Artefacto: `/root/metapack-verify/OTT.txt`**

| # | Chequeo | Comando | Salida | Veredicto |
|---|---|---|---|---|
| 4.1 | Línea 1 | `head -1 … \| cut -c1-60` | `#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-sh` | **PASS (con matiz §4.1)** |
| 4.2 | Nº `#EXTINF` | `grep -c '^#EXTINF'` | **21224** | **PASS** |
| 4.3 | Nº `#EXTSHIMOTT:` | `grep -c '^#EXTSHIMOTT:'` | **21224** | **PASS** |
| 4.4 | Nº `#EXTHTTP:` | `grep -c '^#EXTHTTP:'` | **21224** | **PASS** |
| 4.5 | URLs (líneas que no empiezan por `#`) | `grep -vc '^#'` | **21224** | **PASS** |
| 4.6 | **Exactamente 1 URL por EXTINF** | `awk` máquina de estados | `bloques=21224 urls_totales=21224 bloques_con_url!=1=0` | **PASS** |
| 4.7 | `#EXT-X-APE-` **fuera** de cabecera | `tail -n +47 … \| grep -c` | **0** | **PASS** |
| 4.8 | `#EXT-X-APE-` totales | `grep -c '^#EXT-X-APE-'` | **10** (1 índice + 9 plantillas) | **PASS** |
| 4.9 | Todas las APE en cabecera | primer `#EXTINF` en línea **47** → 10 en cabecera | **10 / 10** | **PASS** |
| 4.10 | Fin de línea | conteo de `CR` | **0** (sólo `LF`) | **PASS** |

### 4.1 Matiz: la línea 1 **no** es literalmente `#EXTM3U`

El enunciado pedía `línea 1 == #EXTM3U`. Literalmente **es falso**. La línea 1 es:

```
#EXTM3U x-tvg-url="" x-tvg-url-epg="" x-tvg-logo="" x-tvg-shift=0 catchup="flussonic" catchup-days="7" catchup-source="{MediaUrl}?utc={utc}&lutc={lutc}" url-tvg="" refresh="1800"
```

Es **M3U Plus** (atributos tras `#EXTM3U`), convención estándar y **byte-idéntica a la línea 1 de la
lista servida hoy**. El chequeo correcto es `startsWith('#EXTM3U')` → **PASS**. Se explicita porque el
criterio escrito era `==` y, al pie de la letra, sería FAIL.

---

## 5 · Lo que OTT consume es **byte-idéntico** (21.224 canales, no una muestra)

**Artefacto: `/root/metapack-verify/OTT-IDENTITY.txt`** — `grep` de cada familia de líneas en ambas
listas + `sha256sum`:

| Familia | Servida | Nueva | sha256 (ambas) | Veredicto |
|---|---|---|---|---|
| `#EXTINF` | n=21224 | n=21224 | `d8daaf5330686269a26f28c3781a9d3aefd62f74c7e9cc8b97a482cfe7882990` | **IDÉNTICO** |
| `#EXTHTTP:` | n=21224 | n=21224 | `b26b0526aca0fabac364b234735acfe3875ba890bc8e721625925145980befcb` | **IDÉNTICO** |
| URLs | n=21224 | n=21224 | `35db982afd2449f6917ec456c329056b85d15526253c92c79bf538bb7407f574` | **IDÉNTICO** |

Es la evidencia más fuerte de preservación OTT: todo lo que el player consume no cambia **ni un byte**
en los 21.224 canales. Lo único que cambia es (a) un tag **desconocido** que crece y (b) 10 líneas de
cabecera nuevas.

---

## 6 · Tamaños, generador intacto y lista servida viva

### 6.1 Tamaños (artefacto: `/root/metapack-verify/SIZES.txt`)

| Métrica | Servida hoy | **Nueva** | Delta |
|---|---|---|---|
| Bytes crudos | **186.789.613** | **241.369.227** | **+54.579.614 (+29,22 %)** |
| gzip | **4.023.576** | **13.679.788** | **+9.656.212 → 3,400×** |
| Ratio gzip/crudo | **2,1542 %** | **5,6676 %** | +3,51 pp |
| **Líneas totales** | 127.380 | **127.390** | **+10** |
| Cabecera (líneas) | 36 | **46** | +10 |
| Canales | 21.224 | 21.224 | 0 |
| **Línea más larga** | **7.944 B** | **45.530 B** | **5,73×** |
| `#EXTSHIMOTT` media | **250 B** (mín 245, máx 269) | **2.805 B** (mín 572, máx 6.665) | +2.555 B/canal |
| Origen (referencia) | — | 1.298.222.092 B · 22.190.344 líneas · **máx 7.944 B** | — |

**Hecho clave:** el recuento de líneas **apenas se mueve** (+10 = 1 índice + 9 plantillas). Las
22.190.344 líneas del origen **no** llegan al cliente: se colapsan en 9 plantillas + un `mp` por
canal. El crecimiento es de **bytes**, no de estructura. Las 10 líneas de cabecera: índice **2.016 B**
y 9 plantillas de **31.454 a 45.530 B**. El fragmento `mp` dentro del shim: media **2.550 B**
(mín 320, máx 6.410).

gzip: `out_full.m3u8.gz` del tool = **13.679.788 B** (autoritativo, fijado por `sha256_out_gz` del
report); `gzip -9` de CLI da 13.703.217 B por su cabecera de nombre/timestamp.

### 6.2 Generador protegido intacto

```
$ git status --porcelain
 M IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js
?? tools/quality/test_ape_profile_light.js
```
Filtro `m3u8-typed-arrays-ultimate.js|ape-profiles-config.js` → **sin coincidencias**.
**PASS.** (El `M` es el tool extendido por la dependencia; no es el generador.)

### 6.3 Lista servida AHORA (externa, UA de OTT, gzip)

```
$ curl -sk -o /dev/null -w '%{http_code} %{size_download} %{content_type} %{time_total}' \
    -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' \
    https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8
http_code=200 size_download=4023576 content_type=application/vnd.apple.mpegurl time_total=1.296481
```
**PASS**: `200` y **4.023.576 B** exactos. En disco: `186.789.613 B`, md5
`3a8ad6905e420ee29ce79357276dfbc7`, mtime **2026-11-15 06:12:38** (anterior a esta sesión, que corrió
a las 09:2x). Mis artefactos viven **sólo** en `/root/metapack-verify/`; `/var/www/lists` no recibió
escrituras. *(Nota: `/var/www/html/lists` es symlink a `/var/www/lists`, mismo inodo 392691.)*

### 6.4 Gate sobre el estado actual

```
$ bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json
{"verdict":"PASS","pass":10,"fail":0, …}      # exit 0
```
Con **1 SKIP honesto**: `pulse-canal` → `407|124|0.540517 (canal bloqueado por el proveedor)`. El SKIP
**no** cuenta como PASS; el gate lo deja fuera de los 10.

---

## 7 · Los dos bloqueos medidos

### 7.1 BLOQUEO 1 (determinista) — el gate exige `ape=0` y el metapack trae `ape=10`

El chequeo `[11] PROYECCION` de `/opt/ape-pulse/gate_ape_crystal_flow.sh` (líneas 174-190) exige
literalmente **cero** líneas `#EXT-X-APE-`:

```sh
g_ape=$(grep -c '^#EXT-X-APE-' "$LIGHT" 2>/dev/null); g_ape=${g_ape:-0}
if [ "$g_ch" -gt 0 ] && [ "$g_tag" -eq "$g_ch" ] && [ "$g_ape" -eq 0 ]; then
  ok "proyeccion" ...
else
  bad "proyeccion" "${g_sz}B · canales=${g_ch} tags=${g_tag} ape=${g_ape} (se espera 1 tag/canal y 0 APE)"
fi
```

**Experimento (override de entorno, sin tocar producción):**

```
$ APE_LIGHT_FILE=/root/metapack-verify/out_full.m3u8 bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json
{"verdict":"FAIL","pass":9,"fail":1, …,
 "check":"proyeccion","status":"FAIL",
 "detail":"241369227B · canales=21224 tags=21224 ape=10 (se espera 1 tag/canal y 0 APE)"}
$ echo $?
1
```

**Consecuencia:** adoptar el metapack **rompe el gate por construcción**. La regla dura dice «la lista
servida NO se reemplaza hasta que … el gate pase»; con la lista nueva el gate **no pasa**. No es un
riesgo hipotético: es un `if` con `ape -eq 0` contra un artefacto que tiene 10.

> Esto **no** dice que el metapack esté mal. Dice que **el invariante del gate y este diseño son
> incompatibles**, y que adoptar exige una decisión explícita: o se enmienda el chequeo `proyeccion`
> (permitiendo las líneas de cabecera con plantillas), o se sacan las plantillas fuera de la playlist
> (§7.3-B). Ambas son decisiones del operador, no del verificador.

### 7.2 BLOQUEO 2 (riesgo de sobre, no medido en device)

| # | Riesgo medido | Hoy | Nueva | Por qué importa |
|---|---|---|---|---|
| R1 | **Línea más larga** | **7.944 B** | **45.530 B** | El **origen completo** (22.190.344 líneas) también tiene máx **7.944** y **cero** líneas > 8.192. En las **44,4 M de líneas** del conjunto (origen+servida) **no existe una sola línea de 45 KB**: es un sobre nuevo, no uno ya ejercitado |
| R2 | Bytes descomprimidos | 186,8 MB | **241,4 MB** | +29,22 % de texto a retener/parsear en el device |
| R3 | Transferencia por refresco | 4,02 MB | **13,68 MB** | 3,400× por recarga (`refresh="1800"`) |
| R4 | Nº de líneas | 127.380 | 127.390 (**+10**) | **Riesgo descartado** — dato a favor |

R1 es plausible, no demostrado: RFC 8216 §6.3.1 obliga a *ignorar* el tag desconocido, pero ignorar su
contenido no garantiza que un parser con buffer fijo lea sin error una línea de 45 KB. **No hay device
ni APK en esta sesión**, así que no se ha medido y no se afirma que se rompa.

### 7.3 Condición de desbloqueo (cualquiera de las dos)

- **(A) Prueba en device** con OTT Navigator real sobre una copia servida en URL de canario: carga
  completa de 21.224 canales + zap a ≥3 canales P1/P3/P4 + cero error de parseo. Con ese artefacto R1
  deja de ser hipótesis. **No** desbloquea el Bloqueo 1: el gate seguiría fallando.
- **(B) Sacar las plantillas de la playlist** (recurso aparte referenciado por el índice, que ya lleva
  el `sha256` de cada plantilla). Elimina R1 de raíz, devuelve la línea máxima al orden de 8-14 KB
  (`shim + mp`) y deja la lista servida con `ape=0`, con lo que **el gate vuelve a poder pasar**.

---

## 8 · Registro adversarial (por qué el veredicto no es una opinión)

Se aplicó oposición formal a la propia conclusión, dos pasadas:

1. **Primera pasada → CONTRA.** Con mi evidencia inicial, el contra-argumento («bloqueas por un
   riesgo no medido; las dos condiciones duras ya se cumplen») **ganó 13-9**. El test detectó un
   **error mío**: yo había escrito que el gate «autoriza el reemplazo». Falso en dos sentidos — la
   regla es *necesaria, no suficiente*, y el gate PASS 10/10 se medía sobre la lista **vieja**, así que
   no certificaba nada del artefacto nuevo.
2. **Corrección y medición.** Se leyó el gate y se ejecutó el experimento de §7.1: con la lista nueva
   el gate da **FAIL 9/10**. La premisa del contra-argumento (b) era falsa.
3. **Segunda pasada → TESIS** (11-9, con 4 evidencias con artefacto). Sobrevive el bloqueo, y ahora se
   apoya en un mecanismo **reproducible**, no en una valoración de riesgo.

Se conserva la evidencia que favorece al CONTRA porque es cierta y relevante: reconstrucción exacta
(`indep_full.json`), identidad de líneas consumidas (`OTT-IDENTITY.txt`) y sólo +10 líneas (`OTT.txt`).

---

## 9 · Reproducción exacta

```bash
# 1) gates de sintaxis
node -c IPTV_v5.4_MAX_AGGRESSION/vps/bin/ape-profile-project.js     # exit 0
node -c tools/quality/test_ape_profile_light.js                     # exit 0

# 2) suite (19/19 PASS, exit 0)
node --max-old-space-size=4096 tools/quality/test_ape_profile_light.js

# 3) generación sobre copia (VPS; destino FUERA de /var/www/lists)
node --max-old-space-size=2600 ape-profile-project.js light \
  /var/www/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8 \
  /root/metapack-verify/out_full.m3u8 \
  --origin /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8 \
  --gz --report /root/metapack-verify/report.json

# 4) verificación INDEPENDIENTE (implementación separada, compara bytes del origen)
node --max-old-space-size=2600 indep-verify.js \
  /root/metapack-verify/out_full.m3u8 \
  /var/www/lists/APE_LISTA_1794100720046_CABLEADA.m3u8 \
  --full --pick P1,P3,P4

# 5) OTT literal
bash /root/metapack-verify/ottchecks.sh | tee /root/metapack-verify/OTT.txt
grep -c '^#EXTINF' out_full.m3u8                       # 21224
grep -c '^#EXTSHIMOTT:' out_full.m3u8                  # 21224
grep -vc '^#' out_full.m3u8                            # 21224
grep -n -m1 '^#EXTINF' out_full.m3u8                   # 47
tail -n +47 out_full.m3u8 | grep -c '^#EXT-X-APE-'      # 0

# 6) identidad de lo que OTT consume
bash -c 'for f in /var/www/lists/…_LIGHT.m3u8 /root/metapack-verify/out_full.m3u8; do \
  grep "^#EXTHTTP:" "$f" | sha256sum; done'            # mismo hash

# 7) generador intacto
git status --porcelain | grep -E 'm3u8-typed-arrays-ultimate\.js|ape-profiles-config\.js'   # sin salida

# 8) lista servida viva + gate actual + gate contra la nueva
curl -sk -o /dev/null -w '%{http_code} %{size_download}\n' \
  -A 'OTT Navigator/1.7.3.3' -H 'Accept-Encoding: gzip' \
  'https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046_CABLEADA_LIGHT.m3u8'  # 200 4023576
ssh root@178.156.147.234 'bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json'      # PASS 10/10 (1 SKIP)
ssh root@178.156.147.234 'APE_LIGHT_FILE=/root/metapack-verify/out_full.m3u8 \
  bash /opt/ape-pulse/gate_ape_crystal_flow.sh --json'                              # FAIL 9/10, exit 1
```

### Artefactos en el VPS (`/root/metapack-verify/`, fuera de `/var/www/lists`, borrables)

`out_full.m3u8` (241.369.227 B) · `out_full.m3u8.gz` (13.679.788 B) · `report.json` ·
`indep_full.json` · `OTT.txt` · `OTT-IDENTITY.txt` · `SIZES.txt` · `ORIGIN-LINELEN.txt` ·
`ottchecks.sh` · `measure-sizes.sh` · `census.js` · `indep-verify.js` ·
`ape-profile-project.js` (sha256 `cf9b29af068433a8e352d9fa049b51a230554fcf79c3e850d8f19463ed9a3d40`,
idéntico al local).

### No verificado (declarado, no rellenado)

- **Comportamiento de OTT Navigator** (ni de ningún player) sobre el fichero nuevo: sin device ni APK.
- **Tiempo de zap / memoria del cliente** con 241,4 MB: no instrumentado.
- El censo de pares se midió como **(Perfil, Tier) declarado por el origen**; no se re-clasificó con
  `ape-profile-classifier.js` (fuera del alcance de esta tarea).
