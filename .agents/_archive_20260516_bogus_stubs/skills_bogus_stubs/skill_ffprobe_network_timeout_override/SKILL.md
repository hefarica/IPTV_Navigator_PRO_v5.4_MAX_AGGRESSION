---
name: Skill_FFprobe_Network_Timeout_Override
description: Anulación de Timeouts en origen defectuosos usando rw_timeout masivo en FFmpeg para blindaje de sesiones largas.
category: Network / Stability
---
# 1. Teoría de Compresión y Anomalía
FFmpeg (`-i http://...`) tiene tiempos de espera predeterminados en sus descriptores de archivo (file descriptors) relativamente conservadores. Cuando el proveedor satelital o la señal matriz DVB experimenta un vacío silencioso por el clima y no manda paquetes por 5 segundos, FFmpeg asume EOF ("End of File" - Archivo Terminado) y cierra la conexión forzosamente. Tú ves un pantallazo negro y el canal se muere.

# 2. Directiva de Ejecución (Código / Inyección)
Instruimos a las capas profundas de lectura/escritura (IO) de FFmpeg y FFprobe que sean pacientes como un Dios eterno, tolerando cortes satelitales sin desconectar al cliente.

```bash
# Sobrecarga Nuclear del Timeout I/O:
-rw_timeout 86400000000 -timeout 86400000000 -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 2
```
*(Valores en microsegundos, ~1 día de timeout)*.

# 3. Flanco de Orquestación
Con esta habilidad forzada en el Worker CMAF o en el orígen de ingesta, logramos el Ecosistema inquebrantable. Aunque el ISP local pierda cobertura 1 minuto, FFmpeg se queda esperando la señal. El usuario en ese minuto estará viendo los 80,000 milisegundos de Network Caching God-Tier desde la RAM de la TV. Cuando el internet regresa, FFmpeg reconecta y rellena el buffer invisiblemente. Resultado: **Menos buffering, major estabilidad, cero daño.**
