# R15 — Guarda contra reescritura de origen en el reconciliador JIT

**Estado: PARCHE LISTO, NO DESPLEGADO.** El fichero `vps/ape-jit/reconcile.js` es el de producción
(`/opt/ape-jit/reconcile.js`, sha256 `86117c68…` = idéntico al local antes del parche). La instalación la
autoriza el capitán.

| Fichero | Antes | Después |
|---|---|---|
| `vps/ape-jit/reconcile.js` | 22 857 B · `86117c68029c5d228880f67045d98c323470da775f3a57b2da9622cd36b8b10a` | 29 090 B · `ce853fee9698ae86c99229ff11d8c567cfc72c2bd5127f327e628196f9ba41ea` |
| `tools/quality/test_reconcile_list_identity.js` | 10 860 B · `0b39b6bd…` | 15 474 B · `5fd0a1fcf392174a854484bad15c1b153b0900d04cf47da45def20b0676fed8e` |

`git diff --stat` = **2 ficheros, 184 inserciones, 0 borrados**. No se eliminó ni una línea existente.

---

## 1. El riesgo que cierra (medido en R5)

| Pieza | Hecho medido |
|---|---|
| `ape-jit-reconcile.timer` | ejecuta `/usr/bin/node /opt/ape-jit/reconcile.js` **sin `--list`**; `pickList()` elige por **mtime** (`reconcile.js:126-136`, hoy `:170-183`) |
| `ape-cablear-auto.timer` | cada ~15 min **re-envuelve** listas: `APE_LISTA_…_DIRECTA` pasó de cruda a **11 210** payloads propios |
| `APE_LISTA_1794100720046_P3_PLACEHOLDER` | comparte **11 168** ids con la fuente vigente y cambia el **host** de origen de **11 160 (99,93 %)**: `nfqdeuxu.x1megaott.store` → `evestv.wuitf.com` (evestv midió 7/7 caídos con 406) |

Consecuencia sin guarda: si esa lista queda la más reciente por mtime, `pickList()` la elige y el mapa
reescribe el origen de casi todo el catálogo **con `dropped=0` / `added=0`** — el journal diría que no cambió
nada mientras todo el catálogo pasa a apuntar a un proveedor muerto.

---

## 2. La guarda

### 2.1 Qué compara

`payloadHost(url)` extrae el **origen real** de cada canal del mapa:

- URL envuelta (`https://iptv-ape.duckdns.org/cdn/<host-origen>/…`) → primer segmento tras `/cdn/`.
- URL directa (lista ajena) → `new URL(url).host`.

Compara **host[:puerto]**, no la ruta: una regeneración normal cambia rutas y credenciales del **mismo** host y
**no** debe contar. Si no hay host reconocible, esa pareja **no se cuenta** (el guard no inventa comparaciones).

`compararOrigen(prevMap, map)` devuelve `{ comunes, mismoHost, hostDistinto, ratio, muestraInsuficiente, abortar, ejemplos }`.

### 2.2 Qué hace con el resultado

```
ORIGEN comunes=<n> mismo_host=<n> host_distinto=<n> ratio=<0.0000> umbral=0.2      ← SIEMPRE (también con --dry-run)
ABORT REESCRITURA_DE_ORIGEN: <x> de <n> canales comunes cambian de host (<p> % > 20 %). No publico: es un
  cambio de catalogo encubierto, no una actualizacion. El mapa actual queda intacto.
  Ejemplos: <id>: <host-viejo> -> <host-nuevo> | … (3)                            ← exit 2
```

- **Siempre** se emite la línea `ORIGEN`, también cuando no aborta y también en `--dry-run`, para que el
  journal de cada ciclo del timer tenga los tres números.
- Al abortar: `process.exit(2)` **antes de escribir cualquier cosa**. No hay release, no hay flip de symlink,
  no se toca `.reconciled`, no se purga nada. El mapa actual queda intacto (mismo contrato que el resto de
  los `ABORT` del fichero).

### 2.3 Orden en el pipeline (no se movió nada existente)

```
loop (LISTA_ENVUELTA)  →  LIST_CHANGED / 95 % / FLOOR_DURO  →  ids inválidos  →  [NUEVO: ORIGEN]  →  TRAZA  →  dry-run  →  publicación atómica
```

