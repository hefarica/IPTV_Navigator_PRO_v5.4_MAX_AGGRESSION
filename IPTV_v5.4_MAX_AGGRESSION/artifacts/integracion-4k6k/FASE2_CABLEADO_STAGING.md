# Fase 2 — cableado real en staging (hook + invocación visible)

Complementa `FASE2_CIERRE.md`. Todo esto vive **solo en el worktree de staging**
(`C:\Users\HFRC\Desktop\IPTV_FASE2_STAGING`); el árbol principal no tiene cableado.

## 1 · El punto de extensión real

El emisor por canal de `m3u8-typed-arrays-ultimate.js` terminaba en (línea 13690):

```js
return _apeAppendExtshimottTag(_reaFinalBlock, channel, profile, _probeData, cfg, index, _uaApeProfile, 'https://www.google.com/');
```

Es el punto correcto: `_apeAppendExtshimottTag` devuelve el bloque YA finalizado (todas las
etiquetas + la ÚNICA URI). El hook sustituye ese `return` por una variable y un guard:

```js
var _fase2Block = _apeAppendExtshimottTag(...);
if (typeof window !== 'undefined' && window.APE_4K6K
    && typeof window.APE_4K6K.insertIntentTag === 'function'
    && window.APE_4K6K.isEnabled()) {
    _fase2Block = window.APE_4K6K.insertIntentTag(_fase2Block, channel);
}
return _fase2Block;
```

Con OFF no se ejecuta ni una instrucción del adaptador y se devuelve **el mismo string**
(identidad por referencia), así que el byte de salida no puede cambiar.

La lógica de inserción vive en el adaptador (`insertIntentTag`) para poder probarla fuera del
navegador, y **es flag-aware**: con OFF devuelve el bloque tal cual aunque el llamador olvide el
guard. Ese defecto lo encontró el navegador (ver §3), no una revisión a ojo.

## 2 · Invocación visible en la app

Panel autocontenido al final de `index-v4.html` (sin robo de foco, sin auto-ejecución):

```
[APE · 4K / Premium 6K]  (Auditar) (Activar) (Desactivar) (Probar etiqueta)
<pre id="ape4k6k-out">
```

- `Activar` / `Desactivar` escriben **booleano explícito** en `window.APE_4K6K_AUDIT` (contrato de la fase).
- `Auditar` llama `APE_4K6K.audit()` y muestra estado en el `<pre>`.
- `Probar etiqueta` ejecuta `insertIntentTag` sobre un bloque de muestra y muestra si es idéntico.

## 3 · Prueba en navegador sobre el index real

```
node %TEMP%\fase2-index-test.js     (Chrome 157.0.8103.80 headless, frontend/ por loopback)
GET /index-v4.html#ape4k6k-selftest
→ {"loaded":true,"offFlag":false,"offIdentico":true,"onLineas":4,"onUris":1,"onTagAntesDeUri":true}
```

Lectura: el módulo carga dentro del index real, la bandera nace apagada, con OFF el bloque es
idéntico, con ON añade **una** línea, deja **una** URI y el tag queda **antes** de la URI.

Historial de esa misma prueba (evidencia de que mide el código real, no una copia):

| Corrida | Resultado |
|---|---|
| worktree en `5376eef6` (código anterior) | `intentTag is not a function` |
| adaptador de fase 2 traído al worktree | `onAdded:["APE-4K6K-INTENT"]`, `reaKept:true` |
| primera versión del helper (no flag-aware) | **`offIdentico:false`** ⇒ defecto detectado |
| helper flag-aware (`force` solo para pruebas) | `offIdentico:true` ⇒ cerrado |

## 4 · Diff de staging

[`FASE2_STAGING.diff`](FASE2_STAGING.diff) — 8.547 B, **3 ficheros, +97/−3**:

