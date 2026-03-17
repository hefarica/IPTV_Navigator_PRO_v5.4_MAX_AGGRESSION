---
name: Protocolo JSON String-Casting (#EXTHTTP ExoPlayer Sync)
description: Doctrina inmutable para inyectar headers HTTP personalizados (`#EXTHTTP`) en listas M3U8 destinadas a TiviMate u OTT Navigator. Erradica el error "Unexpected token (position:TEXT #EXTINF:-1)" provocado por el parser InputStreamReader de Java al ahogarse con booleanos, saltos de línea inyectados o JSON anidados.
---

# 🛡️ Protocolo JSON String-Casting (ExoPlayer Sync)

**Versión:** 1.0.0
**Clasificación:** Parser Resilience / Anti-Crash
**Alcance:** Generador JS (`m3u8-typed-arrays-ultimate.js`, `export-module.js`) y VPS Resolver (`resolve_quality.php`)

---

## 0. El Síntoma: El Error "Unexpected Token"

Cuando un reproductor (como **TiviMate** configurado con ExoPlayer) intenta parsear una lista M3U8 y encuentra un bloque `#EXTHTTP` mal formado, arroja un error crítico y pantalla negra antes de intentar conectar.

El log en pantalla típicamente muestra:
`Ha ocurrido un error - Unexpected token (position:TEXT #EXTINF:-1 ... @LINE... in java.io.InputStreamReader...)`

Esto se debe a que el parser JSON de Java **falla al leer el `#EXTHTTP`**, no cierra la instrucción, y accidentalmente **se traga la línea `#EXTINF` que le sigue** creyendo que es parte del JSON.

---

## 1. Causas Mortales en el Protocolo Antiguo

1. **Booleanos vs Strings:** ExoPlayer requiere que las claves y valores dentro de `#EXTHTTP` sean *estrictamente strings*. Variables como `true` o `10` crashean el parser si no van entre comillas (`"true"`, `"10"`).
2. **Saltos de Línea Infiltrados (`\r\n`):** Al importar User-Agents o tokens JWT en texto plano desde variables externas, se colaban *newlines* invisibles rompiendo el estándar M3U8 de "Una directiva por línea".
3. **Trailing Commas:** `{"Key":"Value",}` (con una coma colgando al final) es JSON inválido estricto y revienta parsers antiguos de Java.
4. **Doble Inyección de Concatenación:** Insertar `#EXTHTTP:{"Hardcoded...}` a la fuerza dentro de los arrays nativos que luego pasan por un `json_encode()`.

---

## 2. Doctrina de Inyección (La Regla de Oro)

**NUNCA inyectes `#EXTHTTP:` como una cadena hardcodeada (String literal) en el código.**
Siempre debe construirse como un array/objeto nativo que se esteriliza y se pasa por un JSON encoder validado.

### 2.1. Implementación en Backend PHP (VPS Resolvers)

**Código Correcto** (Añadir siempre antes del `echo` final):

```php
// ── FORENSIC JSON SANITATION (Anti TiviMate/ExoPlayer Crash) ──
$safeExtHttp = [];
foreach ($exthttp as $k => $v) {
    if (is_bool($v)) {
        // Cast estricto de booleanos a strings
        $safeExtHttp[$k] = $v ? "true" : "false";
    } elseif (!is_scalar($v)) {
        // Objetos anidados se aplanan y se limpian de saltos de línea
        $safeExtHttp[$k] = str_replace(["\r", "\n"], "", json_encode($v));
    } else {
        // Cast incondicional a string y eliminación de nuevas líneas (ej. de User Agents largos)
        $safeExtHttp[$k] = str_replace(["\r", "\n"], "", (string)$v);
    }
}
$extJson = json_encode($safeExtHttp, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if ($extJson && $extJson !== '[]') {
    echo '#EXTHTTP:' . $extJson . "\n";
}
```

### 2.2. Implementación en Frontend JS (Generadores APE)

**Código Correcto:**

```javascript
// ── FORENSIC JSON SANITATION (Anti TiviMate/ExoPlayer Crash) ──
const safeExtHttp = {};
for (const key in rawHttpObject) {
    // Conversión absoluta a String y eliminación de saltos de línea infiltrados (\r\n)
    safeExtHttp[key] = String(rawHttpObject[key]).replace(/[\r\n]/g, '');
}

// Inyección limpia y pura a la matriz de líneas M3U8
lines.push(`#EXTHTTP:${JSON.stringify(safeExtHttp)}`);
```

---

## 3. Lista de Verificación Forense

Si vuelve a presentarse un "Unexpected token" en la directiva `#EXTHTTP`, revisar inmediatamente:

- [ ] ¿Hay valores de "0" o "1" (Numéricos) en vez de `"0"` o `"1"` (Strings)?
- [ ] ¿Se inyectó un booleano `true` en vez del string `"true"`?
- [ ] ¿El User-Agent concatenado tiene un salto de línea invisible al final?
- [ ] ¿Hay un `json_encode` que está envolviendo dos veces las comillas escapándolas (`\"`) en la salida final?

Esta skill certifica que el payload transmitido en la API OTT es "A prueba de balas" frente al decodificador InputStreamReader de los Smart TVs Android.
