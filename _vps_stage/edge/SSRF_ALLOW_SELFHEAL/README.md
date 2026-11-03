# SSRF_ALLOW_SELFHEAL · [t95]

**Estado: NO APLICADO.** Este directorio contiene el parche, el plan de prueba y el rollback para **aprobación del propietario**.

## El problema que resuelve

| Hoy | Consecuencia |
|---|---|
| Allowlist con **1 host** (`line.tivi-ott.net`) | cualquier proveedor nuevo se **bloquea** (403) |
| Bypass `remote_addr == "127.0.0.1"` en `host_allowed()` | **el SSRF está abierto**: `/cdn/127.0.0.1:8088/_ape/health` → **200** (medido en t93) |
| **887 canales (32,2%)** dependen de ese bypass | quitar el bypass sin completar la lista **apagaría un tercio del catálogo** |

→ La allowlist era una **puerta** que apagaba canales, y el bypass que la compensaba abría SSRF. Hay que **invertir el modelo**.

## El modelo nuevo

```
DENY  → SOLO rangos privados/reservados (SSRF). Nunca un host público.
ALLOW → cualquier host público, SIEMPRE, en el mismo request.
REGISTRO → el host desconocido se anota en el shared dict y se persiste
           de forma ASÍNCRONA en /etc/nginx/ape-hosts-allow.d/<host>.
```

**La allowlist deja de ser puerta y pasa a ser registro.** Un proveedor nuevo **no puede** apagar un canal: si está en las listas generadas, va derecho.

## Qué cambia en `ape_gateway.lua`

| Antes | Después |
|---|---|
| `host_allowed()` devolvía `true` solo si el host estaba en `ALLOW_FILE`, **o** si el cliente era `127.0.0.1` | `host_allowed()` devuelve `false` **solo si el host es privado**; si es público, **registra y devuelve `true`** |
| Bypass por **IP del cliente** (`remote_addr`) | **Eliminado**. El guard mira el **HOST DESTINO**, nunca la IP del cliente |
| 403 `host_not_allowed` si la lista no lo tenía | 403 `private_range_blocked` **solo** para rangos privados |

**Clave del diseño**: el hop interno 443→8088 por loopback **sigue funcionando** porque el guard evalúa el **host destino** (`line.tivi-ott.net` → público → permitido), no la IP del cliente. Y `/cdn/127.0.0.1:8088/...` se bloquea porque **el destino literal es privado**.

## Ficheros

| Fichero | Qué es |
|---|---|
| `../lua/ape_gateway.lua` | **El parche aplicado al fichero fuente** (revisable con `git diff`) |
| `selfheal_persist.lua` | `log_by_lua` que **drena la cola** y escribe `/etc/nginx/ape-hosts-allow.d/<host>` fuera de la fase de la petición |
| `TEST_PLAN.md` | 12 pruebas con resultado esperado |
| `ROLLBACK.md` | Cómo volver atrás **y por qué hay que re-aplicar después** |

## ⚠️ Aviso crítico antes de aprobar

1. **`luac` no está disponible en el host de trabajo** ⇒ **el parche NO está verificado sintácticamente aquí**. Antes de aplicar: `luac -p ape_gateway.lua` en el VPS (o en cualquier host con Lua 5.1/LuaJIT).
2. **El `ape_gateway.lua` desplegado DIFIERE del repo** (inventario t51/t56: 3 `.lua` difieren; éste es uno). **El parche debe reconciliarse contra el fichero vivo** antes de aplicarlo, o se pisará lo que hay desplegado.
3. La persistencia asíncrona necesita el `log_by_lua` **declarado en la config**; sin él, el registro vive solo en el shared dict (funciona, pero se pierde al reiniciar).
