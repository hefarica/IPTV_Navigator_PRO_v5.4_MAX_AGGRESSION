---
name: iptv-js-zip-auditor
description: Auditor forense para extraer "oro puro" de archivos ZIP que contienen scripts JS para ecosistemas IPTV/M3U8. Úsalo cuando el usuario pida analizar, destripar o auditar un archivo .zip para encontrar nuevas directivas, motores de evasión o lógicas que no están en la arquitectura OMEGA CRYSTAL actual, con el objetivo de integrarlos en una nueva capa enriquecida (V6).
---

# IPTV JS ZIP Auditor (OMEGA CRYSTAL V6 Enriquecimiento)

Esta habilidad encapsula el proceso de auditoría forense de archivos `.zip` que contienen código JavaScript para ecosistemas IPTV. Su propósito es identificar "oro puro": motores de próxima generación, heurísticas, evasión en tiempo real y lógicas criptográficas que pueden ser inyectadas como nuevas capas en el ecosistema OMEGA CRYSTAL.

## Cuándo usar esta habilidad

1. El usuario proporciona un archivo `.zip` con scripts JS y pide "destriparlo", "analizarlo" o "buscar oro puro".
2. El objetivo es enriquecer la arquitectura M3U8 existente (ej. pasar de 796 líneas V5 a >850 líneas V6).
3. Se necesita documentar qué directivas nuevas aporta el código analizado frente a lo que ya existe.

## Flujo de Trabajo

### Paso 1: Ejecutar el script de auditoría

Utiliza el script en Python incluido para analizar automáticamente el archivo ZIP y extraer los motores de "oro puro":

```bash
python /home/ubuntu/skills/iptv-js-zip-auditor/scripts/audit_js_zip.py /ruta/al/archivo.zip
```

El script buscará patrones de los 8 motores principales de V6 (Heurística, Córtex Runtime, TLS JA3/JA4, Xtream Exploit, VPN Suprema, QoS Dinámico, Smart Codec, JWT) y generará un archivo `audit_results.json`.

### Paso 2: Analizar los resultados

Revisa el output del script en la consola o lee el archivo `audit_results.json` generado.
Identifica qué motores se encontraron y qué directivas M3U8 proponen (ej. `#EXT-X-APE-CONTENT-CLASS`, `#EXT-X-APE-TLS-JA3-HASH`).

### Paso 3: Documentar el "Oro Puro"

Redacta un informe estructurado para el usuario que incluya:
1. Lo que OMEGA CRYSTAL ya tiene (para no duplicar).
2. El "oro puro" encontrado (clasificado por prioridad y motor).
3. Las nuevas directivas que se generarían a partir de este oro puro.
4. Una propuesta de evolución (ej. inyectar las nuevas directivas en capas L11, L12, L13 del M3U8).

### Paso 4: Ofrecer la integración

Pregunta al usuario si desea materializar esta nueva versión (ej. OMEGA CRYSTAL V6) integrando estas capas en el generador JS y actualizando la documentación/presentaciones correspondientes.

## Referencia de Capas de Enriquecimiento (V6)

Si se encuentran los motores, estas son las capas donde deben inyectarse:

- **Capa L11 (Heurística y Contexto)**: Directivas de clasificación de contenido y dispositivo objetivo.
- **Capa L12 (Coherencia TLS y Evasión)**: Directivas criptográficas (JA3/JA4) y estrategias del Córtex en tiempo real.
- **Capa L13 (Explotación y Rendimiento)**: Directivas para bypass de Xtream, prefetch agresivo y control de VPN.
