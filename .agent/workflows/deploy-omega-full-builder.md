---
description: Flujo de trabajo maestro para construir y depurar un ecosistema M3U8 hacia el estándar OMEGA Absoluto.
---

# Deploy OMEGA Full Builder

Este workflow guía al Agente a inyectar el conocimiento de 5 niveles PhD y transformar cualquier ecosistema nativo en un motor de reconstrucción OMEGA Híbrido. Sigue meticulosamente este proceso:

## Etapa 1: Inserción del Orquestador (Generación Polimórfica)
- Usa el generador `omega_list_generator.py` ubicado en `iptv_ape_v4_full_builder/scripts/`.
- Reemplaza las directivas nativas del servidor IPTV (en `resolve_quality_unified.php`) con la compresión `#EXTHTTP` en JSON.
- Asegura que el Payload JSON dictamine Perfil, Framework 3D y Nivel de Red (`$ct`, `$profile`, `$auth`, `$sid`).
- Verifica que el M3U8 resulte ultraligero (2-5% del tamaño original) mediante los algoritmos de evasión.

## Etapa 2: Fusión Quirúrgica PHP (Reconstrucción OMEGA)
- Toma la clase `OmegaAbsoluteReconstructor` del archivo original `resolve_quality_OMEGA.php`.
- Inyéctala puramente sin optimizaciones ni mutilaciones.
- Captura el Request (Ej. modo directo "MODO 2" de XTREAM o MODO 1 de lista remota).
- Traduce cada token JSON recuperado en las 359 (ó 606+ completas) directivas exclusivas para Kodi, ExoPlayer y OTT Navigator.

## Etapa 3: Doctrina Anti-509 V3 intacta (El Firewall)
- El Resolver NUNCA hace POST/GET en línea al servidor original salvo el flujo XTREAM en caché.
- Toda la metadata OMEGA viaja dentro de la URL construyéndose hacia el player.
- Confirma que `X-APE-Omega-State: ACTIVE` figura en el HTTP HEADERS response.

## Etapa 4: Evasión L7 Híbrida (IP-Binding Detector)
- El entorno SSOT (v5.4+) debe operar en `Modo Híbrido CERO-302`.
- El sistema identificará inteligentemente si el upstream usa IP-Binding:
  - Si tiene IP-Binding activo → El Proxy devuelve **HTTP 302** `Location: [origen]` mitigando el 403.
  - Si es upstream estándar → El Proxy absorbe la señal y devuelve **HTTP 200 OK** inyectando `#EXTVLCOPT`.
- Verificar validación cacheada `/tmp/rq_ipbind_*.ipbind` en servidor.

**No comprometas ninguna de las doctrinas OMEGA** durante el despliegue y valida que la salida final reproduzca 4:4:4 12bit.
