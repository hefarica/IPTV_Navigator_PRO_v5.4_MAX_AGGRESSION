# ape-image-pipeline-truth

Super-skill operativa: **la verdad medida del pipeline de imagen de APE**.
No es teoría: cada cifra tiene comando y artefacto, y las afirmaciones refutadas están registradas
para que no vuelvan a circular.

## Qué resuelve

| Pregunta | Respuesta en |
|---|---|
| ¿Por qué la lista se ve bien en OTT Navigator si sus filtros son inertes? | `SKILL.md` §11 |
| ¿Qué módulos de filtro existen de verdad en VLC? | `SKILL.md` §6 |
| ¿Por qué falla la cadena de las 10.573 entradas? | `SKILL.md` §8 |
| ¿Qué opciones `#EXTVLCOPT` son reales? | `SKILL.md` §6 + `commands.md` §7 |
| ¿Cómo viaja el recetario del LAB al manifiesto? | `SKILL.md` §4 |
| ¿Cuál es el layout real del bloque de canal? | `SKILL.md` §10 |
| ¿Qué se puede afirmar sobre 120 fps? | `SKILL.md` §9 |
| ¿Cómo se implementa en tres carriles? | `SKILL.md` §5 + `examples/` |

## Estructura

```
SKILL.md          spec completa (18 secciones)
README.md         este archivo
references.md     fuentes: consultadas vs NO consultadas
commands.md       comandos verificados, con su salida esperada
checklist.md      pre / durante / post / rollback + señales de error repetido
tests.md          13 casos con comando y veredicto esperado
install.lock.json pin de toolchain y sha256 del artefacto fuente
audit-report.md   log de creación, refutaciones incorporadas y drift a vigilar
examples/         bloque M3U emitido con el layout real
scripts/          apuntadores a los 3 ejecutables (no se duplican)
fixtures/         resumen del LAB decodificado
```

## Regla de oro de esta skill

> El manifiesto es un **plano de control**, no un ejecutor de píxeles.
> Un filtro en la playlist solo ejecuta si el motor es VLC y la sintaxis es de **módulo VLC**.
> Todo lo demás es metadata inerte o mentira al parser.

## Estado

`v1.0.0 · 2026-11-02`. Validada: 7/7 archivos, JSON OK, 3/3 tools con `node -c` exit 0,
10/10 artefactos citados existen.

**Huecos declarados, no rellenados:** aplicación conjunta de varios módulos VLC sin verificar
end-to-end (requiere vout real en device) · fuentes sintéticas · fps de host sin GPU ·
veredicto de ExoPlayer/OTT normativo, no empírico.
