# APE Universal Parser Stack · actualización 2026-11-25

**Archivo actualizado:** `frontend/js/ape-v9/parsers/ape-universal-parser-stack.js`  
**Antes:** 15.125 B · **Ahora:** 16.751 B · **SHA-256:** `06fe02fbee1ec952e5b6845a93a7a2718a5bb3012376f08b93e89f9338b99b3e`

## Cambios aplicados

1. `detectType()` recorre **líneas** en vez de usar `indexOf` sobre todo el texto:
   - un comentario o un valor de atributo que mencione `#EXT-X-STREAM-INF` ya **no** convierte un catálogo en master;
   - detecta master/media/catálogo por marcadores al principio de línea;
   - reconoce CRLF y no construye un array con el catálogo completo.
2. Nuevo tipo **`mixed_m3u`** para master + catálogo/media: se rechaza con `MIXED_PLAYLIST_TYPES` en vez de adivinar.
3. Guardas de dependencias: si faltan `APEHlsMasterParser`, `APEHlsMediaParser` o `APEParserNormalizer`, `parseAny()` devuelve `PARSER_DEPENDENCY_MISSING` y no finge canonical.

## Verificación

| Prueba | Resultado |
|---|---|
| `frontend/tests/ape-universal-parser-stack.test.js` | **12/12 PASS** |
| `frontend/tests/test-multi-parser.js` | **466 PASS · 0 FAIL** |
| `frontend/tests/ape-multiparser-conformance.test.js` | **9/9 PASS** |
| `node -c` parser stack | OK |
| `ape-universal-emit.test.js` | 107 PASS · **2 FAIL** de baseline histórico (`868821`→`871416`); el fallo no se tocó en esta tarea y no se presenta como verde |

## Estado de producción medido (antes de este cambio)

```
/parsers/ape-universal-parser-stack.js  200  15125 B  (versión anterior)
/parsers/ape-parser-generation-bridge.js 200 13092 B
/ape-universal-emit.js                  404
/ape-multi-parser.js                    404
```

Por eso la casilla `apeUniversalToggle` existía en el repo pero no podía funcionar en la app servida: faltaban el emisor y el multiparser. La pestaña local sí los tiene.

## Inventario de despliegue corregido

Se añadieron al inventario de `ape-deploy-hybrid.yml` y `ape-deploy-frontend.yml`:

- `js/ape-v9/parsers/ape-universal-parser-stack.js`
- `js/ape-v9/parsers/ape-parser-generation-bridge.js`
- `js/ape-v9/ape-universal-emit.js`
- `js/ape-v9/ape-multi-parser.js`
- `js/ape-v9/ape-multi-export-ui.js`

El workflow híbrido ejecuta `ape-universal-parser-stack.test.js` y verifica por HTTP `MIXED_PLAYLIST_TYPES`, `APE_UNIVERSAL_EMIT` y `APEMultiParser`.

## Pendiente

- **No se ha aplicado el despliegue**: producción sigue sirviendo el parser viejo y los 404. El `apply` de CI/CD está preparado y requiere confirmación explícita.
- El fallo 107/2 de `ape-universal-emit.test.js` es un baseline histórico; no se ha modificado el emisor ni la fixture para “hacerlo pasar”.
