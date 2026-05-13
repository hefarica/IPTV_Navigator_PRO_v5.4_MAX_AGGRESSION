---
name: Skill_Anti_509_Blind_Resolution_Guard
description: Zero-Probe enforcement para no gatillar límite de ancho de banda del ISP en la fase de mapeo DNS/M3U8.
category: Security & Stability
---
# 1. Teoría de Compresión y Anomalía
El infame Error `509 Bandwidth Limit Exceeded` aparece cuando el cliente o el generador de listas M3U8 local hace Ping/Pruebas a 50 canales simultáneamente para generar el `channels_map.json`. El Xtream UI del proveedor entra en alerta de Defcon DDoS y asesina permanentemente la sesión IPTV del usuario (Account Ban).

# 2. Directiva de Ejecución (Código / Inyección)
La táctica Anti-509 dicta una resolución absolutamente "ciega" en M3U8. El generador jamás solicita cabeceras GET ni hace HEAD requests a las URLs originales durante el Zapping o refresco de Lista.

```javascript
/* M3U8 Generator Blindaje Anti-XHR Probe: */
const blindResolverUrl = `${VPS_ENDPOINT}/resolve_quality_unified.php?url=${encodeURIComponent(orgUrl)}`;
// Nunca verificar conectividad del orgUrl aquí. El cliente es ciego.
```

# 3. Flanco de Orquestación
Con el Zero-Probe Enforcement activado, NUNCA tocamos al API de la competencia hasta el preciso, exacto y definitivo milisegundo en que el cliente pulsa el botón "Play" en la Shield TV. Esto distribuye el consumo y mantiene las peticiones recurrentes ocultas. Protegemos al usuario, evadimos bans y mantenemos el God-Tier estable "Sin dañar Nada".
