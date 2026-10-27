# EDGE EGRESS / RESOLVER — documento de decisión

**Estado: VIGENTE.** Si vas a tocar `ape_gateway.lua`, `ape_rebase_lib.lua` o cualquier lógica de egress del edge, **lee esto entero primero**.

> Este documento está **pinneado por SHA-256** en `_vps_stage/tests/edge_doctrine_assert.js`. Si cambia el gateway sin actualizar el pin de aquí, **el guard falla**. No es burocracia: es que el edge ya se rompió una vez por tocar el egress sin entenderlo.

---

## 1. La decisión, en una frase

**El `/cdn/` crudo NO funciona para los hosts que exigen egress/auth del proveedor (407). Esos hosts deben ir por el RESOLVER**, que aporta el `srv`/`ctx` que el edge no tiene.

---

## 2. La evidencia medida

### 2.1 `/cdn/` crudo → **407 persistente**

| Dato | Valor |
|---|---|
| Canales probados | **3281** y **698** |
| Código | **407** (Proxy Authentication Required) |
| Cuerpo del gateway | `reason: http_407`, **`all_upstreams_failed`** |
| ¿Depende del User-Agent? | **No** — independiente de UA |
| Latencia | **0,29 s** |
| ¿Reintentos? | **persistente**: no es un fallo intermitente |

**Interpretación**: el proveedor **exige egress/auth**. Un 407 con `all_upstreams_failed` significa que el edge **agotó sus orígenes** sin conseguir autenticarse. **No es un problema de red ni de método**: es que **al edge le falta la credencial de egress**.

### 2.2 Resolver → **200**

| Dato | Valor |
|---|---|
| Canales | **3281** y **698** (los mismos que fallan por `/cdn/`) |
| Código | **200** |
| Latencia | **0,21–0,23 s** |
| Tamaño | **8,6 KB** |
| Contenido | **`ape-profile`** y **`video-track`** presentes |

**Interpretación**: el resolver **sí autentica**. Aporta en la propia URL (`srv`, `ctx`, `sid`) lo que el `/cdn/` no tiene.

### 2.3 La forma del resolver (extraída del catálogo, no inventada)

```
https://iptv-ape.duckdns.org/resolve_quality.php
  ?ch=1&p=P3&mode=adaptive&list=<lista>
  &bw=50500000&buf=37500
  &origin=<host>&sid=1
  &srv=<base64>&ctx=<base64>
```

`srv` y `ctx` van en **base64** y son los que llevan el egress. **Sin ellos, el 407 es inevitable.**

---

## 3. La decisión

| Camino | Cuándo | Por qué |
|---|---|---|
| **Resolver** (`resolve_quality.php?…&srv=…&ctx=…`) | **hosts que exigen egress/auth** (los que dan 407 por `/cdn/`) | es el **único** que autentica contra el proveedor |
| `/cdn/` crudo | hosts **sin** exigencia de egress | más barato (sin PHP), pero **solo si el proveedor no lo rechaza** |

**Regla**: **si un host devuelve 407 por `/cdn/`, NO se insiste por `/cdn/`.** Se enruta por el resolver. Insistir es gastar peticiones contra un muro.

**Lo que NO se hace**: inventar un `srv`/`ctx` en el edge. Ese valor lo produce el resolver a partir de datos reales; fabricarlo daría un 407 igual pero con apariencia de haberlo intentado.

---

## 4. Comandos reproducibles

```bash
# 1 · /cdn/ crudo → se espera 407 en los hosts que exigen egress
curl -s -o /dev/null -w '%{http_code} %{time_starttransfer}\n' --max-time 10 \
  'https://iptv-ape.duckdns.org/cdn/<host>/live/<user>/<pass>/3281.m3u8'

# 2 · el MISMO canal por el resolver → se espera 200
curl -s -o /dev/null -w '%{http_code} %{time_starttransfer} %{size_download}\n' --max-time 15 \
  'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1&p=P3&mode=adaptive&list=<lista>&bw=50500000&buf=37500&origin=<host>&sid=1&srv=<b64>&ctx=<b64>'

# 3 · ¿el cuerpo del resolver trae la declaración?
curl -s --max-time 15 '<url del resolver>' | head -c 300 | grep -E 'ape-profile|video-track'
```

**Regla de medición**: **1 conexión a la vez, 1,5 s de pausa**. Medir en paralelo invalida la muestra.

---

## 5. Pin de integridad

| Fichero | SHA-256 |
|---|---|
| `_vps_stage/lua/ape_gateway.lua` | `81b44468c4f716bc9ab9d9c80ab4f1f2d6609ad5f3ffb48c14cd565c71408b99` |
| `_vps_stage/lua/ape_rebase_lib.lua` | `dbb73e22fcd86a5b530850c17fe08853b9ab7a7ab87513c894c5a88788045ea0` |

**Si tocas esos ficheros**: actualiza el SHA aquí **y** explica qué cambió en el egress. El guard `_vps_stage/tests/edge_doctrine_assert.js` falla si no lo haces.

---

## 6. Qué NO está demostrado (honestidad)

- **El cuerpo exacto del 407** (`reason: http_407`, `all_upstreams_failed`) lo midió el capitán, no yo. Lo cito como contexto, **no como medición propia**.
- **La tasa global de fallo del edge** sigue **[UNKNOWN]**: mis mediciones de `/cdn/` desde esta máquina devolvían todo en ~1 ms ⇒ **no llegaban al VPS** (t99 §5 y §10). **La salud real del edge exige el `access.log` del VPS** (ver §7).
- **El `srv`/`ctx` no lo he descifrado**: sé que son base64 y que sin ellos hay 407; **no afirmo qué contienen**.

---

## 7. Recuento del log 24 h — **[UNKNOWN]**

El contrato pedía contar 200/4xx/5xx de `/cdn/` en las últimas 24 h. **No lo he hecho: no tengo acceso de lectura a los logs del VPS.**

**Comando exacto para hacerlo** (ejecutar en el VPS, solo lectura):

```bash
# Distribución de códigos en /cdn/ durante 24 h
sudo grep '/cdn/' /var/log/nginx/access.log \
  | awk '{print $9}' | sort | uniq -c | sort -rn

# Solo los 407, con host destino
sudo grep '/cdn/' /var/log/nginx/access.log | awk '$9==407 {print $7}' \
  | sed 's#^/cdn/##; s#/.*##' | sort | uniq -c | sort -rn | head -20
```

Sin eso, cualquier tasa que publique **sería una muestra**, no la salud real.

---

## 8. Fecha y origen

- **Documento creado**: 2026-10-26 (sesión t100).
- **Evidencia de base**: mediciones de t99 + las del capitán sobre 3281 y 698.
- **Decisión**: el edge usa el egress (`srv`) **del resolver** para los hosts que exigen auth.
