---
name: SOP - Resolución de Problemas DNS y Mantenimiento de DuckDNS
description: Procedimiento Operativo Estándar para diagnosticar fallos de DNS (NXDOMAIN, Server failed) en clientes y configurar el mantenimiento automático de DuckDNS en el VPS.
---
# SOP: Resolución de Problemas DNS y Mantenimiento de DuckDNS en Entornos de Streaming

**Versión:** 1.0  
**Fecha:** Abril 2026  
**Clasificación:** Confidencial / Técnico Nivel 2  

---

## 1. Propósito y Alcance

Este Procedimiento Operativo Estándar (SOP) establece las directrices para diagnosticar, resolver y prevenir problemas de resolución de nombres de dominio (DNS) en entornos de streaming IPTV, con un enfoque específico en la infraestructura basada en **DuckDNS**. 

El alcance cubre el diagnóstico de errores en reproductores (como VLC), la verificación de propagación DNS, la limpieza de cachés locales (Windows/Linux) y la configuración de rutinas de actualización automática en el VPS para garantizar que el dominio siempre apunte a la IP pública correcta.

## 2. Definiciones y Terminología

| Término | Definición |
|---------|------------|
| **DNS (Domain Name System)** | Sistema que traduce nombres de dominio legibles por humanos (ej. `iptv-ape.duckdns.org`) en direcciones IP numéricas (ej. `178.156.147.234`). |
| **DuckDNS** | Servicio de DNS dinámico (DDNS) gratuito que permite asociar un subdominio a una IP pública que puede cambiar con el tiempo. |
| **NXDOMAIN** | Código de error DNS que indica que el nombre de dominio consultado no existe o no tiene una IP asociada. |
| **Caché DNS** | Almacenamiento temporal de registros DNS en el sistema operativo local o en el router para acelerar futuras consultas. |

## 3. Diagnóstico de Errores en Reproductores

Cuando un reproductor como VLC falla al intentar reproducir un stream, es crucial identificar si el problema radica en la lista, en el servidor o en la red local.

### 3.1 Identificación del Error DNS en VLC

Un error de resolución DNS en VLC se presenta típicamente con los siguientes mensajes en el registro de errores (Mensajes > Árbol de módulos):

```text
main error: cannot resolve iptv-ape.duckdns.org port 443
access error: HTTP connection failure
```

**Interpretación:** VLC intentó conectarse al dominio `iptv-ape.duckdns.org` en el puerto 443 (HTTPS), pero el sistema operativo no pudo traducir el dominio a una dirección IP. Esto indica que el fallo ocurre **antes** de que cualquier solicitud HTTP alcance el servidor.

### 3.2 Diagnóstico Diferencial

Para descartar problemas del VPS o de la lista M3U8:

1.  **Prueba de acceso directo por IP:**
    Intenta acceder al endpoint de salud del SSOT usando directamente la IP del VPS en un navegador web o mediante `curl`:
    ```bash
    curl -I https://<IP_DEL_VPS>/resolve_quality_unified.php?mode=health -k
    ```
    Si la respuesta es `HTTP 200 OK`, el servidor y el backend están funcionando correctamente. El problema es exclusivamente de resolución DNS.

## 4. Procedimiento de Resolución Paso a Paso

Si se confirma que el problema es de resolución DNS, sigue estos pasos en orden secuencial.

### Paso 1: Verificar la Resolución Local

Desde la máquina cliente (Windows, Linux o macOS), utiliza la herramienta `nslookup` o `dig` para consultar el dominio.

**En Windows (CMD):**
```cmd
nslookup iptv-ape.duckdns.org
```

**En Linux/macOS (Terminal):**
```bash
dig +short iptv-ape.duckdns.org
```

**Resultados posibles:**
-   **Retorna la IP correcta:** El DNS funciona. El problema podría ser un bloqueo de firewall local o de antivirus.
-   **Retorna una IP antigua/incorrecta:** DuckDNS no se ha actualizado o la caché local está desactualizada (ir al Paso 2).
-   **Retorna NXDOMAIN o no retorna IP:** DuckDNS no tiene registro para el dominio o el servidor DNS local está fallando (ir al Paso 3).

