---
name: ssd-spec-driven-development
description: Flujo Spec-Driven Development (SDD) para trabajar con agentes sin improvisar prompts. Úsala SIEMPRE que haya que crear o cambiar una funcionalidad, escribir requisitos, planificar tareas, implementar con tests primero, validar RF contra tests o revisar un cambio generado por IA. Basada en el curso Hello SDD de MoureDev (Apache-2.0, commit 358dfe85), adaptada al repo IPTV/APE: constitución, spec EARS, clarificación, plan, tareas, implementación de una tarea, validación y cambio con la spec primero. Incluye los truth-guards de imagen/anti-degradación de este repo: una etiqueta no es un píxel, una fuente 1080p no se declara 4K/6K real, y REA/APK no puede filtrar el player de otro.
---

# SSD — Spec-Driven Development

> **Tesis:** no se escribe código a partir de un prompt ambiguo. Se escribe a partir de una
> **especificación acordada**, un **plan** y **tareas verificables**. El agente implementa una
> tarea cada vez, con tests primero, y se detiene.

Adaptación propia del flujo de **Hello SDD** de Brais Moure (MoureDev), Apache-2.0,
commit `358dfe85a818bccdd839f78e804668b3ebaa10b5`. Las plantillas del upstream no se copian;
esta skill resume el método y lo adapta a las verdades medidas de este repositorio.

## 1. Cuándo se activa

- Nueva funcionalidad, endpoint, parser, perfil, lista, mejora de imagen o cambio de VPS.
- Hay que convertir una petición oral o un enlace en requisitos y tareas.
- Un agente quiere empezar a editar archivos sin spec o sin plan.
- Hay que revisar un cambio generado por IA y responder: ¿cumple la spec? ¿qué test lo cubre?
- Hay una ambigüedad, contradicción o requisito nuevo.
- Se va a declarar calidad de imagen, 4K/6K, HDR, upscaling o “aplicado”.

No la uses para un cambio trivial de una línea que no altera comportamiento; aun así, deja
evidencia en el commit.

## 2. Secuencia no negociable

```text
Constitución
  → Spec (QUÉ y POR QUÉ; EARS)
  → Clarificación (QA detecta, no resuelve)
  → Plan (módulos, datos, decisiones, tests; sin código)
  → Tareas (<30 min, dependencias, RF, "Hecho cuando")
  → Implementación (SOLO una tarea, tests primero, parar)
  → Validación (RF por RF contra tests)
  → Cambio (spec primero, luego plan/tareas/código)
```

Si falta una decisión: **detente y pregunta**. No la inventes en el código.

## 3. Artefactos

```text
docs/constitution.md              principios innegociables del proyecto
specs/NNN-<feature>/spec.md       requisitos, alcance, casos límite, dudas
specs/NNN-<feature>/plan.md       cómo se implementará, decisiones y tests
specs/NNN-<feature>/tasks.md      tareas pequeñas, checkbox y "Hecho cuando"
AGENTS.md / CLAUDE.md             contexto y comandos que el agente debe leer
```

La spec no contiene código. El plan no contiene implementación. Las tareas no contienen
código; contienen una unidad de trabajo y su verificación.

## 4. Constitución

Antes de la primera spec, propone **6–8 principios cortos y verificables**. Deben cubrir:
stack permitido, separación de capas, tests, datos/seguridad, estilo/idioma y límites.
Espera aprobación humana.

### Constitución mínima para este repo

1. **No degradación:** no se baja resolución, códec, HDR, fps, bitrate ni audio para ocultar un fallo.
2. **Fuente honesta:** una fuente 1080p no se declara 4K/6K Real. El upscaling se declara
   `MODE=SIMULATED`/`UPSCALE` y solo es `EXECUTED` si un motor lo ejecutó.
3. **VPS metadata-only:** nginx/Lua/PHP no tocan píxeles ni transcodifican; seleccionan,
   enrutan y declaran. REA/APK solo procesa frames de su propio reproductor.
4. **Cero pérdida:** no se borran canales, líneas ni directivas sin consentimiento escrito;
   las proyecciones van a un fichero nuevo con sidecar.
5. **Evidencia:** cada afirmación de calidad se etiqueta `declarado`, `observado`, `aplicado` o
   `verificado`. Un tag en la lista es `declarado`, nunca `aplicado`.
