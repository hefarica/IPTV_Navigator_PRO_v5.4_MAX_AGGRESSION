# R7 — El inventario de 61 rutas pasa a CONTRATO de CI

Fecha: 2026-11-21 · Tarea t37 · Entregables: `tools/quality/test_jit_routes_contract.js`,
paso en `.github/workflows/ape-bridge-tests.yml`, este documento.

## 0 · Qué cambia

Antes: `artifacts/verify/jit_routes_61.json` (R1) era un **informe**. Se podía borrar una ruta del
motor, cambiarle el método o añadir superficie nueva y **ningún gate lo veía**.

Ahora: el test compara el **server.js canónico**
(`IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/server.js`) contra ese inventario y **falla nombrando la ruta**
en los tres casos que el encargo pide:

| Caso | Mensaje (nombra la ruta) | Exit |
|---|---|---|
| Ruta declarada que ya no está | `rutas que el inventario declara y el motor YA NO TIENE: /image/optimize (estaba en L8052, L8071)` | 1 |
| Ruta nueva sin declarar | `rutas NUEVAS en el motor que el inventario NO declara: /ruta-inventada (L8052)` | 1 |
| Método declarado sin evidencia | `metodos declarados que ya no tienen evidencia: /image/declare: declara POST y en el codigo NO hay evidencia de POST (solo queda una guarda desnuda: paso a atender CUALQUIER metodo)` | 1 |
| Falta el inventario | `CONTRATO ROTO: falta el inventario` (no se salta) | 1 |

## 1 · Corrida VERDE (comando exacto del paso de CI)

```
$ node tools/quality/test_jit_routes_contract.js
== CONTRATO JIT: 61 rutas declaradas ==
server.js   : IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js
sha256      : 268bbd3a05f8d8645d8641821f98dfc76e72060c44681ecfe31701f210ba4eb0  (480976 B, 9813 lineas)
guardas     : 66 ocurrencias, 61 rutas distintas

CONTRATO CUMPLIDO: 61/61 rutas declaradas presentes, 61 rutas en el motor, 0 nuevas, 0 metodos perdidos.
  (contrato: artifacts/verify/jit_routes_61.json  ·  motor: IPTV_v5.4_MAX_AGGRESSION\vps\ape-jit\server.js)
STEP_EXIT=0
```

Los números cuadran con R1: **66** ocurrencias de `pathname === '...'`, **61** rutas distintas,
**480976 B**, sha256 **268bbd3a…ba4eb0**.

## 2 · Pruebas negativas REALES (sobre COPIAS, `--server`)

El `server.js` de producción **no se tocó**: su sha256 se midió antes y después de las pruebas y es
idéntico en ambos momentos (`268bbd3a…ba4eb0`).

### N1 · Renombrar una ruta declarada (`/image/optimize` → `/image/optimize-RENOMBRADA`)

```
$ node tools/quality/test_jit_routes_contract.js --server %TEMP%\jit-neg\server-n1.js --quiet

CONTRATO ROTO: rutas que el inventario declara y el motor YA NO TIENE (1)
  - /image/optimize (estaba en L8052, L8071)

CONTRATO ROTO: rutas NUEVAS en el motor que el inventario NO declara (1)
  - /image/optimize-RENOMBRADA (L8052)
  - si la ruta es intencional: declarala en artifacts/verify/jit_routes_61.json (y en su .md)
EXIT_N1=1
```

### N2 · Añadir una ruta nueva no declarada (`/ruta-inventada`)

```
$ node tools/quality/test_jit_routes_contract.js --server %TEMP%\jit-neg\server-n2.js --quiet

CONTRATO ROTO: rutas NUEVAS en el motor que el inventario NO declara (1)
  - /ruta-inventada (L8052)
  - si la ruta es intencional: declarala en artifacts/verify/jit_routes_61.json (y en su .md)
EXIT_N2=1
```

### N3 · Quitar el POST de una ruta que lo declara (`/image/declare`)

