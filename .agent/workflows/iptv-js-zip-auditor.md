---
description: Pipeline Maestro para usar iptv-js-zip-auditor y destripar archivos .zip buscando código fuente y heurísticas
---

# Workflow: IPTV JS ZIP Auditor (iptv-js-zip-auditor)

Este flujo de trabajo se emplea cada vez que el usuario suba, descargue o proporcione un archivo `.zip` lleno de scripts JS, APIs nativas, o binarios de IPTV y pida auditarlo, destriparlo o "buscar oro puro".

## Paso 1: Preparación del Target
Asegurarse de que el archivo ZIP proporcionado esté en una ruta accesible.

## Paso 2: Análisis con la Skill OMEGA
1. Localiza el script de análisis que se encuentra en la skill `iptv-js-zip-auditor` (descomprimido en `.agent/skills/iptv-js-zip-auditor/scripts/audit_js_zip.py`).
2. Ejecuta el script contra el objetivo. Ejemplo en el sistema local:
   ```powershell
   python C:\Users\HFRC\Desktop\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\.agent\skills\iptv-js-zip-auditor\scripts\audit_js_zip.py "ruta_al_zip"
   ```

## Paso 3: Clasificación de Oro Puro (L11, L12, L13)
Evalúa los componentes encontrados por el script de auditoría, priorizando los 8 motores de OMEGA V6:
- Heurística y Córtex Runtime.
- Coherencia TLS (JA3/JA4).
- Extracción Xtream y Bypass.
- VPN Suprema P2P.
- QoS Dinámico y BBR.
- Reducción de Artefactos (AI).
- JWT Signatures.

## Paso 4: Output al Usuario
Produce un informe indicando:
1. Qué motores de los encontrados *ya existen* en nuestro generador V5 (`m3u8-typed-arrays-ultimate.js`).
2. Cuáles son fragmentos de **"Oro Puro"** nuevos y deben integrarse a las líneas 800+.
3. Plan de inyección recomendando las Capas L11, L12 y L13.
