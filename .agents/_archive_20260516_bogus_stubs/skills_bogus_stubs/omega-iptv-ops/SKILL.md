---
name: Skill omega-iptv-ops
description: Habilidad operativa encapsulada para ejecutar la auditoría de listas M3U8, enmascarar URLs de origen, verificar el Ecosistema OMEGA, diagnosticar DNS en reproductores y administrar DuckDNS a través de scripts y referencias aisladas.
---

# OMEGA IPTV Ops (Skill Encapsulada)

Esta skill consolida las operaciones de mantenimiento críticas ejecutadas por Ingeniería de Sistemas OMEGA (Pilar 5 y SSOT).

## Capacidades:

### 1. Auditoría M3U8 Forense Completa
- Utilizar `scripts/audit_full_m3u8.py` para aplicar el Balanced Scorecard (Score visual e integral del listado). Se espera un objetivo de 120/120.

### 2. Auditoría Estructural v10.4
- Utilizar `scripts/audit_structure_v10.py` para asegurar que el ADN de la lista sea legal bajo la regla de "RFC 8216 Strict Parser Compliance" impuesta por VLC/OTT Nav.

### 3. Enmascaramiento y Fallback Proxy (Cryptographic Masking)
- Emplear `scripts/mask_fallback_direct.py` para someter un enlace de proveedor de origen a validación HMAC, asegurando que la directiva `#EXT-X-APE-FALLBACK-DIRECT` no revele credenciales expuestas en la UI.

### 4. Soporte y Documentación Operativa
- `references/omega_architecture.md`: Manual del Single Source of Truth, jerarquías de resolución y cadenas de degradación automáticas del SSOT.
- `references/duckdns_setup.md`: Guía de mitigación local y automática para reestructurar la configuración de DNS cuando ocurre envenenamiento de caché o bloqueos del ISP.