6. **Tests primero:** ninguna tarea se marca hecha si sus tests no están en verde.
7. **Sin secretos:** no se escriben tokens, URLs firmadas ni credenciales en logs o documentos.
8. **Producción con permiso:** ningún apply/deploy sin autorización explícita y rollback.

## 5. Spec y EARS

La spec responde **QUÉ** y **POR QUÉ**. Incluye:

- contexto y objetivo;
- usuarios/actores;
- historias H1..Hn;
- requisitos funcionales numerados `RF-1..RF-n` en **EARS**;
- requisitos no funcionales solo si aplican;
- casos límite;
- fuera de alcance;
- criterios de finalización;
- dudas abiertas marcadas `[NECESITA ACLARACIÓN]`.

### Patrones EARS en español

| Tipo | Patrón |
|---|---|
| Ubicuo | `EL SISTEMA <comportamiento permanente>` |
| Evento | `CUANDO <evento>, EL SISTEMA <respuesta>` |
| Estado | `MIENTRAS <estado>, EL SISTEMA <respuesta>` |
| No deseado | `SI <condición>, ENTONCES EL SISTEMA <respuesta>` |
| Opcional | `DONDE <característica>, EL SISTEMA <respuesta>` |

Un RF debe ser observable y testeable. Prohibido: “funciona bien”, “es rápido”, “se ve mejor”
sin criterio de medida.

### Entrevista de requisitos

Haz **una pregunta a la vez**, máximo 6, sobre:
casos límite, errores, datos vacíos/duplicados, concurrencia, seguridad, alcance y qué **no**
se hará. Después genera la spec. No escribas código.

## 6. Clarificación

Pide una revisión **como QA**, no como implementador:

- ambigüedades;
- contradicciones entre RF;
- casos límite ausentes;
- conflictos con la constitución;
- RF sin test posible;
- alcance excesivo.

El revisor **solo detecta y documenta**. No resuelve ni implementa. Las respuestas humanas
actualizan la spec antes de planificar.

## 7. Plan

Sin código, produce:

- módulos/archivos que se tocarán y por qué;
- modelo de datos/contratos;
- decisiones técnicas con la **alternativa descartada** y su motivo;
- estrategia de tests;
- **mapa RF → parte del plan → test**;
- riesgos, rollback y observabilidad;
- qué no se tocará.

Si el plan descubre que la spec es imposible o contradictoria, vuelve a la spec.

## 8. Tareas

- Cada tarea debe caber en **menos de 30 minutos**.
- Ordenadas por dependencia.
- `T1`, `T2`, ... con checkbox.
- Cada una cita `RF-n` y termina con `Hecho cuando: <verificación observable>`.
- Una tarea no mezcla dos capas no relacionadas.
- Los tests de la tarea se escriben antes o junto con el cambio, nunca después.

## 9. Implementación

Prompt operativo:

> Implementa **solo Tn**. Escribe primero el test que falla. Ejecuta la suite. Muestra el
> resultado. Marca Tn como hecha. **PÁRATE** y espera la siguiente instrucción.

Reglas:

- No implementes tareas futuras.
- No amplíes el alcance sin actualizar la spec.
- No borres tests para pasar.
- No declares “hecho” sin comando y salida.
- Si un test revela una ambigüedad, vuelve a clarificación/spec.

## 10. Validación

Recorre la spec **RF por RF**:

| RF | Test/comando | Resultado | Evidencia |
|---|---|---|---|
| RF-1 | `...` | PASS/FAIL | ruta/salida |

Veredicto: `spec cumplida` solo si **todos** los RF tienen test en verde y los casos límite
acordados están cubiertos. Un test que no existe es `NO VERIFICADO`, no PASS.

## 11. Cambio

Si aparece un requisito nuevo:

1. **No toques código.**
2. Actualiza la spec y muestra el diff.
3. Ajusta plan/tareas.
4. Implementa una tarea nueva.
5. Valida de nuevo.

## 12. SSD en AgentTeams

- **Constitución/spec:** una tarea de `requirements` con criterios de aceptación.
- **Plan:** una tarea de `work` que solo produce el plan, sin código.
- **Tareas:** una tarea por unidad implementable; dependencias explícitas.
- **Implementación:** tarea `implementation` con `inScope`, `verify` y tests.
- **Validación:** tarea `verification` con el mapa RF→test; no la firma el implementador.
- **Review:** una tarea de `review` con `reviewedTaskId`; un PASS exige evidencia.
- **Cambio:** nueva tarea que empieza por spec, no por código.

