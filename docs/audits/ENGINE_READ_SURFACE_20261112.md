# Superficie de lectura del motor — barrido y mutacion · 2026-11-12

**Objetivo:** cerrar la segunda clausula de `P14` (*"ninguna lectura (GET) provoca mutacion"*) con una medicion, no con una afirmacion.

## 1 · Inventario de rutas (medido sobre el codigo, no supuesto)

`grep` sobre `tools/lab/ape-jit/server.js`: **68 rutas**, de las cuales **53 no-POST** y **15 POST**.

De las 53 no-POST, tres **mutan o arrancan trabajo por diseno** y se excluyeron leyendo su codigo:

| Ruta | Por que se excluye |
|---|---|
| `/go/<id>` (L6317) | fija el perfil de la peticion; el comentario del propio codigo lo dice |
| `/live/...` (L9032) | *"Start on manifest request so a player that asks JSON first also warms"* — arranca el job |
| `/jit/signal` (L8625) | es el endpoint que usa el worker del canary para pedir trabajo |

Las 15 POST son mutadoras por diseno (`/image/declare`, `/image/gestor/save`, `/image/plan`, `/image/optimize`, `/image/profile/align*`...).

## 2 · Barrido de lecturas

**41 URLs sondeadas** por la ruta publica `https://iptv-ape.duckdns.org/jit/...`:

```
2xx/3xx = 38   ·   otros = 3   ·   excepciones = 0   ·   de 41
```

Las tres "otras" son **respuestas de validacion de entrada**, no fallos:

| Ruta | Codigo | Lectura |
|---|---|---|
| `/jit/resolve` | 400 | exige parametros; sin ellos 400 es correcto |
| `/jit/image/serial` | 404 | ruta no expuesta por el proxy o sin argumento |
| `/jit/image/rules/resolve` | 400 | idem: validacion de entrada |

Respuestas grandes servidas sin error: `catalog.json` 4.876.049 B · `playlist.m3u8` 7.513.817 B · `playlist-resolver.m3u8` 9.014.034 B · `image/lineup` 10.712.906 B · `image/governance` 2.477.846 B.

## 3 · Huella antes / despues

Se tomaron cuatro huellas (codigo / longitud / sha256 del cuerpo) **antes** y **despues** del barrido:

```
/jit/health            200/49/eda05edbdb13e7ac      -> identico
/jit/capabilities.json 200/1104/21be2c9db294ca65    -> identico
/jit/catalog.json      200/4876049/69a87945c2ed4e92 -> identico
/jit/meta/1.json       200/817/9f767d2fc53a038e     -> 200/817/349bc85e47916890   ← DIFIERE
```

## 4 · El control que separa mutacion de campo volatil

Una diferencia de hash **no es** una mutacion: puede ser un campo volatil en el cuerpo. El experimento decisivo son **dos GET consecutivos con nada en medio**:

```
#1  generated_at = 2026-11-12T07:17:09.528Z
#2  generated_at = 2026-11-12T07:17:10.320Z
```

**Dos peticiones identicas seguidas tambien difieren.** El unico campo que cambia es `generated_at`. Luego la diferencia la produce el **timestamp de la respuesta**, no el barrido.

Sin ese control, el resultado anterior se habria reportado como "un GET muta estado". Habria sido falso.

## 5 · Conclusion sobre `P14`

- **Clausula 1 (repetir no duplica ni corrompe):** ya verificada por la segunda instalacion identica (`docs/audits/IDEMPOTENCY_20261112.md`).
- **Clausula 2 (ninguna lectura muta):** **medida con denominador declarado** — 41 URLs de lectura sondeadas, 38 con respuesta valida, y la unica diferencia de cuerpo explicada por un timestamp, demostrado con el control de dos GET consecutivos. **No es universal**: 3 rutas mutadoras por diseno quedan excluidas y declaradas, y 15 rutas POST no se probaron porque mutan a proposito.

## 6 · Hallazgo colateral que corrige `P01`

`/jit/meta/<id>.json` devuelve, entre otros campos:

```json
{"processing_domain":"vps_jit_legacy","rea_policy_ref":"contracts/rea/rea-processing-v1.json","rea_executed":false}
```

- `contracts/rea/rea-processing-v1.json` **existe** (3.261 B) y trae `policy_id`, `revision`, `authority`, `tiers`, `capacity`, `hdr`, `runtime_result_fields`, `runtime_verification`.
- El motor lo cita como **constante** (`server.js:4329`) y emite `REA_EXECUTED=0` (`:5107`).
- **El motor no lo lee**: sus `readFileSync` abren `MATRIX_FILE`, `GOVERNANCE_FILE`, `RULES_FILE`, `CHANNEL_SIGNAL_FILE`, `GESTOR_STORE`, `PROFILES_JSON`... **ninguno es la politica**.
- **La capa de lista si la consume**: `frontend/js/ape-v9/rea-processing-policy.js` usa `freezeDeep`, `validatePolicy` y `matchesRequired`.

**Correccion de metodo:** antes habia resumido esto como *"grep quality-policy = 0 coincidencias"*. Era cierto y era pobre. Lo que hay de verdad es mas preciso y mas favorable: **la politica existe, esta versionada, la consume el generador, aparece referenciada en los metadatos, y el motor declara por escrito que no la ejecuto**. `P01` sigue en `PARTIALLY_FUNCTIONAL` — pero por la razon correcta: el motor hereda la **referencia** y no la **ejecucion**, y lo dice.
