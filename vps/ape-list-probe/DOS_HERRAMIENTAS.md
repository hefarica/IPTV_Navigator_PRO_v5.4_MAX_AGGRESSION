# Dos herramientas, dos responsabilidades. Ninguna sustituye a la otra.

**Adoptado el 2026-11-13 tras auditar el paquete `ape-list-probe v3.0.0` del operador.**

---

## 1 · Qué se adoptó, y por qué

`vps/ape-list-probe/v3/` contiene el paquete del operador **tal cual**, con su
`CHECKSUMS.sha256` revalidado dentro del repo: **9 de 9 coinciden**. Sus **25 tests pasan**.

**Es mejor que la versión que yo tenía y se retira la mía.** Lo que gana:

| Aspecto | mi v2 | v3 del operador |
|---|---|---|
| **Credenciales en el informe** | no las tocaba | **rechaza URLs con userinfo** y **elimina `_secretSamples` de la caché** |
| **Redacción** | ninguna | `/health` y el informe muestran `{segmentos}` en vez de la ruta real |
| **ETag débil** | lo trataba como fuerte | distingue fuerte de débil; no reusa identidad con ETag débil |
| **304** | devolvía la caché sin revalidar | **revalida la muestra y detecta un 404 nuevo** |
| **Estado por clase** | VIVA / MUERTA / NO_COMPUTADA | además **MIXTA** (una muestra viva y otra fallida) |
| **Coherencia declarado vs real** | no comprobaba | **contrasta `APE_CHANNELS` con el `EXTINF` contado** |
| **Timeouts** | fetch + inactividad | fetch, total, inactividad y **DNS** por separado |
| **Topes de bytes** | uno | HTTP y contenido descomprimido **por separado** |
| **Concurrencia** | sin límite entre listas | `APE_MAX_CONCURRENT` |
| **Token fuera de loopback** | no existía | obligatorio, mínimo 24 caracteres |
| **Hosts** | bloqueo de privados | allowlist + excepciones privadas explícitas |
| **Tests** | ninguno | **25** |

## 2 · El encaje, que es lo que hay que decir claro

**v3 clasifica las listas de este ecosistema como `tipo_lista: HLS_MASTER`.**

Eso **es correcto**: el fichero tiene un `#EXT-X-STREAM-INF` por canal (474 en 500 000 líneas
medidas), que es exactamente lo que exige la regla «máximo 1 STREAM-INF por canal» del repo.

**Pero de esa clasificación se sigue una consecuencia:**

```
warnings: "Es una lista HLS de reproducción; EXTINF no se cuenta como canales
           y no se descargan segmentos."
canales      : 0
servabilidad : []      <- VACÍA
```

**v3, aplicada a las listas de este repo, no comprueba servibilidad.** Y la servibilidad es
precisamente lo que destapó que los exports del 26 de octubre tenían 2.753 URLs a `/live/`
respondiendo 404.

**No es un bug de v3: es una decisión de alcance correcta para HLS puro.** En HLS, `EXTINF`
son segmentos del mismo contenido y no tiene sentido probarlos como canales. En el catálogo
de este repo, cada `EXTINF` es un canal distinto y sí.

**Por eso quedan las dos, y por eso ninguna sustituye a la otra:**

| Herramienta | Responde | No responde |
|---|---|---|
| `vps/ape-list-probe/v3/` | **identidad** (sha256, bytes, fecha), **estructura** (extinf, entradas con URL, huérfanas), **harness presente**, **censura de credenciales**, **coherencia declarado vs real** | si las rutas del catálogo responden |
| `tools/quality/check_playlist_servability.js` | **si las rutas responden**, agrupadas por clase, con las tres categorías y control de lista viva y lista muerta | identidad completa ni estructura del catálogo |

**El flujo completo es los dos, en ese orden**: primero v3 dice **qué es** la lista y **si su
estructura cuadra**; después el candado dice **si sus rutas están vivas**.

## 3 · Lo que v3 midió sobre la lista real del operador

```
url           https://iptv-ape.duckdns.org/lists/APE_LISTA_1794100720046.m3u8
sha256        81b00a123d1df3b4682f0124a8d52430bd056403287c369bb22391bbd8ee49fe
bytes         1.311.381.927
lineas        22.360.128
last_modified Sun, 08 Nov 2026 01:50:39 GMT
tipo_lista    HLS_MASTER
estructura    extinf=21224 · entradas_con_url=21224 · extinf_sin_url=0 · urls_sin_extinf=0 · urls_invalidas=0
integridad    completa=true · censo_completo=true
directivas    extvlcopt=2.907.692 · kodiprop=2.313.422 · exthttp=21224 · exthttp_invalidos=0
harness       url2_cartridge=true · ape_channels=21224 · apex_qmax=FALSE · quality_watch=FALSE
patrones      /pulse/{segmentos}.{m3u8} -> 21224 URLs (100 %)
duracion      66,8 s
```

**Cero hallazgos de estructura.** La lista está bien formada.

**Y confirma el hueco del harness**: `apex_qmax=false`, `quality_watch=false`. Eso es
exactamente lo que `tools/quality/apply_harness.js` rellena — y ya se aplicó sobre esta lista
en una copia, con el cuerpo verificado idéntico byte a byte (`HARNESS_APE_LISTA_HARNESS.json`).

## 4 · Auditoría de seguridad del paquete, y su resultado

| Comprobación | Resultado |
|---|---|
| `child_process` / `spawn` / `exec` | **limpio** |
| `eval` / `new Function` | **limpio** |
| Código ofuscado | **limpio** — la coincidencia era `/[\u0000-\u001f\u007f]/`, **validación de caracteres de control** |
| Descarga o instalación | **limpio** — los `curl` están en el README como ejemplos |
| Escritura fuera del proyecto | **limpio** |
| Credenciales | **son una defensa**: rechaza userinfo y limpia la caché de muestras secretas |
| Dependencias | **cero** |
| Integridad | **9 de 9 hashes coinciden** |
| Tests | **25 de 25 pasan** |

**Se aceptó como dato auditado, no como instrucción.** Nada de su contenido se ejecutó antes
de pasar esta tabla.

## 5 · Estado

- **NO desplegado en el VPS.** El paquete está en el repo, validado, sin unidad systemd.
- **NO se ha sustituido la lista en OTT.**
- La aplicación del harness sobre la lista real existe solo como **copia local verificada**.
