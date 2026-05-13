---
name: Skill HMAC Fallback Masking Proxy
description: Protocolo de enmascaramiento seguro para listas M3U8, eliminando credenciales expuestas mediante cifrado HMAC-SHA256 en orígenes reversos.
---
# Skill: Fallback Masking Proxy (HMAC-SHA256)

**Clasificación:** Backend Security / Credential Protection  
**Nivel:** God-Tier Evasión  

## 1. Propósito
Resolver una vulnerabilidad estructural de IPTV donde las URL de origen (que contienen el nombre de usuario y contraseña codificados o en la consulta GET) quedan expuestas en texto plano bajo directivas exoplayer/VLC como `#EXT-X-APE-FALLBACK-DIRECT` dentro del M3U8 final.

Este protocolo **aniquila** la posibilidad de robo de credenciales reemplazando las URL con punteros anonimizados, respaldados por una firma criptográfica infalsificable.

## 2. Arquitectura de Enmascaramiento Dual

El protocolo consta de dos piezas monolíticas: el Inyector/Enmascarador (Python) y el Fallback Proxy Reverso (PHP).

### 2.1 El Hash criptográfico (`adn`)
Para cada canal, se construye una firma de autenticidad inmutable basada en datos cruzados:
`ADN = SHA256(UID_Criptografico + Perfil + Nonce_Dinamico + FALLBACK_SECRET_MAESTRO)`

### 2.2 Desplazamiento de Credenciales (Python Script)
El script `mask_fallback_direct.py` escanea la lista M3U8. Cuando intercepta el origen (ej: `http://iptvprovider.com:8080/live/user/pass/123.ts`):
1. Captura la URL cruda.
2. Genera un ID corto o UID y cifra la instrucción (ADN).
3. Construye un enlace seguro apuntando al proxy neutro instalado en el VPS:
   `#EXT-X-APE-FALLBACK-DIRECT: https://iptv-ape.duckdns.org/fallback_proxy.php?ch=UID&profile=...&ctx=ADN`
4. Exporta un array de sincronización (Origin Table) que mapea el UID del canal de regreso a la URL `user/pass`.

### 2.3 El Proxy Reverso (PHP en Producción)
1. El script `fallback_proxy.php` recibe el ping del reproductor en `https://iptv-ape.duckdns.org/fallback_proxy.php?ch=UID&ctx=ADN`.
2. Repite el cálculo matemático con el `FALLBACK_SECRET` maestro asíncrono subido al servidor.
3. Si el `ctx` proporcionado por el reproductor coincide de manera exacta con la firma criptográfica recompilada por el servidor, busca el URI decodificado.
4. Redirige (o funge de pipe neutro vía `rewrite`) hacia el proveedor real entregando el TS Chunk o la respuesta 200 OK, sin que el reproductor jamás haya sabido el origin host ni las credenciales.

## 3. Regla de Oro
- El `FALLBACK_SECRET` debe tener 64 caracteres Hexadecimales aleatorios.
- Jamás incrustar o enviar el `FALLBACK_SECRET` dentro de paquetes JSON al frontend; este debe permanecer **exclusivamente** en Python (Entorno Local) y PHP (VPS).
- Cualquier asimetría o error 403 que indique `ADN de Canal Corrupto` al realizar peticiones al fallback, significa que el reloj NTP está desfasado entre el generador y el servidor o el Proxy contiene una tabla antigua de orígenes.