El guard nuevo se inserta **después** de los existentes y **antes** de `TRAZA`/dry-run/publicación:
`LIST_CHANGED`, `FLOOR_DURO` y el guard de bucle **conservan su precedencia y su código intacto**.

---

## 3. Por qué 0,20 — con los datos del censo, no a ojo

| Escenario | comunes | host_distinto | ratio |
|---|---:|---:|---:|
| **Regeneración legítima del mismo catálogo** (`1795153321616_CDN` vs `1795150582572_CDN`) | 11 222 | **0** | **0,0000** |
| **Desastre medido** (`P3_PLACEHOLDER` sobre la vigente) | 11 168 | **11 160** | **0,9993** |

Cualquier umbral entre 0,01 y 0,99 separa esos dos mundos. Se elige **0,20**:

- El generador **no cambia de host** al regenerar: cambia ruta/credenciales → una actualización normal debe dar
  ~0, y de hecho dio 0/11 222.
- **0,05** abortaría una migración **parcial** legítima (drenar un pool de CDN, mover un lote de canales).
- **0,50** dejaría pasar **media cartelera** reescrita, que ya es un cambio de catálogo encubierto.
- **0,20** deja margen a mover hasta 1 de cada 5 canales y sigue bloqueando el cambio masivo.

`MIN_COMUNES_ORIGEN = 50`: con muy pocos comunes el ratio no informa (con 11 canales, 6 cambios son «55 %») y
el número absoluto de canales reescritos es irrelevante; además `FLOOR_DURO` ya impide sustituir un catálogo
real por uno diminuto. Por debajo del mínimo el guard **no finge**: escribe
`muestra=<n><50: sin veredicto` y continúa.

---

## 4. Verificación

### 4.1 `node -c` (obligatorio)

```
node -c vps/ape-jit/reconcile.js                        -> exit 0
node -c tools/quality/test_reconcile_list_identity.js   -> exit 0
```

### 4.2 Suite completa — salida literal

```
=== 7 · ORIGEN: 95 % de los comunes con el MISMO host -> publica ===
  PASS  sale 0 (publica)   -> code=0
  PASS  registra ORIGEN con los tres numeros   -> ORIGEN comunes=100 mismo_host=95 host_distinto=5 ratio=0.0500 umbral=0.2
  PASS  ratio 0.0500 y umbral 0.2 visibles
  PASS  NO aborta por origen
  PASS  LIST_CHANGED y FLOOR_DURO siguen funcionando (no se rompio nada)

=== 8 · ORIGEN: 99 % de host DISTINTO -> exit 2 ABORT REESCRITURA_DE_ORIGEN ===
  PASS  sale 2   -> code=2
  PASS  dice ABORT REESCRITURA_DE_ORIGEN   -> ABORT REESCRITURA_DE_ORIGEN: 99 de 100 canales comunes cambian de host (99.00 % > 20 %). No publico: es un cambio de catalogo encu
  PASS  cuenta 99 de 100
  PASS  ORIGEN deja host_distinto=99 antes del abort
  PASS  da 3 ejemplos viejo -> nuevo   -> Ejemplos: ch1: viejo.test -> evestv.wuitf.com | ch2: viejo.test -> evestv.wuitf.com | ch3: viejo.test -> evestv.wuitf.com
  PASS  no publica ni escribe DRY-RUN despues del abort

RESUMEN PASS=32 FAIL=0
```

Los **22 checks previos** (casos 1-6, incluidos `LISTA_ENVUELTA`, `--dir`, `FLOOR_DURO` y `sin_id`) siguen en
verde: **32/32**. El caso 6 (publicación real) se omite en Windows por `fs.symlinkSync → EPERM`, límite del
host, no del cambio.

### 4.3 Prueba a ESCALA REAL con los números medidos (no sintéticos a 100 canales)

**Escenario P3 → debe abortar:**

