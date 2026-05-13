# Implementación de la integración APE Health Admission

**Autor:** Manus AI  
**Fecha:** 2026-04-16

## Objetivo operativo

Este paquete convierte el generador en un flujo de **publicación por admisión**. La lista final deja de emitir rutas estructuralmente inválidas por defecto y pasa a publicar solo rutas previamente clasificadas como saludables, priorizando **`.m3u8` + HLS real**. La lógica de perfil visible en la lista se mueve hacia un **resolver local** para no contaminar el origen con parámetros que pueden romper respuestas `200`.

## Archivos entregados

| Ruta | Función |
|---|---|
| `frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js` | Generador principal ya integrado con admisión por salud, filtro de canales admitidos y variantes seguras. |
| `frontend/js/ape-v9/health-runtime.js` | Runtime del navegador para cargar `admitted.json`, resolver URLs por perfil y filtrar canales. |
| `frontend/js/ape-v9/multi-server-fusion-v9.js` | Reemplazo del fallback ciego por ladder estable de perfiles `P1/P2/P3`. |
| `frontend/js/ape-v9/generation-controller.js` | Controlador UI para refrescar salud y generar listas admitidas. |
| `backend/health/catalog_refresh.py` | Refresca catálogos vivos de tivi-ott y ky-tv HLS. |
| `backend/health/health_checker.py` | Sondea candidatos, clasifica HLS real y produce `admitted.json`. |
| `backend/health/resolve_admitted.py` | Resolver `.m3u8` por `stream_id` con `profile` sin ensuciar el origen. |
| `backend/health/publication_gate.py` | Gate post-emisión para bloquear listas que no cumplan los umbrales. |
| `backend/health/config.example.json` | Configuración de ejemplo. |
| `scripts/apply_integration_patch.py` | Script reproducible para reaplicar el parche sobre otra copia del generador. |

## Qué cambia en el generador

La integración aplica cuatro cambios de arquitectura. Primero, `generateM3U8()` prepara el runtime de salud antes de generar. Segundo, `generateChannelEntry()` consulta la admisión y omite cualquier canal no admitido cuando `requireAdmission=true`. Tercero, las tres variantes del ladder dejan de hacer swap ciego `.ts ↔ .m3u8` y pasan a construirse como variantes de perfil controladas. Cuarto, la API pública del generador expone carga del mapa de admisión y estadísticas de salud.

> La decisión clave de esta integración es que el parámetro `profile` ya no debe viajar al origen salvo que vos lo permitas explícitamente. Para maximizar respuestas `200`, el perfil debe vivir en el **resolver local** y no en el upstream IPTV.

## Orden recomendado de despliegue

| Paso | Acción |
|---|---|
| 1 | Copiar `frontend/js/ape-v9/*.js` al proyecto. |
| 2 | Copiar `backend/health/*` al servidor que va a ejecutar health-check y resolver. |
| 3 | Duplicar `config.example.json` a `config.json` y completar credenciales reales. |
| 4 | Ejecutar `catalog_refresh.py` para materializar catálogos vivos. |
| 5 | Ejecutar `health_checker.py` para producir `admitted.json`. |
| 6 | Levantar `resolve_admitted.py` en modo `redirect` o `proxy`. |
| 7 | Configurar `window.APEHealthRuntime` con `admissionUrl`, `resolverBaseUrl` y `requireAdmission=true`. |
| 8 | Generar la lista desde UI o por llamada directa al generador. |
| 9 | Pasar la lista emitida por `publication_gate.py` antes de publicarla. |

## Comandos sugeridos

```bash
cp backend/health/config.example.json backend/health/config.json
python3.11 backend/health/catalog_refresh.py \
  --config backend/health/config.json \
  --out-dir backend/health/runtime

python3.11 backend/health/health_checker.py \
  --config backend/health/config.json \
  --catalog-dir backend/health/runtime \
  --out-dir backend/health/runtime \
  --db backend/health/runtime/gold_index.db

APE_ADMITTED_JSON=backend/health/runtime/admitted.json \
APE_RESOLVE_MODE=redirect \
python3.11 backend/health/resolve_admitted.py
```

## Inicialización mínima en frontend

```html
<script src="frontend/js/ape-v9/health-runtime.js"></script>
<script src="frontend/js/ape-v9/multi-server-fusion-v9.js"></script>
<script src="frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js"></script>
<script src="frontend/js/ape-v9/generation-controller.js"></script>
<script>
window.APEHealthRuntime.setConfig({
  admissionUrl: '/backend/health/runtime/admitted.json',
  resolverBaseUrl: 'https://tu-dominio-resolver',
  profileTransport: 'resolver',
  requireAdmission: true
});
</script>
```

## Criterios de aceptación

| Métrica | Objetivo |
|---|---:|
| URLs publicadas con `405` | `0` |
| URLs publicadas con `407` | tan bajo como permita el origen; idealmente fuera de publicación |
| Ratio `200` en gate post-emisión | `>= 0.99` |
| Ratio HLS real por `Content-Type` | `>= 0.90` |
| Canales sin admisión emitidos | `0` cuando `requireAdmission=true` |

## Decisiones intencionales de diseño

La integración **no** sigue intercambiando extensiones de manera ciega. Si un `.ts` debe ser convertido a `.m3u8`, eso ocurre únicamente cuando existe una evidencia previa en el índice admitido o cuando la ruta sale a través del resolver. Del mismo modo, el sistema no confunde `503` transitorio con invalidez estructural, porque el worker reintenta de forma controlada antes de decidir admisión.

La lista resultante tampoco depende de que todos los reproductores soporten la misma capa premium. La arquitectura admite una política de ladder visible `P1/P2/P3`, pero la publicación final siempre está anclada a la **mejor ruta realmente comprobada** para cada `stream_id`.
