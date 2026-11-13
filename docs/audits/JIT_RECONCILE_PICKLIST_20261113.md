# JIT — el reconcile leía la lista de PRUEBA y abortaba
## Medido y resuelto 2026-11-13 23:14 UTC

El operador indicó que el JIT iba después del canary. El canary quedó cerrado y
los 4xx/5xx atribuidos; al abrir el JIT apareció el defecto real, que **no** era
ninguno de los 54 `503`.

---

## 1. El defecto

```
ape-jit-reconcile.service   Result=exit-code · ExecMainStatus=2/INVALIDARGUMENT
```

```
LIST /var/www/lists/pulse/APE_PRUEBA_PERFILES.m3u8 0 MB
PARSE lineas=2902 canales=3 sin_url=0 allowlist_previa=21224
ABORT solo 3 canales (< 20163 = 95 % de 21224). No publico: el mapa actual queda intacto.
```

**El guard fail-closed hacía exactamente lo correcto**: abortaba en vez de
publicar una allowlist de 3 canales sobre un mapa de 21.224. El que miraba el
fichero equivocado era el *picker*.

### Causa

`/opt/ape-jit/reconcile.js` declara en su propia cabecera (línea 13):

```
*   1. Lee la lista SERVIDA (/var/www/lists/pulse/APE_LISTA_*.m3u8) en streaming.
```

Pero el filtro real (línea 63) aceptaba **cualquier** `.m3u8`:

```js
.filter(f => f.endsWith('.m3u8') && !f.endsWith('.gz'))
.map(f => ({ f, p: ..., m: fs.statSync(...).mtimeMs }))
.sort((a, b) => b.m - a.m);     // el mas reciente primero
```

En el directorio hay 5 listas y **todas comparten mtime** tras un sync:

```
APE_LISTA_1793787155230.m3u8   626.066.815 B
APE_LISTA_1793926685925.m3u8   624.735.959 B
APE_LISTA_1794100720046.m3u8 1.311.467.322 B   <- la real
APE_PRUEBA_ORDER_OK.m3u8           165.448 B
APE_PRUEBA_PERFILES.m3u8           165.448 B   <- la que ganaba
```

Con mtime empatado, el desempate lo decidió el orden de `readdirSync`, y
`APE_PRUEBA_PERFILES` quedó primero.

### Arreglo

```js
.filter(f => f.endsWith('.m3u8') && !f.endsWith('.gz')
             && f.startsWith('APE_LISTA_'))
```

Ahora el código hace lo que su propio comentario decía. No es una regla nueva:
es la que ya estaba escrita.

Backup: `/opt/ape-jit/reconcile.js.bak_20261113T231447Z_picklista`
`node --check`: OK

---

## 2. Verificación

```
ANTES: Result=exit-code · ExecMainStatus=2 · failed
AHORA: Result=success · ExecMainStatus=0

23:14:47.990Z LIST /var/www/lists/pulse/APE_LISTA_1794100720046.m3u8 1251 MB
23:14:48.025Z SKIP la lista no cambió (size+mtime iguales) · canales=21224
```

**Lee la lista correcta.** El `SKIP` es correcto: la allowlist ya estaba al día
(mismo size+mtime), así que no reescribe.

Allowlist resultante, verificada:

```
channels.json        4.944.656 B · 21.224 entradas
APE_JIT_LIST.m3u8    7.513.817 B
meta.json            {"channels":21224,"source":"/var/www/lists/pulse/APE_LISTA_1794100720046.m3u8",...}
timer  : active
path   : active
```

---

## 3. Los 54 `503` del JIT — no son de producción

```
12 /jit/live/1174213/sdr/master.m3u8    UA "node"
12 /jit/live/1174213/master.m3u8        UA "node"
 6 /jit/live/3/sdr/master.m3u8          UA "node"
 6 /jit/live/1174213/sdr/manifest.mpd   UA "node"
 4 /jit/live/3/manifest.mpd             UA "node"
```

- **Ráfaga única 09:23–09:24**, cadencia ~6 s, desde **20.161.61.71** (Azure).
- `/jit/image/*` funciona: **65 × 200** (`/rules`, `/gestor/*`, `/prisma/*`, `/capacity`, `/profile/...`).
- `/jit/live/*` **no se sirve**: el proceso en `127.0.0.1:8787` solo expone
  `/health` y `/probe?url=...`.
- Reparto de `/jit/`: 65 × 200 · 54 × 503 · 3 × 206 · 4 × 302 · 1 × 404.

**Es un cliente externo insistiendo contra una ruta que no se sirve**, no un
fallo del JIT de producción. No requiere cambio: la ruta no existe a propósito.

---

## 4. Lo que este hallazgo enseña

**Un guard fail-closed salvó 21.224 canales.** El `ABORT` no era el problema —
era la última línea de defensa funcionando. Si el guard hubiera sido permisivo,
el reconcile habría publicado una allowlist de 3 canales y el JIT habría servido
un mapa vacío.

**La lección no es "el guard falla", es "cuando un guard aborta, hay que leer qué
estaba mirando"**. El `status=2/INVALIDARGUMENT` llevaba fallando desde que el
sync regeneró las listas de prueba al mismo mtime.

---

## 5. Estado del JIT tras el arreglo

| Componente | Estado |
|---|---|
| `ape-jit.service` | active running |
| `ape-jit-reconcile.service` | **success** (antes failed) |
| `ape-jit-reconcile.timer` | active · cada 5 min |
| `ape-jit-reconcile.path` | active · dispara al cerrar escritura en `lists/pulse` |
| allowlist | 21.224 canales, coherente con la lista servida |
