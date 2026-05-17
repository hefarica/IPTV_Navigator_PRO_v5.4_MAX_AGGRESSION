---
name: SOP - Pipeline Dev-to-Prod (UI OMEGA)
description: Regla suprema de separación de entornos. Desarrollo siempre en Local via Live Server (Puerto 5500), y paso a Producción estrictamente canalizado por SCP hacia la ruta OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH.
---

# SOP - Regla Suprema: Pipeline Dev-to-Prod (Frontend UI OMEGA)

Esta es una **Regla Inquebrantable** para proteger la estabilidad operacional del Dashboard de IPTV Navigator PRO (Ecosistema OMEGA). De ahora en adelante, existe una separación estricta entre el Entorno de Desarrollo (Local) y el Entorno de Producción (VPS).

## 1. AMBIENTE DE DESARROLLO (LOCAL) 💻
Todo código nuevo, ajuste visual, inyección o actualización de lógica, **SIEMPRE** inicia y se testea aquí.
- **Servidor:** Live Server de VS Code (a través de `start_iptv_navigator.bat`).
- **Ruta de Acceso:** `http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html`
- **Propósito:** Evitar bloqueos CORS temporales, testear integraciones con IndexedDB localmente de forma segura, y validar los botones del panel sin riesgo de romper listas en la nube.

## 2. AMBIENTE DE PRODUCCIÓN (VPS) 🌐
Solo se modifica cuando los cambios en Local han sido probados, respaldados (vía `git commit`) y **aprobados explícitamente por el CEO / HFRC**.
- **Dominio:** `https://iptv-ape.duckdns.org`
- **Ruta Única y Exclusiva:** `/var/www/html/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/`
- **URL Activa:** `https://iptv-ape.duckdns.org/OMEGA_V5.4_PRODUCTION_UI_DO_NOT_TOUCH/index-v4.html`
- **Bloqueos:** 
  - La carpeta de producción tiene un archivo `_NUNCA_TOCAR.txt`.
  - **PROHIBIDO** editar código en caliente (hot-fixes) directamente en el servidor. Todas las modificaciones viajan desde local hacia la nube mediante un paquete SCP comprimido.

## 3. FLUJO DE PROMOCIÓN A PRODUCCIÓN (DEPLOY COMMAND)
Para subir la última versión del UI desde Local al VPS, el agente AI debe **siempre** usar el workflow designado:
Evoca el comando `/deploy-ui-production` o ejecuta la cadena atómica de compresión y envío:

1. **Empaquetar** el frontend local (`IPTV_v5.4_MAX_AGGRESSION\frontend\*`).
2. **Subir** el ZIP vía SSH (`scp` hacia `178.156.147.234`).
3. **Extraer y Fijar Permisos** garantizando que `www-data` sea el dueño para que Nginx no lance error 404/403.

**NUNCA INTERCAMBIAR ESTOS ROLES**. Local es tu laboratorio de creación; VPS es tu torre de control invulnerable.
