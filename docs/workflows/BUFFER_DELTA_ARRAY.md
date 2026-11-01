# Buffer Delta Array — dinámico por perfil

El valor **no es una constante**. `40` es solo el valor de la corrida actual.

## Estado

```text
window.APE_OUTPUT_DELTA_PCT    valor activo visible
window.APE_OUTPUT_DELTA_ARRAY  array por perfil
localStorage.ape_output_delta_array  persistencia
```

Ejemplo de array:

```json
{"P0":40,"P1":38,"P2":35,"P3":30,"P4":25,"P5":20}
```

## Botones

```text
Aplicar       → guarda el array y lo envía a /prisma/api/ape-output-config.php
Generar VPS   → genera la lista CDN/JIT y usa el array
Generar AMBAS → genera la lista híbrida y usa el array
Generar DIRECTO → genera lista directa con el mismo tag
```

## Actualización por proceso

```js
window.APE_BUFFER_DELTA_API.set({
  P0: 40, P1: 38, P2: 35, P3: 30, P4: 25, P5: 20
});
```

En la siguiente generación se lee ese array, no el 40 anterior.

## Tag de lista

```text
#EXT-X-APE-BUFFER-DELTA-ARRAY:P0=40,P1=38,P2=35,P3=30,P4=25,P5=20
#EXT-X-APE-BUFFER-DELTA-PCT:40
#EXT-X-APE-BUFFER-DELTA-RULE:IN>=OUT*(1+0.4)
```

`PCT` es el valor activo para compatibilidad; `ARRAY` es la fuente dinámica real.

## VPS

`POST /prisma/api/ape-output-config.php`

```json
{"delta_pct": 40, "delta_array": {"P0":40,"P1":38,"P2":35,"P3":30,"P4":25,"P5":20}}
```

Guarda el array en `/dev/shm/ape_output_config.json`; cada generación lo reenvía.
