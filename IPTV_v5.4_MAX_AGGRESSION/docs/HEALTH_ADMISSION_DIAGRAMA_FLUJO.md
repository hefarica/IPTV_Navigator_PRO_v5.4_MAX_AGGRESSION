# APE Health Admission — Diagrama de flujo con fail-closed

## Filosofía de diseño

> **Preferir no publicar antes que publicar una lista que parezca completa pero reproduzca peor.**

La lista final **no debe construirse desde el catálogo crudo del panel IPTV**. Debe construirse desde un **conjunto de rutas admitidas, verificadas y normalizadas**.

## Cadena única de protección

```
health_checker.py → admitted.json → health-runtime.js (fail-closed) → publication_gate.py
      ↓                  ↓                      ↓                           ↓
 genera verdad     persiste verdad      aplica verdad             verifica verdad
```

Cada eslabón protege al siguiente. El fail-closed es el candado que impide que un fallo silencioso en el eslabón N contamine los eslabones N+1, N+2.

## Diagrama de flujo completo

```mermaid
flowchart TD
    A[Inicio: usuario pulsa Generar Lista] --> B[generation-controller.js\ninvoca generateHealthyList]
    B --> C[APEHealthRuntime.ensureReady]
    C --> D{admitted.json cargado\ny mapa con entradas}

    D -- Sí --> E[health-runtime.js\nfilterAdmittedChannels]
    D -- No --> F{requireAdmission = true}

    F -- No --> G[Modo permisivo\ncontinúa sin admisión estricta]
    F -- Sí --> H[Patch fail-closed\ndevuelve lista vacía]

    H --> I[Generación bloqueada]
    I --> J[No se publica lista]
    J --> K[Se protege el objetivo:\nno salen rutas no verificadas]

    E --> L[generateChannelEntry\nresuelve admisión por canal]
    G --> L
    L --> M{Canal admitido}
    M -- No --> N[Canal omitido]
    M -- Sí --> O[Normalizar URL\nlimpiar query runtime\npriorizar .m3u8]

    N --> P[Lista temporal solo con canales válidos]
    O --> P
    P --> Q[generateM3U8 emite lista]
    Q --> R[publication_gate.py\nmuestra 300 URLs]
    R --> S{Cumple umbrales}

    S -- No --> T[BLOCK\nlista queda pendiente\no se rechaza publicación]
    S -- Sí --> U[PUBLISH OK]

    U --> V[Resultado esperado:\n200 > 99%\n407 < 1%\n405 = 0\nHLS real >= 90%]

    style H fill:#ffdddd,stroke:#cc0000,stroke-width:2px
    style I fill:#ffdddd,stroke:#cc0000,stroke-width:2px
    style J fill:#ffdddd,stroke:#cc0000,stroke-width:2px
    style U fill:#ddffdd,stroke:#228b22,stroke-width:2px
    style V fill:#ddffdd,stroke:#228b22,stroke-width:2px
```

- **Nodos rojos** (H, I, J): trampa fail-closed. Si el mapa de admisión está vacío con `requireAdmission=true`, la publicación se bloquea.
- **Nodos verdes** (U, V): objetivo operativo final.
- Entre ellos hay **7 puntos de filtrado independientes** que garantizan que solo rutas verificadas lleguen a publicación.

## Por qué el patch fail-closed es el candado

| Elemento | Sin fail-closed | Con fail-closed |
|---|---|---|
| `admitted.json` vacío o fallido | Se publican canales no verificados | Se bloquea la publicación |
| Control sobre `200 > 99%` | Se pierde silenciosamente | Se preserva |
| Control sobre `407 < 1%` | Se degrada — vuelven rutas problemáticas | Se mantiene — solo pasan rutas admitidas |
| Coherencia del gate de publicación | Débil — puede ser bypass'd | Fuerte — bloqueo arriba del gate |
| Observabilidad de fallos | Oculta — silencio = "todo bien" | Explícita — lista vacía = hay que mirar |

## Código del patch aplicado

```javascript
filterAdmittedChannels(channels) {
    if (!this.config.requireAdmission) return channels;
    if (this.admittedMap.size === 0) {
        if (this.config.debug) console.warn('🚫 [APE-HEALTH] admittedMap empty with requireAdmission=true -> returning empty list (fail-closed)');
        return [];
    }
    return (channels || []).filter(channel => {
        const id = String(channel && (channel.stream_id || channel.id || channel.num || '') || '').trim();
        if (!id) return false;
        return this.admittedMap.has(`id:${id}`);
    });
}
```

Archivo: `frontend/js/ape-v9/health-runtime.js` (líneas 165-175)
