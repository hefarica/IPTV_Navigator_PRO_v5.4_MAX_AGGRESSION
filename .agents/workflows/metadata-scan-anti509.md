---
description: How to safely generate and scan M3U8 metadata avoiding Error 509
---

# Generación y Escaneo APE-META Inteligente (Blindaje 509)

Este flujo de trabajo (workflow) es de estricto cumplimiento al operar la interfaz de generación de listas IPTV para evitar el bloqueo del proveedor `line.tivi-ott.net` (Error 509 Bandwidth Limit Exceeded) asociado al motor FASE 5 (Metadata Intelligence).

## 1. El Riesgo (Error 509)
Las cuentas de Xtream Codes tienen un límite transaccional de conexiones simultáneas estrecho (usualmente 1 o 2). El motor APE-META analiza canales en lotes, lo que significa peticiones HTTP de metadatos concurrentes de 64KB. Un escaneo irresponsable saturará tu cupo temporalmente, bloqueando a OTT Navigator.

## 2. Instrucciones Funcionales de Interfaz
### Paso 1: Escaneo Disociado (Recomendado)
- **Carga de Perfil:** En `Gestor de Perfiles`, selecciona tu conjunto de configuraciones favorito.
- **Botón `Escanear Metadata`:** Haz clic en el botón de la barra inferior.
- **Acción del Servidor:** El VPS descargará secuencialmente bloques de manifiestos, calculando puntaje `Quality Score`, detectando `HDR` y `Bitrates` y devolviéndolo asíncronamente a tu IndexedDB.
- **Cierre Natural:** El proceso PHP finaliza su ciclo de vida y libera los sockets al llegar al 100%. No hay Zombis. Si sientes lentitud o quieres cancelar, **puedes refrescar la página**. El mecanismo `connection_aborted()` en el VPS aniquilará las descargas restantes al instante.

### Paso 2: Generación APE_TYPED_ARRAYS_ULTIMATE
- Una vez finalizado el pre-escaneo (o si decides saltártelo), oprime el botón rojo `APE_TYPED_ARRAYS_ULTIMATE`.
- El frontend unificará el mapa (Extrayendo metadatos guardados del caché) y construirá los DNA Tags (Ej: `#EXT-X-APE-META-[CODEC/VERIFIED]: true`) inyectándolos milimétricamente debajo de la cabecera `#EXTM3U` del `.m3u8` resultante.
- Esta inyección estática **blinda el streaming** de la infraestructura, ya que `resolve_quality.php` detectará que los puntajes existen y no forzará un sondeo HTTP hacia el origen.

### Paso 3: OTT Navigator (Zapping Puro)
- Carga el `.m3u8` final en tu reproductor.
- Al cargar la lista o hacer zapping rápido, el OTT Navigator iniciará sondas (pre-buffers). El "Blindaje Anti-509" en el Step 2b del VPS intercepta esto y **SILENCIA** la descarga del manifesto dinámico.
- Disfrutarás del *Zapping Perfecto a Velocidad de la Luz* sin estallar tu cuota con el proveedor, apalancándote siempre en la data que el motor del Frontend escaneó asíncronamente minutos atrás.
