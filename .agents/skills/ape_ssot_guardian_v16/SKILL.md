---
description: Doctrina Absoluta SSOT - Gestor de Perfiles APE v9.0 como Autoridad Máxima y Telemetría Guardian v16
---

# APE GUARDIAN ENGINE v16 & SSOT PROFILE DOCTRINE

## 1. Doctrina de la Fuente Única de la Verdad (SSOT)
**Regla Inmutable:** El `Gestor de Perfiles APE v9.0` (o su equivalente en frontend `ape-profiles-config-v5.js`) es LA ÚNICA entidad autorizada para definir, clasificar y parametrizar los perfiles de reproducción (P0 a P5). 

- **El Backend (Resolver PHP) NO adivina ni parametriza:** Debe consumir obligatoriamente las directrices del perfil proveídas por el Frontend.
- Todas las latencias, targets de buffer, resoluciones límite y tácticas de evasión son un reflejo EXACTO de los parámetros generados en el frontend al momento de compilar el archivo M3U8 (`_inferProfile` o `detectProfile`).
- Esta doctrina erradica el "código fantasma" o "valores hardcodeados en PHP" que asumen buffers incorrectos para conexiones pobres. Si dice `20s target`, son 20s.

## 2. Pauta de Degradación y Escalamiento
Si los parámetros de la semilla del Gestor de Perfiles fallan durante la ejecución del Backend (ej: el reproductor ExoPlayer estrangula la red intentando pedir P1 en una conexión lenta):
1. **Fallback Strict Protocol:** El Backend degrada el pipeline (P1 -> P2 -> P3 -> HLS -> TS-Direct).
2. **Guardian Reporter:** El cambio OBLIGATORIAMENTE debe registrarse en la Memoria RAM del servidor (`/dev/shm/guardian_exchange.json`).
3. **No Muta la Semilla:** El backend no cambia la lista ni asume la "verdad". Aplica el parche al vuelo y dispara la sugerencia a la telemetría.

## 3. Guardian Telemetry Exchange (El Panel)
El panel **"🛡️ APE Guardian Engine v16"** introducido en la UI (`index-v4.html`) es el Hub de Diagnóstico. Tiene el propósito de educar al usuario (operador u orquestador) permitiéndole visualizar cómo las configuraciones del **Gestor de Perfiles** colapsan de la vida real al servidor VPS.

### 3.1 Componentes Esenciales del Flujo de Feedback:
*   **A.** `resolve_quality_unified.php`: Registra (sin bloquear el I/O) estado de ancho de banda y latencia mediante hooks de micro-telemetría en un archivo JSON en disco de RAM (tmpfs).
*   **B.** `guardian.php`: Proxy endpoint ligero y con caché estricta para leer `/dev/shm/guardian_exchange.json` y servirlo con CORS activado.
*   **C.** `Frontend Javascript (Polling)`: Cada X segundos interroga `https://iptv-ape.duckdns.org/guardian.php`, actualiza los contadores de latencia/ancho de banda, y muestra SUGERENCIAS cuando detecta *strangulation* o memory bloat, guiando explícitamente al operador a modificar el *Gestor de Perfiles APE v9.0*.

> [!CAUTION]
> NUNCA rompas el ciclo. Si añades un nuevo codec o estrategia de buffering (Ej: BWDIF), debe nacer primero en el Frontend (Gestor de Perfiles), fluir a través del archivo M3U8, y ser leído/ejecutado por el Resolver. Jamás a la inversa.
