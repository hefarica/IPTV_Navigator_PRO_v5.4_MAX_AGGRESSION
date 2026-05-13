---
name: SOP - Guía Completa de Configuración de DuckDNS
description: Guía exhaustiva para la configuración, asignación y automatización de DuckDNS en entornos de streaming, incluyendo integración con la arquitectura OMEGA (inject_phantom_single_url.py) y especificaciones técnicas de la API.
---

# Guía Completa de Configuración de DuckDNS para Entornos de Streaming

**Versión:** 1.0  
**Fecha:** Abril 2026  
**Clasificación:** Público / Soporte Técnico  

---

## 1. Introducción

DuckDNS es un servicio de DNS dinámico (DDNS) gratuito alojado en AWS que permite asociar una dirección IP pública (que puede cambiar periódicamente) a un subdominio fijo (ej. `iptv-ape.duckdns.org`). En el ecosistema OMEGA, esto garantiza que la lista M3U8 y el Motor Polimórfico (SSOT) siempre puedan comunicarse, independientemente de los cambios de IP del VPS.

Esta guía detalla el proceso completo: desde la creación de la cuenta hasta la automatización en el servidor VPS.

---

## 2. Creación de Cuenta y Registro del Dominio

### Paso 1: Iniciar Sesión en DuckDNS
1. Navega a [https://www.duckdns.org](https://www.duckdns.org).
2. DuckDNS no utiliza contraseñas propias. Debes iniciar sesión utilizando una de las cuentas OAuth soportadas:
   - Google (Recomendado)
   - GitHub
   - Twitter (X)
   - Persona

### Paso 2: Crear el Subdominio
1. Una vez logueado, verás la interfaz principal con tu **Token** (una cadena alfanumérica larga, ej. `a7c4d0ad-114e-40ef-ba1d-d217904a50f2`). **Guarda este token en un lugar seguro.**
2. En la sección "sub domain", ingresa el nombre que deseas para tu ecosistema (ej. `iptv-ape`).
3. Haz clic en el botón verde **"add domain"**.
4. El dominio aparecerá en la lista inferior, mostrando la IP pública actual desde la que estás navegando.

### Paso 3: Asignar la IP del VPS
1. En la lista de dominios, localiza el dominio recién creado.
2. En el campo "current ip", borra la IP actual e ingresa la **IP pública estática de tu VPS** (ej. `178.156.147.234`).
3. Haz clic en **"update ip"**.

---

## 3. Automatización en el Servidor VPS (Linux)

Si tu VPS tiene una IP dinámica (cambia al reiniciar) o simplemente quieres asegurar la resiliencia del sistema, debes configurar un script que le avise a DuckDNS cuál es tu IP actual cada 5 minutos.

### Paso 1: Crear el Script de Actualización
Conéctate a tu VPS por SSH y ejecuta los siguientes comandos:

1. Crea un directorio oculto para DuckDNS:
   ```bash
   mkdir ~/duckdns
   cd ~/duckdns
   ```
2. Crea el archivo del script:
   ```bash
   nano duck.sh
   ```
3. Pega el siguiente comando exacto. **Debes reemplazar `TU_DOMINIO` por el subdominio que creaste (sin el .duckdns.org) y `TU_TOKEN` por el token de tu cuenta:**
   ```bash
   echo url="https://www.duckdns.org/update?domains=TU_DOMINIO&token=TU_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
   ```
   *(Nota: Dejar el parámetro `ip=` en blanco hace que DuckDNS autodetecte la IP pública desde la que se hace la petición).*
4. Guarda y cierra el archivo (`CTRL+O`, `Enter`, `CTRL+X`).
5. Otorga permisos de ejecución al script:
   ```bash
   chmod 700 duck.sh
   ```

### Paso 2: Programar la Tarea (Cron Job)
Para que el script se ejecute automáticamente en segundo plano:

1. Abre el editor de tareas programadas:
   ```bash
   crontab -e
   ```
2. Al final del archivo, añade esta línea para que se ejecute cada 5 minutos:
   ```text
   */5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
   ```
3. Guarda y cierra el archivo.

### Paso 3: Verificar el Funcionamiento
1. Ejecuta el script manualmente por primera vez:
   ```bash
   ./duck.sh
   ```
2. Revisa el archivo de registro generado:
   ```bash
   cat duck.log
   ```
3. Si el resultado es **`OK`**, la configuración es perfecta. Si el resultado es **`KO`**, revisa que el dominio y el token en el script sean exactamente los de tu cuenta.

---

## 4. Integración con el Ecosistema OMEGA

Una vez que el dominio está activo y apuntando al VPS, debes integrarlo en el generador de listas.

1. Abre el archivo `inject_phantom_single_url.py`.
2. Localiza la constante `DEFAULT_PROXY_BASE`.
3. Actualiza la URL para usar tu nuevo dominio de DuckDNS con protocolo HTTPS:
   ```python
   DEFAULT_PROXY_BASE = "https://iptv-ape.duckdns.org/resolve_quality_unified.php"
   ```
4. Genera la lista M3U8 nuevamente. Ahora todos los canales apuntarán a tu dominio dinámico.

---

## 5. Especificaciones Técnicas de la API (Referencia Avanzada)

DuckDNS permite actualizar registros a través de una simple petición GET HTTP/HTTPS.

**URL Base:**
`https://www.duckdns.org/update`

**Parámetros Soportados:**
- `domains` (Requerido): Lista separada por comas de subdominios a actualizar.
- `token` (Requerido): Token de la cuenta.
- `ip` (Opcional): IPv4 o IPv6 específica. Si se omite, se autodetecta.
- `ipv6` (Opcional): IPv6 específica.
- `verbose` (Opcional): Si es `true`, retorna información detallada en lugar de solo `OK`.
- `clear` (Opcional): Si es `true`, elimina la IP asociada al dominio.

**Ejemplo de Petición Verbose:**
```bash
curl "https://www.duckdns.org/update?domains=iptv-ape&token=a7c4d0ad-114e-40ef-ba1d-d217904a50f2&verbose=true"
```
**Respuesta:**
```text
OK
178.156.147.234
UPDATED
```
