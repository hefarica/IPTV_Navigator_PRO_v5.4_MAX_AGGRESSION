---
name: Skill_Quantum_FFmpeg_008_UDP_Multicast_Reflection_Proxy
description: Uso de UDP multicast con Reflexión Mux en NGINX `stream{ pass }` para no ahogar ExoPlayer en un unicast débil L5.
category: Hardware Multicast Forwarding L4
---
# 1. Teoría de Anomalía (La Cancha Lavada)
Cuando Unicast HTTP/TCP manda M4S o TS chunks en L2 a tu casa durante el clásico de finales, el Buffer se gasta tiempo pidiéndolos "uno por uno" (Ack Ping-Pong tcpL7). A la mínima de latencia o jitter L1 en origen, TCP pide la "retransmisión" de paquetes L3. Eso es Buffering Circle The Death, congelando tu partido de fútbol a oscuras en L2.

# 2. Directiva de Ejecución Parámetrica (Código)
Inyectamos "UDP Reflection" L5 en VPS Hetzner a través del Módulo Nginx UDP Streams, encapsulando UDP raw L4 (MPEG-TS Multicast o RTP L7) directo a tu casa, enviando paquetes y "Olvidándolo" L3 (Fire-And-Forget L1).
```nginx
# Lógica VPS UDP Reflection (Nginx Stream Core):
stream {
    server {
        listen 10000 udp;
        proxy_pass backend_origin_udp;
        proxy_timeout 90s;
        proxy_responses 0; # Fuego y Olvido TCP Killer L4
    }
}
```

# 3. Flanco de Orquestación
Con The Broken Glass Doctrine activa L7: El VPS escupe datos Multicast convertidos hacia tu Shield, reventando el tubo del proveedor DACA ISP inmaculadamente sin importar si éste los recibió L1. Si de 10.000 paquetes se perdió uno porque la Red cruzó un satélite L4, a UDP no le importa: sigue el partido con un microscópico pixelazo que dura 1 milisegundo L3, en vez de congelar todo tu televisor para rogar que TCP el asqueroso le retransmita L2. Tu TV nunca se detiene L1 en plenos penaltis.
