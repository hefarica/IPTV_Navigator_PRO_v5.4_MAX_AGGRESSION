# 🔐 Dynamic Proxy Authentication System

## Descripción

Sistema de autenticación de proxy dinámico para IPTV Navigator PRO.
Soporta múltiples proveedores IPTV con credenciales cifradas en JWT.

## Componentes

### Cliente (JavaScript)

- `proxy-auth-module.js` - Módulo de autenticación (539 líneas)
  - Detección HTTP 407
  - Reintentos automáticos
  - Soporte Basic/NTLM/Digest/Custom

### Servidor (PHP)

- `proxy-auth-server.php` - Servidor de autenticación (503 líneas)
  - Gestión de providers
  - Generación de tokens con credenciales cifradas
  - Cifrado AES-256-GCM

## Estructura de Provider

```json
{
  "id": "provider_1",
  "name": "Provider Premium",
  "domain": "premium.iptv.net",
  "proxy_host": "proxy1.iptv.net",
  "proxy_port": 8080,
  "proxy_user": "user_premium",
  "proxy_pass": "pass_premium",
  "proxy_auth_type": "basic",
  "priority": 1,
  "enabled": true
}
```

## Campos JWT CAPA 7 (Proxy Auth)

- `proxy_enabled` - Activar autenticación
- `proxy_host` - Host del proxy
- `proxy_port` - Puerto del proxy
- `proxy_user` - Usuario (cifrado AES-256-GCM)
- `proxy_pass` - Contraseña (cifrada AES-256-GCM)
- `proxy_auth_type` - Método: basic/ntlm/digest/custom
- `proxy_retry_407` - Reintentar en error 407
- `provider_id` - ID del provider seleccionado

## Uso

### JavaScript (Cliente)

```javascript
const proxyAuth = new ProxyAuthenticationModule({
    maxRetries: 3,
    retryDelay: 1000
});

const response = await fetch(url);
if (proxyAuth.detectProxyAuthRequired(response).requiresAuth) {
    response = await proxyAuth.retryWithAuthentication(url, options, jwtToken);
}
```

### PHP (Servidor)

```php
$server = new ProxyAuthenticationServer();
$tokenData = $server->generateTokenWithProxyAuth($channelId, 'P3');
$url = $server->generateStreamUrl($channelId, '/live/stream.m3u8');
```

## Versión

- **Módulo:** 2.0.0
- **Fecha:** 2026-02-02
- **Estado:** ✅ PRODUCCIÓN
