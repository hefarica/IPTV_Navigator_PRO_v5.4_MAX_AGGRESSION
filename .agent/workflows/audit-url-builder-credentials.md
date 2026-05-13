---
description: Flujo de trabajo para auditar y erradicar falsos positivos de "Clave Incorrecta" causados por la tokenización anómala del API Xtream Codes (Bug de pre-tokenización /play/).
---

# Workflow: Auditoría de Error "Clave Incorrecta" & URL Builder (Zero-Tokenization Pipeline)

Este flujo de trabajo es **MANDATORIO** cuando un usuario reporta que TODA una lista recién generada devuelve error de **"Clave Incorrecta"** o cuando ve que dentro del M3U8 cada canal tiene un hash larguísimo (Base64/Token) distinto en lugar de sus credenciales comunes.

## FASE 1: Verificación Visual del Síntoma (Síntoma de Furia /play/)

Si sospechas que se está rompiendo el ensamblaje de credenciales, extrae 3 canales de la lista generada (`.m3u8`) y revisa su URL principal.

1. **Aislamiento del Síntoma:**
   ¿Se ve así? `http://host:puerto/live/play/WXVhRkxjT2hNVTlhZk.../1234`
   *(Si contiene `/live/play/` seguido de una string críptica larguísima:* **ALERTA ROJA.** *El generador está filtrando los tokens del JSON de Xtream del proveedor).*

2. **Identificación de Corrección Esperada:**
   La cadena final para reproducción **DEBE SER** esta, obligatoriamente:
   `http://host:puerto/live/USUARIO_REAL/PASS_REAL/1234.m3u8`

## FASE 2: Cacería en el Código (Búsqueda de Cortocircuitos)

El origen de la infección radica en la función `buildChannelUrl()` o en `buildUniversalUrl()` donde el programador intentó un atajo (shortcut). Ingresa en el generador maestro (`m3u8-typed-arrays-ultimate.js`, etc.) y sigue estas reglas empíricas:

1. **Busca la asignación de la variable comodín:**
   Busca referencias a `channel.url` o `existingUrl`.
   
2. **Localiza y Aniquila el `return` Asesino:**
   Si existe alguna condicional que diga:
   ```javascript
   // ❌ ESTO TIENE QUE MORIR INMEDIATAMENTE
   if (existingUrl && existingUrl.includes('/live/')) {
       return existingUrl; 
   }
   ```
   **BÓRRALO.** Estás devolviendo la trama envenenada (`/play/`) que manda Xtream.

## FASE 3: Enrutamiento al Credentials Map (La Verdad Absoluta)

Para solucionar esto de tajo, asegúrate de que el código fluye obligatoriamente hacia el mapa central de credenciales.

1. **Garantiza la Extracción por ServerID:**
   Verifica que el flujo localice agresivamente el ID del servidor matriz del canal.
   ```javascript
   const sid = channel.serverId || channel._serverId;
   let creds = credentialsMap[sid] || credentialsMap['__current__'];
   ```

2. **Garantiza el Ensamblaje Manual Restrictivo:**
   El código **DEBE** obligatoriamente construir el string sacando el usuario y contraseña del `creds` recuperado.
   ```javascript
   // ✅ REPARACIÓN CORRECTA
   const url_limpia = `${creds.baseUrl}/live/${creds.username}/${creds.password}/${streamId}.${ext}`;
   return url_limpia;
   ```

3. **Relega `existingUrl` al Nivel Más Bajo (Fallback):**
   Mueve el atajo asesino que borraste al final de la función, poniéndolo **DENTRO** de una condicional que evalúe si falló la localización en el `credentialsMap`. Si no se tienen credenciales por ningún lado, entonces y solo entonces puedes usar la URL pre-tokenizada.

## FASE 4: Test de Limpieza (Polimorfismo Final)

Tras aplicar la arquitectura OMEGA a la función:
1. Regenera/Compila el `.m3u8`.
2. Imprime los primeros canales de la lista.
3. Verifica que la huella `/live/play/` haya desaparecido de la faz de la tierra.
4. Confirma que **todos** los canales que pertenecen a `hostX` contengan las mismas credenciales `USUARIO_REAL/PASS_REAL`.
