---
name: iptv-polimorfismo-idempotencia
description: Guía de implementación del sistema dual Polimorfismo/Idempotencia en IPTV. Usar cuando necesites evadir bloqueos de ISP (DPI, firewalls) mutando la lista en cada descarga, mientras garantizas que el servidor/caché backend reciba siempre identificadores estables para responder en menos de 5ms.
---

# IPTV: Polimorfismo e Idempotencia

Esta habilidad describe la arquitectura dual que permite a una lista M3U8 evadir la detección de ISPs (mediante polimorfismo) sin destruir el rendimiento de la caché del servidor (mediante idempotencia).

## El Problema

Si una lista M3U8 es completamente estática, los ISPs (Deep Packet Inspection) pueden crear firmas y bloquearla. Si la lista es completamente dinámica (generada aleatoriamente en cada petición), el servidor PHP/Resolver no puede usar caché y colapsará bajo carga al tener que recalcular la calidad de video en cada zapping.

## La Solución: Identidad Dual

### 1. Polimorfismo (Hacia el Exterior / ISP)
Todo lo que ve el ISP muta en cada descarga de la lista.

```javascript
// Generador de entropía de 8 caracteres
function rand8() { 
    return crypto.createHash('md5').update(Math.random().toString()).digest('hex').substring(0, 8); 
}

const _nonce = rand8(); // Ej: "a1b2c3d4"
```

Este `nonce` se inyecta en múltiples lugares del manifest:
- `#EXT-X-APE-POLYMORPHIC-NONCE:${_nonce}`
- `#EXT-X-APE-PHANTOM-HYDRA-NONCE:${_nonce}`
- En la URL final: `?ape_nonce=${_nonce}`

**Resultado:** El hash SHA256 del archivo `.m3u8` cambia en cada descarga. Es imposible crear una firma estática.

### 2. Idempotencia (Hacia el Interior / Servidor)
El identificador que usa el servidor para saber qué canal y qué calidad entregar NUNCA cambia, sin importar cuántas veces se descargue la lista.

```javascript
// Generación de SID estable usando FNV-1a (o MD5 de una semilla estática)
const _sid = (function(id) {
    let h = 0x811c9dc5;
    const s = String(id) + 'OMEGA_STATIC_SEED_V5';
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
    }
    const h2 = (h ^ (h >>> 16)) >>> 0;
    return (h.toString(16).padStart(8,'0') + h2.toString(16).padStart(8,'0')).substring(0,16);
})(channel.id);
```

Este `sid` (Session ID) se inyecta en la URL final:
`https://servidor.com/stream?ape_sid=${_sid}&ape_nonce=${_nonce}`

**Resultado:** Cuando el reproductor hace la petición, el Resolver PHP ignora el `nonce` mutante, extrae el `sid` estable, busca en Memcached/Redis y devuelve el resultado en `<5ms` (HIT).

## El Ciclo Completo

1. **GENERADOR:** Crea lista con `nonce` nuevo (muta) y `sid` basado en ID (estable).
2. **ISP/FIREWALL:** Ve un archivo diferente cada vez. No puede bloquear por firma.
3. **REPRODUCTOR:** Lee la lista, extrae la URL y hace GET.
4. **RESOLVER PHP:** Recibe `ape_sid=xyz`, busca en caché, devuelve el flujo de video en milisegundos.

## Reglas de Implementación

- **NUNCA** uses variables aleatorias (`Math.random()`, `Date.now()`) para generar el `sid` o las llaves de caché.
- **SIEMPRE** usa variables aleatorias para el `nonce` y los headers de evasión.
- Inyecta el `nonce` en la URL final para garantizar que la petición HTTP inicial del reproductor no sea bloqueada por cachés agresivas del ISP.
