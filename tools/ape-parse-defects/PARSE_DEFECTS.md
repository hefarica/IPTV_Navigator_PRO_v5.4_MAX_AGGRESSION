# Defectos de parseo de la lista real — auditado, no supuesto

**Fecha:** 2026-11-02 · **Entrada:** `APE_LISTA_1793589060441.m3u8`
**Herramienta:** `parse_defects.js` (Node ≥18, cero dependencias, 4,3 s sobre 604 MB, una pasada)

---

## 1 · Identidad y estructura

| Comprobación | Resultado | Veredicto |
|---|---|---|
| bytes | 604.593.696 | ✓ |
| sha256 | `523d52a6d147f81ce5a212e47b9c55401fb409cd4a41aee96f8ba80b5b5049d6` | ✓ idéntico a la referencia |
| **BOM UTF-8** | `false` | ✓ |
| **retornos de carro (CRLF)** | `false` | ✓ |
| `#EXTM3U` presente | sí | ✓ |
| líneas totales | 10.315.662 | — |
| `#EXTINF` | 10.573 | ✓ uno por canal |
| `#EXTINF` sin coma | **0** | ✓ |
| `#EXTINF` sin nombre | **0** | ✓ |
| URIs totales | 10.573 | ✓ una por canal |
| URI sin `#EXTINF` previo | **0** | ✓ |
| URI no `http(s)` | **0** | ✓ |
| **URIs duplicadas** | **0** | ✓ **sin riesgo de 509 por duplicado** |

**Conclusión estructural: la lista está limpia.** No hay BOM, ni CRLF, ni URIs huérfanas, ni EXTINF malformados, ni duplicados. Eso descarta la clase de fallo barato.

## 2 · El defecto real: 10.573 líneas por encima de 4 KB

| Medida | Valor |
|---|---|
| líneas > 4.096 B | **10.573** — exactamente una por canal |
| líneas > 6.144 B | **10.573** — la misma cuenta: ninguna baja de 6 KB |
| líneas > 8.192 B | **0** |
| línea más larga | **8.133 B** (línea 96.013) |

Es decir: **las 10.573 líneas de canal caen todas en la banda 6,1–8,1 KB.** No es una cola larga: es un
bloque uniforme. Coincide con el censo de `#EXTHTTP` de la cartografía (7.197–8.124 B por bloque).

### Por qué esto rompe parsers de verdad

Muchos parsers M3U leen con buffer de línea fijo:

| Buffer del parser | Qué pasa con esta lista |
|---|---|
| 4 KB | **trunca o descarta** la línea. El `#EXTHTTP` queda cortado → JSON inválido → cabeceras perdidas o canal rechazado |
| 8 KB | sobrevive **por 59 bytes** (8.133 < 8.192). Cero margen |
| sin límite | correcto |

No es teórico: es la razón por la que una lista puede verse bien en un player y fallar en otro sin que
la lista «esté mal». **El margen de 59 bytes es el hallazgo.**

### Y el riesgo de truncado es silencioso

Un `#EXTHTTP` cortado a 4 KB no da error de sintaxis en un parser tolerante: se ignora. El canal
reproduce **sin** sus cabeceras — sin UA, sin Referer — y entonces el proveedor responde 461/403 y el
diagnóstico apunta al proveedor cuando el problema estaba en el tamaño de la línea.

## 3 · Las 10.576 líneas vacías

Presentes entre bloques. Inofensivas para casi todos los parsers, pero hay implementaciones que cortan
el bloque al encontrar una línea en blanco. Se reportan como defecto menor, no como fallo.

## 4 · Lo que NO es un defecto, aunque lo parezca

- **13.725 líneas con caracteres no ASCII**: son los nombres de canal y los valores de `#EXTINF`. UTF-8
  válido, sin BOM. Correcto.
- **8.133 B de línea máxima**: por debajo de 8 KB. Una implementación con buffer de 8 KB lo pasa.

## 5 · Recomendación medible

Reducir el bloque `#EXTHTTP` por canal **por debajo de 4.096 B** (hoy 7.197–8.124 B): o partirlo en
varias líneas `#EXTHTTP`, o recortar el número de cabeceras por bloque. El criterio de aceptación es
medible y binario:

```
node parse_defects.js <lista.m3u8>   →   lineas_sobre_limite == 0
```

## 6 · Reproducir

```bash
node tools/ape-parse-defects/parse_defects.js "C:\Users\HFRC\Downloads\APE_LISTA_1793589060441.m3u8"
```

Sin red, sin escrituras, una sola pasada de lectura.
