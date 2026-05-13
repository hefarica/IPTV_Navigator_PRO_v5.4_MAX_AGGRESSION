---
name: Skill_TCP_Nodelay_Backend_Override
description: Aniquilación del Algoritmo de Nagle en Nginx/PHP para Flujos de Streaming L7.
category: Nginx / Network
---
# 1. Teoría de Compresión y Anomalía
El Algoritmo de Nagle ensambla pequeños paquetes de red en paquetes más grandes de 1500 bytes (MTU) para "ahorrar" ancho de banda. En el transporte de CMAF de baja latencia donde emitimos `moof` atoms de milisegundos, retrasar la entrega en espera de acumular un MTU completo causa fluctuaciones fatales en el Jitter de red, desestabilizando el reproductor.

# 2. Directiva de Ejecución (Código / Inyección)
Obligamos a Nginx (o el backend que transporta el resolver) a despachar los paquetes de red inmediatamente.

```nginx
# Doctrina de Nginx para CMAF L7:
location ~ \.php$ {
    tcp_nodelay on;      # Matar Nagle
    tcp_nopush off;      # Eyectar paquetes incompletos IP
    fastcgi_buffering off; # El proxy nunca frena el flujo a disco
    fastcgi_keep_conn on;
}
```

# 3. Flanco de Orquestación
Esta es una regla inmutable en el Servidor VPS Hetzner de APE. Empuje limpio y crudo. El video HEVC a 300 Mbps pasa como un tubo perfecto sin ser obstaculizado o repaquetado a nivel kernel por Linux, reduciendo la latencia de buffering y las interrupciones del Player.
