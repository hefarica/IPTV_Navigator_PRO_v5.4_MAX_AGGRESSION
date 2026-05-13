---
name: PHP Zero-State & Modulo Resilience (Anti-Division-By-Zero)
description: Obligación arquitectónica: Prevenir DivisionByZeroError y colapsos 500 garantizando fallbacks no-vacíos en arrays y denominadores.
---

# PHP Zero-State & Modulo Resilience

## 📌 Principio Fundamental
En arquitecturas de backend altamente dependientes de matemática estocástica, funciones hash, y asignaciones rotativas (como el `UAPhantomEngine` para rotación de User-Agents basada en hash `djb2`), cualquier variable de configuración o array en estado vacío (Zero-State) es una bomba de tiempo.

El error `#Error 500 Internal Server Error` frecuentemente se debe a un `DivisionByZeroError` silencioso cuando se intenta realizar un cálculo Modulo (`%`) usando la función `count()` sobre un array vacío.

## 🛑 REGLA ABSOLUTA
**Ningún array que sea utilizado como denominador en una operación aritmética Modulo (`%`) puede inicializarse vacío sin un hard-fallback inmediato.**

### El Patrón Destructivo (Vulnerabilidad):
```php
// ❌ ERROR: Array vacío
private static array $ALL_UAS = [];

// ...
$total = count(self::$ALL_UAS); // $total es 0
// ESTO PROVOCA UN PHP FATAL ERROR Y DESTRUYE EL RESOLVER ENTERO
$index = $hash % $total;
```

## ✅ La Solución Arquitectónica (Resilience Protocol)

**Regla 1: Población Estática Obligatoria**
Todo Pool o Array de opciones debe contener al menos **UN** valor de fallback operativo garantizado (ej. `'VLC/3.0.18'`).

**Regla 2: División Segura en Tiempo de Ejecución (Defensa en Profundidad)**
Nunca asuma que el array está poblado durante la evaluación matemática. Use la aserción `max(1, count($array))` para garantizar que el denominador jamás sea `0`.

### Implementación Requerida:
```php
class ResilientEngine {
    // 1. Población Básica Requerida (Hard-Fallback)
    private static array $POOL = [
        'Fallback-Value-1',
        'Fallback-Value-2'
    ];

    public static function getAssignedItem(int $hash): string {
        // 2. Aserción de Denominador (Defensa en Profundidad)
        $total = max(1, count(self::$POOL));
        
        // El Error de División por Cero es matemáticamente imposible
        $index = $hash % $total;
        
        // Evitar Undefined Index Warning si por un error externo $POOL está vacío en memoria
        return self::$POOL[$index] ?? 'Emergency-Runtime-Fallback';
    }
}
```

## Consecuencia de Incumplimiento
Violar este protocolo genera caídas atómicas de PHP-FPM, resultando en `HTTP 500` generalizado para todas las solicitudes entrantes al sistema IPTV, derribando canales funcionales independientemente del estado de la IP o el stream.
