---
name: Protocolo Anti-Deadlock Servidor Local (No-Cache Supreme)
description: Doctrina arquitectónica para erradicar el bloqueo silencioso de la GUI por caché agresivo de Chrome/Edge y deadlocks (cuelgues) del servidor Python interno bloqueando el puerto 5500.
---

# 🛑 SKILL: Protocolo Anti-Deadlock Servidor Local (No-Cache Supreme)

## 📌 Contexto y Problema Crítico

Cuando se ejecutan herramientas de terminal o se refresca agresivamente la ventana en un entorno local, el módulo incorporado de Python (`http.server`) puede sufrir un **deadlock (bloqueo)**. Al ser monohilo, una sola solicitud colgante o un archivo encolado causará que el servidor deje de responder por completo.

A su vez, navegadores como Edge y Chrome, al no recibir cabeceras de caché estrictas, **sirven versiones desactualizadas de los archivos por días**, ignorando completamente los cambios en archivos JS y HTML, lo que provoca la ilusión de que "los cambios no se están aplicando".

## 🛡️ Doctrina de Resolución (El Protocolo Quirúrgico)

Para garantizar un entorno de trabajo funcional al 100% y que los cambios recientes siempre surtan efecto:

1. **PROHIBIDO USAR `python -m http.server`**.
   * Bajo este protocolo, NUNCA se inicia el servidor de forma manual pelada.
   * La infraestructura local es propensa a deadlocks (bloqueos) y `ERR_EMPTY_RESPONSE` por saturación del buffer en el puerto 5500.

2. **USO OBLIGATORIO DEL DOGMA INMORTAL (`immortal_server.py`)**.
   * Se ha desarrollado el **Immortal Watchdog**, un script inteligente que envuelve el puerto 5500.
   * Ejecutar siempre `python immortal_server.py` (ubicado en la raíz donde esté `dev_server.py`).
   * Este script hace pings cada 3 segundos a nivel de socket. Si detecta un "Empty Response", Timeout o Deadlock, **matará silenciosamente el proceso colgante en milisegundos y levantará un servidor limpio al vuelo**.
   * **Resultado:** 0 segundos de downtime perceptibles por el usuario.

3. **INYECCIÓN DE DESTRUCTOR DE CACHÉ JS**.
   * Si la interfaz sigue renuente a actualizarse, forzar al DOM a hacer bypass al Service Worker con `window.location.reload(true)`.

### Instrucción Categórica para Agentes Futuros

Si el usuario reporta que "se cayó el panel local", "ERR_EMPTY_RESPONSE en el puerto 5500" o "se quedó colgado cargando":

1. El Agente NO DEBE DUDAR NI EDITAR MÁS ARCHIVOS.
2. Debe DEJAR de adivinar qué falló en el código y aplicar de inmediato este protocolo.
3. Se conectará a la terminal del usuario y se asegurará de arrancar `python immortal_server.py` para erradicar el problema de raíz, matando permanentemente la inestabilidad de la UI local en la fase de desarrollo.