### Paso 2: Limpiar la Caché DNS Local

Si `nslookup` retorna una IP incorrecta, limpia la caché DNS del sistema operativo.

**En Windows (CMD como Administrador):**
```cmd
ipconfig /flushdns
```

**En Linux (Systemd):**
```bash
sudo systemd-resolve --flush-caches
```
*(El comando exacto en Linux depende de la distribución y el gestor de red).*

**En macOS:**
```bash
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

Después de limpiar la caché, repite el Paso 1.

### Paso 3: Verificar y Actualizar DuckDNS

Si la resolución sigue fallando o devuelve NXDOMAIN, el problema está en los registros de DuckDNS.

1.  Accede a [https://www.duckdns.org](https://www.duckdns.org) e inicia sesión con tu cuenta.
2.  Verifica que el dominio (ej. `iptv-ape`) exista en tu panel.
3.  Compara la IP mostrada en el panel de DuckDNS con la IP pública actual de tu VPS.
4.  Si la IP es incorrecta, haz clic en **"update ip"** o ingresa la IP correcta manualmente y guarda los cambios.
5.  Espera entre 1 y 5 minutos para que los cambios se propaguen.

### Paso 4: Cambiar los Servidores DNS del Cliente

Si el panel de DuckDNS muestra la IP correcta pero la máquina cliente sigue sin poder resolver el dominio, es probable que el proveedor de servicios de Internet (ISP) esté bloqueando la resolución o tenga cachés muy agresivas.

Cambia los servidores DNS de la máquina cliente o del router a proveedores públicos confiables:

-   **Google DNS:** `8.8.8.8` y `8.8.4.4`
-   **Cloudflare DNS:** `1.1.1.1` y `1.0.0.1`

## 5. Mantenimiento y Automatización de DuckDNS en el VPS

Para evitar caídas recurrentes por cambios de IP pública (en caso de que el VPS no tenga IP estática), es obligatorio configurar un script de actualización automática en el VPS.

### 5.1 Configuración del Script de Actualización (Linux VPS)

1.  Crea un directorio para el script de DuckDNS:
    ```bash
    mkdir -p ~/duckdns
    cd ~/duckdns
    ```
2.  Crea el script de actualización `duck.sh`:
    ```bash
    nano duck.sh
    ```
3.  Pega el siguiente comando (reemplazando `TU_DOMINIO` y `TU_TOKEN` con los valores proporcionados en el panel de DuckDNS):
    ```bash
    echo url="https://www.duckdns.org/update?domains=TU_DOMINIO&token=TU_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -K -
    ```
4.  Haz que el script sea ejecutable:
    ```bash
    chmod 700 duck.sh
    ```

### 5.2 Configuración del Cron Job

Programa el script para que se ejecute cada 5 minutos.

1.  Abre el editor de cron:
    ```bash
    crontab -e
    ```
2.  Añade la siguiente línea al final del archivo:
    ```text
    */5 * * * * ~/duckdns/duck.sh >/dev/null 2>&1
    ```
3.  Guarda y cierra el archivo.
4.  Ejecuta el script manualmente por primera vez para verificar que funciona:
    ```bash
    ./duck.sh
    cat duck.log
    ```
    El archivo `duck.log` debe contener la palabra `OK`. Si contiene `KO`, verifica el dominio y el token.

## 6. Troubleshooting Adicional

| Síntoma | Causa Probable | Solución |
|---------|----------------|----------|
| `nslookup` funciona, pero VLC falla con `HTTP connection failure` | Bloqueo de Firewall/Antivirus o problema de certificado SSL. | Desactivar temporalmente el firewall local. Verificar la validez del certificado SSL en el VPS. |
| DuckDNS muestra IP correcta, pero algunos usuarios no pueden acceder | Propagación DNS incompleta o bloqueo por parte del ISP del usuario. | Indicar al usuario que cambie sus DNS a Google/Cloudflare (Paso 4) o esperar 24h para propagación global. |
| El log de `duck.sh` muestra `KO` constantemente | Token inválido, dominio incorrecto o cuenta suspendida. | Generar un nuevo token en DuckDNS y actualizar el script `duck.sh`. |

---
*Fin del Documento*
