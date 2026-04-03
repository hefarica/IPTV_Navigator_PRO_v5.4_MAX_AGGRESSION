---
name: Skill_Nginx_FastCGI_Buffering_Obliteration
description: Desactivar buffering a disco en `fastcgi` Nginx para evitar el encolamiento destructivo y el SSD Thrashing.
category: VPS Infrastructure / Nginx
---
# 1. Teoría de Compresión y Anomalía
Cuando `resolve_quality_unified.php` sirve un stream directo (proxy-pass) de una película 4K de 50GB en vivo, Nginx por defecto intenta ayudar al disco RAM de PHP bajando el flujo y guardándolo en la carpeta temporal `/var/lib/nginx/fastcgi`. Esto destruye el I/O del disco SSD VPS en minutos, y hace que el cliente espere latencias masivas mientras Nginx "escribe y luego lee".

# 2. Directiva de Ejecución (Código / Inyección)
Se debe volar por los aires el proxy memory system de FastCGI en la zona específica de streaming.

```nginx
# Doctrina Anti-SSD Thrashing Obligatoria:
location ~ \.php$ {
    fastcgi_buffering off;
    fastcgi_request_buffering off;
    fastcgi_param HTTP_CONNECTION close; 
    # (El close aquí es al backend local PHP, asegurando dump rápido).
}
```

# 3. Flanco de Orquestación
Al desactivar `fastcgi_buffering`, los 50 Megabytes por segundo de HEVC que descarga el cURL de PHP son escupidos directamente por Nginx a la tarjeta de red (NIC) hacia la Shield TV del usuario, viajando a la velocidad de la luz en RAM. La latencia se desploma, el desgaste del disco Hetzner VPS llega a CERO, y el video vuela ininterrumpido.
