---
name: backup_master_v86_god_tier
description: Protocolo de resguardo inmutable y empaquetamiento del ecosistema IPTV Navigator PRO en su versión V86.0 GOD-TIER, garantizando la preservación de todos los parches críticos (ApeModuleManager, Ghost Protocol, resolve.php, cmaf_worker.php) para siempre.
---

# Protocolo V86.0 GOD-TIER (Master Backup & Resilience)

## Objetivo

Asegurar y preservar matemáticamente el ecosistema IPTV Navigator PRO en su estado de perfección (Nivel 1% de Invencibilidad). Esta habilidad garantiza que nunca se pierda el progreso de la erradicación del "Blind Spot" de Ghost Protocol, la inyección del entorno DASH-XML, el Omni-Relay y la reparación de los errores 500 en VPS.

## Contexto Histórico de la Versión (Lo que nunca se debe olvidar)

Durante la auditoría del 3 de Marzo de 2026, el ecosistema alcanzó la perfección tras descubrir los siguientes fallos críticos que fueron subsanados:

1. **Fuga en Ghost Protocol:** `ApeModuleManager` no lograba activar módulos sin variable global (como `ghost-protocol`), saltándose la ofuscación y revelando etiquetas `#EXT-X-APE-`.
2. **Error Tipográfico en Motor:** El motor de M3U8 (`m3u8-typed-arrays-ultimate.js`) buscaba un ID erróneo (`evasion-ghost`) en vez del oficial (`ghost-protocol`).
3. **Error 500 VPS en Omni-Protocol:** El nuevo proxy dual en el VPS requería la extensión `php-curl` que no estaba presente en PHP 8.3 de Hetzner, y variables nulas de PHP (`$ch`, `$pReq`) colapsaban el entorno DASH.
Todas estas amenazas fueron purgadas, resultando en un blindaje del 100% DPI y evasión anti-ISP total.

## Procedimiento (Paso a Paso)

Cuando se invoque esta habilidad para realizar o restaurar el Backup GOD-TIER, ejecuta exhaustivamente los siguientes pasos:

1. **Asegurar la ubicación:** Valida que te encuentras en el directorio raíz del entorno de trabajo de `IPTV_Navigator_PRO`.
2. **Ejecutar el Compresor Maestro:** Ejecuta el script de PowerShell incluido en esta habilidad (`scripts/pack_v86_god_tier.ps1`). Este script generará un archivo `.zip` comprimiendo los directorios críticos:
   - `iptv_nav/` (Todos los scripts Frontend y Backend VPS actualizados)
   - Archivos de configuración y de ecosistema.
3. **Validación:** Confirma que el archivo comprimido `V86.0-GOD-TIER_Master_Backup_[Fecha].zip` ha sido generado en la raíz del Escritorio o en la carpeta `backups/`.
4. **Notificación Militar:** Utiliza la herramienta `notify_user` informando que el ecosistema ha sido blindado y resguardado para la historia.

## Reglas Estrictas

- **NUNCA** debes sobreescribir el backup V86.0 original si el usuario realiza modificaciones experimentales tras la fecha de consolidación.
- **SIEMPRE** debes recordar al usuario que este backup incluye la versión perfecta de `ApeModuleManager.js`. Si algo se rompe en el futuro, este será el punto de restauración dorado.
- **NUNCA** modificar los archivos PHP del VPS local sin cerciorarse de re-ejecutar esta habilidad inmediatamente después, para asegurar la paridad de versiones.