El capitán no implementa y revisa la misma tarea. Un miembro no puede tener dos tareas
abiertas. Usa `attempt_id` vigente.

## 13. Truth-guards IPTV/APE

Aplica a toda spec que toque imagen, listas, VPS, APK o logs:

1. **Fuente medida > nombre del canal.** `ffprobe` del segmento manda; “FHD/4K/6K” en el
   nombre no es evidencia.
2. **Upscaling ≠ fuente 4K/6K.** Si el origen es 1080p, el 4K/6K es reconstruido. Etiqueta
   `MODE=SIMULATED` o `UPSCALE`; no `RESOLUTION` real.
3. **Metadata ≠ píxeles.** `#EXT-X-APE-*` es inerte para la mayoría de players. `EXECUTED=0`
   por defecto; `EXECUTED=1` exige salida del motor y `ffprobe` del artefacto.
4. **VPS no toca píxeles.** nginx/Lua/PHP no transcodifican. Para mejorar un player externo
   hace falta una variante HLS ya procesada (nodo GPU) o el player APE.
5. **REA/APK solo su propio player.** Android no permite capturar el MediaCodec de OTT
   Navigator, VLC, TiviMate, etc. Una spec que pida “REA sobre OTT” es inválida.
6. **No borrar.** Toda transformación de lista crea un fichero nuevo + sidecar; el original
   conserva su SHA-256.
7. **No fake HDR/CMAF/DV/LCEVC** sin bitstream real o recibo del motor.
8. **Evidencia por etapa:** fuente → entregado → presentado → modo del display. No mezcles
   “el TV está en 4K” con “el player generó 4K”.

### Regla de imagen para esta repo

```text
Origen medido (ffprobe)
  → política de perfiles / anti-degradación
  → salida real (variante/HLS/efecto)
  → ffprobe de la salida
  → presentación en device (si hay evidencia)
```

Si falta cualquier etapa, se escribe `NO VERIFICADO`.

## 14. Comandos

```bash
# validar una feature SSD
python .agents/skills/ssd-spec-driven-development/scripts/ssd_check.py \
  --feature .agents/skills/ssd-spec-driven-development/fixtures/valid

# ejecutar la suite del proyecto antes de cerrar una tarea
node -c frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js
node frontend/tests/ape-catalog-projection.test.js

# medir una fuente real
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate \
  -of default=nw=1 <segmento>
```

## 15. Anti-patrones

- “Vibe coding”: código antes de spec.
- Prompt único gigante con 20 requisitos mezclados.
- Spec con soluciones técnicas en vez de comportamiento.
- RF sin criterio observable.
- Tarea sin “Hecho cuando”.
- Implementar todo el plan en un turno.
- Tests añadidos después para justificar el código.
- Declarar 4K/6K por una etiqueta, un perfil o un nombre de canal.
- Aplicar REA a un player externo.
- Borrar líneas o canales “porque sobraban”.
- Validar con `curl` una vez y llamarlo “verificado”.

## 16. Límites honestos

- Esta skill **no** convierte una fuente 1080p en 4K nativo.
- **No** garantiza que un player Android acepte un códec o resolución.
- **No** sustituye la medición del dispositivo ni la prueba A/B real.
- El flujo SDD reduce ambigüedad; no elimina la necesidad de tests, revisión y rollback.
- El upstream Hello SDD es un curso; esta skill es una adaptación operativa, no una copia
  literal de sus plantillas.

## 17. Fuente y licencia

- Upstream: `https://github.com/mouredev/hello-sdd` (Apache-2.0, commit `358dfe85`).
- Curso: `https://youtube.com/live/5HaOxAAA5qI`.
- EARS: notación de requisitos condicionales; se usa aquí como estructura de aceptación.

## 18. Salida esperada del agente

Cuando se active esta skill, entrega en este orden:

1. `CONSTITUCIÓN` (si no existe).
2. `SPEC` con RF EARS, alcance y dudas.
3. `CLARIFICACIÓN` (hallazgos, sin resolver).
4. `PLAN` con RF→módulo→test.
5. `TAREAS` con checkbox y “Hecho cuando”.
6. Una sola tarea implementada + tests + salida.
7. `VALIDACIÓN` RF por RF con evidencia.
8. `CAMBIO` con diff de spec si aplica.
