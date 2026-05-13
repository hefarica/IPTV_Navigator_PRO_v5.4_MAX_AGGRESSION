---
description: Flujo de trabajo para auditar y prever bugs destructivos en el Resolver (SSRF False Positives y Zero-State Errors).
---

# Workflow: Auditoría de Resolver SSRF & Zero-State

Sigue este flujo de trabajo obligatoriamente después de cualquier modificación o despliegue en archivos críticos PHP (`resolve_quality_unified.php`, `ape_phantom_engine.php`, etc.) para asegurar que no se introducen bugs que colapsen el sistema en Producción.

## Paso 1: Auditoría Estática Zero-State (Anti 500)
Busca todos los arrays que se utilicen en el sistema y asegúrate de que no haya divisiones por cero potenciales.

1. Revisa los módulos como `ape_phantom_engine.php` y revisa que los arrays globales (`$ALL_UAS` o similares) contengan al menos un elemento.
2. Ejecuta Linter de PHP manual:
   ```bash
   php -l /var/www/html/resolve_quality_unified.php
   php -l /var/www/html/ape_phantom_engine.php
   ```

## Paso 2: Validación del Mecanismo SSRF
Verifica que NO existan funciones de bloqueo con arrays hardcodeados estáticos de dominios (whitelists). Hara Kiri fue eliminado completamente el 2026-04-11.

1. Busca en el código del resolver `gethostbyname` y valida que la solución dinámica esté bloqueando rangos IP locales y no nombres de dominio.
2. Comprueba explícitamente:
   - Que `10.0.0.0/8`, `192.168.0.0/16`, `127.0.0.0/8`, y `169.254.0.0/16` estén listados.
   - Que no existan `$allowed_domains = ['ejemplo.com']`.

## Paso 3: Lanzar Pruebas Funcionales en Vivo (Curl Probing)
Envía `curl` requests simulando la entrada SSRF para verificar que la red local se bloquea pero un dominio externo aleatorio se permite.

// turbo-all

1. Realizar una prueba SSRF Interna (Debería Fallar con HTTP 403)
   ```bash
   ssh -o StrictHostKeyChecking=no root@178.156.147.234 "curl -s -o /dev/null -w 'HTTP_CODE:%{http_code}' -m 10 -k 'https://localhost/resolve_quality_unified.php?url=http://169.254.169.254/latest/meta-data/'"
   ```
2. Realizar una prueba `200ok` de una fuente externa aleatoria (Debería Pasar con HTTP 200)
   ```bash
   ssh -o StrictHostKeyChecking=no root@178.156.147.234 "curl -s -o /dev/null -w 'HTTP_CODE:%{http_code}' -m 10 -k 'https://localhost/resolve_quality_unified.php?ch=test&profile=DEFAULT&mode=200ok&url=http%3A%2F%2Fgoogle.com%2Fvideo.m3u8&ext=.m3u8'"
   ```
3. Comprobar logs si hubo fallo:
   ```bash
   ssh -o StrictHostKeyChecking=no root@178.156.147.234 "tail -10 /var/log/php8.3-fpm.log"
   ```

## Paso 4: Trazabilidad y Confirmación
Si la salida de HTTP del paso 3 da:
- HTTP 403 para la IP `169.254.x.x` o localhost (Confirmado blindado contra SSRF malicioso)
- HTTP 200 (o 302 hacia la fuente real) para `google.com` (Confirmado que la protección admite proveedores iptv)
Entonces el blindaje está **Verificado y Completo**.