```
$ node tools/quality/test_jit_routes_contract.js --server %TEMP%\jit-neg\server-n3.js --quiet

CONTRATO ROTO: metodos declarados que ya no tienen evidencia en el codigo (1)
  - /image/declare: declara POST y en el codigo NO hay evidencia de POST (solo queda una guarda desnuda: paso a atender CUALQUIER metodo)
EXIT_N3=1
```

### N4 · Inventario ausente (no se salta)

```
$ APE_JIT_ROUTES_JSON=%TEMP%\jit-neg\no-existe.json node tools/quality/test_jit_routes_contract.js --quiet
CONTRATO ROTO: falta el inventario
  esperado: C:\Users\HFRC\AppData\Local\Temp\jit-neg\no-existe.json
  sin inventario no hay contrato que vigilar: NO se salta el test.
EXIT_N4=1
```

## 3 · Dos defectos que la prueba negativa destapó (y se corrigieron)

Se documentan porque son la razón de que la regla del método tenga la forma que tiene:

1. **N3 falló mal a la primera (no fallaba).** Mi regla inicial contaba una guarda *desnuda*
   (`if (u.pathname === '/x') {`) como "atiende POST". Al quitar `&& req.method === 'POST'`, la ruta
   pasaba de POST a *cualquier método* y el test daba verde. Corregido: la guarda desnuda prueba **GET**
   (o "cualquiera"), **nunca** prueba POST; si se declara POST se exige evidencia explícita
   (`=== 'POST'`, `!== 'POST'`, o `&& req.method === 'POST'`).
2. **N2 daba un falso positivo.** Los tramos se calculaban con los números de línea absolutos del
   inventario; al insertar una línea (la ruta nueva) todo el fichero se desplaza +1 y
   `/image/config` "perdía" su POST de L9540. Corregido: se usa la **longitud** del tramo grabado por
   R1 (`end_lines - guards`), aplicada a la posición actual de la guarda → invariante al desplazamiento.

Regla final del contrato (documentada en la cabecera del test):
`POST` exige evidencia explícita · `GET` se satisface con evidencia explícita **o** con una guarda
desnuda · `ANY` no exige nada, y si el código **restringe** más de lo declarado se emite **aviso**
(no es regresión de superficie; marcarlo en rojo bloquearía el CI por una mejora). Caso conocido y
declarado: `/image/capacity` figura como `ANY` porque su rama es **muerta** (L9518 ya devuelve antes de
L9521, ver R1).

## 4 · Paso de CI

En `.github/workflows/ape-bridge-tests.yml`, entre el guard del reconciliador JIT y el gate de lista:

```yaml
      - name: Contrato de las 61 rutas del motor JIT
        run: node tools/quality/test_jit_routes_contract.js
```

- El workflow **ya** dispara con `tools/quality/test_*.js` y `IPTV_v5.4_MAX_AGGRESSION/vps/ape-jit/**`,
  así que no hizo falta tocar el bloque `on:`.
- YAML validado: `yaml.safe_load` → **21 steps**, el paso aparece con su nombre.
- El comando del paso se ejecutó **literalmente** (extraído del propio YAML) antes de dar por bueno el
  cableado: `STEP_EXIT=0`.

## 5 · Nota de versionado (importante para que el gate sirva en CI)

`.gitignore:174` ignora `artifacts/`, así que el inventario **no viajaba al runner**: el paso habría
fallado siempre con "falta el inventario". Se versiona con `git add -f` porque es un **contrato**, no un
artefacto de proveedor. Comprobado que su contenido no lleva material sensible: 0 ocurrencias de
`xtream`, `username`, `password`, `http://`, `https://`, `token`, `apikey`. Son nombres de ruta,
números de línea y etiquetas de dependencia.

## 6 · Cómo se mantiene

- Si se **añade** una ruta al motor de forma intencional: se declara en
  `artifacts/verify/jit_routes_61.json` **y** en su `.md` (el mensaje del test lo dice).
- Si se **cambia** el método de una ruta: se actualiza el inventario en el mismo commit; el contrato
  seguirá exigiendo que la evidencia exista en el código.
- Si el `server.js` cambia de sha respecto al del inventario, el test lo **avisa** y evalúa sobre el
  código actual (el sha es informativo, no un pin: el pin del motor desplegado es
  `test_canary_jit_contract.js`).
