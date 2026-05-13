# Arquitectura APE v18.2

Esta referencia detalla los componentes clave de la arquitectura APE v18.2.

## Componentes Principales

- **ApeOmniOrchestrator v18.2**: Orquesta la creación de manifiestos CMAF universales.
- **Telchemy TVQM Engine**: Provee telemetría y métricas de calidad de video.
- **Unified CMAF+LCEVC Pipeline**: Gestiona la cadena de degradación de 7 niveles.
- **Universal Player Resolver**: Detecta más de 40 players y sus capacidades.
- **14 Skills OTT**: Mejoran la calidad visual con HDR10+, Dolby Vision, LCEVC SR, y más.

## Flujo de Trabajo

1.  **Detección**: `PlayerCapabilityResolver` identifica el player y sus capacidades.
2.  **Orquestación**: `ApeOmniOrchestrator` ensambla el manifiesto base.
3.  **Mejora**: Las skills OTT aplican capas de mejora (HDR, LCEVC, AI SR).
4.  **Telemetría**: `TelchemyTvqmEngine` calcula el VQS.
5.  **Entrega**: El `UnifiedPipeline` selecciona el formato óptimo y lo entrega, con fallback si es necesario.