| Fichero | Cambio |
|---|---|
| `frontend/index-v4.html` | +54: una línea de carga (`?v=20261120-fase2`) y el panel de invocación |
| `frontend/js/ape-v9/ape-4k6k-audit-adapter.js` | +35: `insertIntentTag` (flag-aware) y `version 1.1.0` |
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | +11/−1: el guard del emisor por canal |

## 5 · Presupuesto medido del hook (11.222 llamadas, un canal cada una)

```
OFF  llamadas=11222  total_ms=2,19   por_canal_us=0,195
ON   llamadas=11222  total_ms=45,04  por_canal_us=4,0    lineas_salida=4
```

OFF: **2,19 ms por lista completa** de 11.222 canales (0,2 µs por canal) — indistinguible del ruido.
ON: **45 ms una sola vez** por lista, añadiendo una línea por canal. No hay copia de la lista, ni
parseo adicional, ni memoria proporcional al fichero: el hook trabaja bloque por bloque, en el mismo
punto donde el generador ya construía la cadena.

## 6 · Lo que sigue sin medirse

- **Bytes de la lista completa OFF vs código previo**: requiere tu LAB JSON y una corrida de la UI.
  El argumento actual es estructural (una sentencia sustituida + identidad por referencia),
  no una comparación de ficheros de 700 MB.
- **Consumidor real del sidecar**: no existe uno probado; por eso la intención no entra en REA.
- **Privacidad de exportación en Windows**: `chmod(0600)` no aplica en NTFS; la exportación privada
  de staging debe usar un destino con ACL verificada (`icacls`) o fallar con motivo. Pendiente de
  definir el destino con el propietario.

## 7 · Comparación de bytes con el generador REAL y el LAB REAL

Arnés: `gen-4k6k-compare.js` (reusa los mocks y el `eval` de
`frontend/tests/e2e-bulletproof-full-audit.js`), LAB
`C:\Users\HFRC\Downloads\LAB_CALIBRATED_BULLETPROOF_20260418_210955.json` (579.602 B,
`profiles_calibrated` P0..P5), 10 canales P0×4/P1×3/P3×3.

El generador es **polimórfico por diseño** (LIST-ID, fingerprint, UA rotativa, tokens de evasión):
dos corridas idénticas dan 698 líneas distintas, así que comparar bytes crudos sin más es inválido.
El arnés fija las fuentes de azar (`Math.random` sembrado, `Date` fijo, `crypto`, `performance`,
`hrtime`) y **demuestra primero que es determinista**: dos corridas del mismo código dan el mismo
sha256 (`a24ef8db…`, 653.262 B).

| Estado | Bytes | Líneas | EXTINF | URIs | EXTSHIMOTT | Sidecar | sha256 |
|---|---|---|---|---|---|---|---|
| previo (sin hook) | 653.262 | 10.316 | 10 | 10 | 10 | 0 | `a24ef8db…` |
| cableado OFF | 653.262 | 10.316 | 10 | 10 | 10 | 0 | `a24ef8db…` |
| cableado ON | 661.232 | 10.326 | 10 | 10 | 10 | **10** | `c76d13c4…` |

```
previo == off              : true
on − sidecar == previo     : true
lineas añadidas por ON     : 10  (una por canal)
EXTSHIMOTT previo / on     : 10 / 10   (intacto)
URIs previo / on           : 10 / 10   (una por canal)
```

**Defecto que encontró esta prueba y que ninguna prueba sintética vio:**
el bloque real de un canal mide ~65 KB y **no acaba en la URI** (termina en
`#EXT-X-APE-CRYSTAL-UHD:...`). La primera versión de `insertIntentTag` exigía que la última línea
fuera la URI y por eso devolvía el bloque sin insertar (10 llamadas, 0 inserciones). Ahora localiza
la **única** línea de URI e inserta justo antes; con 0 o ≥2 URIs no toca el bloque.

Repro:
```
node IPTV_v5.4_MAX_AGGRESSION/artifacts/integracion-4k6k/gen-4k6k-compare.js \
  <generador.js> previo|off|on <salida.m3u8>
```