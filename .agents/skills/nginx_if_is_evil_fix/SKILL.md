---
name: "Nginx 'If Is Evil' — Fix para FastCGI + OPTIONS Preflight"
description: "Corrección del bug conocido de Nginx donde un bloque if(OPTIONS) dentro de location ~\\.php$ con fastcgi_pass causa HTTP 500 en peticiones GET normales"
---

# Nginx "If Is Evil" — FastCGI Fix

## Problema
Un bloque `if ($request_method = OPTIONS) { return 204; }` **dentro** de `location ~ \.php$` que también contiene `fastcgi_pass` causa que Nginx cree un sub-request interno que **no hereda** el `fastcgi_pass`. El resultado: HTTP 500 en peticiones GET normales.

## Configuración ROTA (causa 500)
```nginx
location ~ \.php$ {
    # ⚠️ EVIL: if dentro de FastCGI context
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        return 204;
    }

    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    include snippets/fastcgi-php.conf;
    include fastcgi_params;
}
```

## Configuración CORREGIDA
```nginx
# OPTIONS preflight SEPARADO del bloque FastCGI
location ~ \.php$ {
    # Mover OPTIONS fuera del contexto FastCGI
    # Usar un bloque location separado para CORS preflight

    fastcgi_pass unix:/run/php/php8.3-fpm.sock;
    include snippets/fastcgi-php.conf;
    include fastcgi_params;
    fastcgi_read_timeout 30s;

    # CORS headers se inyectan en el script PHP, NO aquí
}

# CORS Preflight global (fuera de location ~ \.php$)
location @cors_preflight {
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "*" always;
    add_header Access-Control-Max-Age 86400 always;
    return 204;
}
```

## Verificación
```bash
# Verificar que la configuración es válida
nginx -t

# Recargar Nginx
systemctl reload nginx

# Probar que PHP responde correctamente
curl -s -o /dev/null -w '%{http_code}' 'https://iptv-ape.duckdns.org/resolve_quality.php?ch=1198'
```

## Regla de Oro
> **NUNCA usar `if` con `return` dentro de un bloque `location` que contenga `fastcgi_pass`, `proxy_pass` o `uwsgi_pass`.** El `if` de Nginx no es un condicional real — es una directiva de rewrite engine que crea sub-requests con comportamiento impredecible.

## Referencia
- [Nginx Wiki: If Is Evil](https://www.nginx.com/resources/wiki/start/topics/depth/ifisevil/)
- Archivo de configuración: `/etc/nginx/sites-enabled/default`
- Socket PHP-FPM: `/run/php/php8.3-fpm.sock`