```
PARSE lineas=40445 canales=20222 sin_url=0 sin_id=0 bucle=0 allowlist_previa=11222 lista=APE_LISTA_1794100720046_P3_PLACEHOLDER
LIST_CHANGED allowlist de APE_LISTA_1795153321616_CDN_CABLEADA (11222) -> lista APE_LISTA_1794100720046_P3_PLACEHOLDER (20222): catalogos distintos, el ratio 95 % no aplica
ORIGEN comunes=11168 mismo_host=8 host_distinto=11160 ratio=0.9993 umbral=0.2
ABORT REESCRITURA_DE_ORIGEN: 11160 de 11168 canales comunes cambian de host (99.93 % > 20 %). No publico: es un cambio de catalogo encubierto, no una actualizacion. El mapa actual queda intacto. Ejemplos: 9: nfqdeuxu.x1megaott.store -> evestv.wuitf.com | 10: … | 11: …
exit=2
```

Los tres números coinciden **exactamente** con el censo de R5 (`comunes=11168`, `mismo_host=8`,
`host_distinto=11160`), y se ve el orden correcto: `LIST_CHANGED` **sigue disparando** y luego el guard nuevo
aborta.

**Regeneración legítima (mismo host, ruta distinta, 11 222 canales) → debe publicar:**

```
ORIGEN comunes=11222 mismo_host=11222 host_distinto=0 ratio=0.0000 umbral=0.2
DRY-RUN no escribo nada channels=11222 jitlist_bytes=2301098 salen=0 entran=0
exit=0
```

---

## 5. Instalación (NO ejecutada — la autoriza el capitán)

```bash
# 1) paridad: el desplegado debe seguir siendo el de antes del parche
ssh hetzner-iptv 'sha256sum /opt/ape-jit/reconcile.js'
#    esperado AHORA: 86117c68029c5d228880f67045d98c323470da775f3a57b2da9622cd36b8b10a

# 2) backup + copia del parche (esperado tras copiar: ce853fee9698…)
ssh hetzner-iptv 'cp -a /opt/ape-jit/reconcile.js /opt/ape-jit/reconcile.js.bak-prem15-$(date +%Y%m%dT%H%M%SZ)'
scp vps/ape-jit/reconcile.js hetzner-iptv:/opt/ape-jit/reconcile.js
ssh hetzner-iptv 'sha256sum /opt/ape-jit/reconcile.js; node -c /opt/ape-jit/reconcile.js && echo SINTAXIS_OK'

# 3) dry-run real ANTES de dejar que el timer lo coja
ssh hetzner-iptv 'sudo /usr/bin/node /opt/ape-jit/reconcile.js --dry-run'
#    esperado: ORIGEN comunes=11222 mismo_host=11222 host_distinto=0 ratio=0.0000 umbral=0.2  y DRY-RUN

# 4) rollback (una línea)
ssh hetzner-iptv 'cp -a /opt/ape-jit/reconcile.js.bak-prem15-<stamp> /opt/ape-jit/reconcile.js'
```

Nota: el servicio no se reinicia (script de un solo disparo por timer); el siguiente ciclo a los ≤5 min ya usa
el fichero nuevo.

---

## 6. Límites declarados (lo que esta guarda NO hace)

1. **No mide si el host nuevo está vivo.** Bloquea el cambio masivo de origen, no juzga la calidad del nuevo
   proveedor. Un cambio **selectivo** por debajo del 20 % sigue pasando (por diseño) y puede meter canales
   muertos — es el hueco que el censo cubrió a mano (`evestv` 7/7 con 406).
2. **Compara host[:puerto], no ruta.** Si un proveedor mantiene host y cambia de ruta a una ruta muerta, no se
   detecta (y no debe: es una regeneración normal).
3. **Sin mapa previo no hay veredicto** (`comunes=0`): el primer despliegue, o un `channels.json` ilegible,
   publica sin comparación. Se registra `ORIGEN comunes=0`.
4. **No sustituye al resto de guards**: sigue siendo obligatorio que `pickList()` descarte listas envueltas y que
   `FLOOR_DURO`/95 %/`LIST_CHANGED` hagan su trabajo. Este guard es la última puerta antes de publicar.
5. **No se ejecutó la publicación real en Windows** (caso 6 de la suite, preexistente): `fs.symlinkSync` da
   EPERM en este host. En Linux esa rama ya estaba y sigue igual.
6. **NO COMPUTADO:** el comportamiento del guard contra las listas reales de 700 MB en el VPS (solo se probó el
   `--dry-run` local con fixtures a escala real). La verificación en producción es el paso 3 de §5.
