# Plan de despliegue operativo — NET SHIELD

## 1. Propósito del documento

Este documento convierte la auditoría técnica de **NET SHIELD** en un **plan de despliegue controlado**, orientado a pasar desde el estado actual —funcional y optimizado para rendimiento— hacia una arquitectura **determinista, validable tras reinicio y preparada para observabilidad, auto-validación y ruteo adaptativo incremental**. El criterio rector del plan es preservar lo que ya funciona en producción, eliminar fragilidad silenciosa y habilitar evolución por capas sin introducir regresiones en tráfico IPTV.

La premisa operativa es simple: el entorno actual ya entrega valor real en WireGuard, NAT, DNS por túnel, marcado DSCP, MSS clamping y tuning TCP, pero exhibe señales claras de **fragilidad de configuración post-reinicio**. Por lo tanto, el despliegue no debe plantearse como reconstrucción total, sino como **hardening progresivo con validación por fases**.

## 2. Resumen ejecutivo

La auditoría deja una conclusión central: el sistema en producción está por encima del diseño original de Fase 3 en rendimiento, pero por debajo de un estándar aceptable de determinismo operativo. En términos prácticos, el objetivo inmediato no debe ser “hacer más”, sino **hacer confiable lo que ya está funcionando**. Solo después de estabilizar la base conviene activar collector, scoring, advisory routing y, finalmente, routing adaptativo.

| Eje | Estado actual | Objetivo de despliegue |
|---|---|---|
| WireGuard | Activo y productivo | Mantener servicio sin cambios disruptivos |
| NAT | Funcional pero amplio | Restringir al prefijo del túnel |
| DSCP | Activo pero con riesgo por `PostUp` concatenado | Separar y validar reglas deterministas |
| FORWARD | Operativo pero duplicado | Limpiar y dejar conjunto mínimo explícito |
| DNS por túnel | Correcto | Preservar sin cambios estructurales |
| Validación post-reboot | Insuficiente | Implementar validación automática y remediación |
| Observabilidad | Parcial | Añadir métricas JSONL y estado persistente |
| Adaptive routing | No desplegado | Introducir por etapas: observe, advisory, active |

## 3. Principios de despliegue

El despliegue debe ejecutarse bajo cuatro principios. Primero, **no romper el plano de datos existente**: cualquier cambio que pueda afectar continuidad de IPTV debe aplicarse en ventanas controladas y con rollback inmediato preparado. Segundo, **hacer explícito todo lo implícito**: reglas, rutas, timers, modos operativos y archivos de estado deben quedar declarados y verificables. Tercero, **medir antes de automatizar decisiones**: no se activará ruteo adaptativo sin un período previo de observación real. Cuarto, **preferir cambios pequeños y reversibles** sobre refactors amplios.

> La arquitectura actual debe evolucionar desde un enfoque **performance-first, determinism-second** hacia un modelo **performance con determinismo verificable**.

## 4. Alcance del plan

Este plan cubre el endurecimiento de la configuración WireGuard, la normalización de iptables, la validación automática posterior a eventos críticos, la creación de una capa de observabilidad base, la incorporación de scoring operacional y la transición gradual hacia ruteo adaptativo. No incluye rediseño de Unbound, cambio del modelo full-tunnel del ONN 4K ni introducción temprana de `tc` o mecanismos complejos de control de colas.

| Incluido en este despliegue | Excluido en esta etapa |
|---|---|
| Corrección de `PostUp`/`PostDown` | Reemplazo de full-tunnel por split-tunnel |
| Restricción de NAT a `10.200.0.0/24` | Rediseño profundo de DNS |
| Limpieza de reglas duplicadas | Microservicios o IA pesada |
| Validación automática con timers | `tc` avanzado desde el día uno |
| Estado persistente y logs JSONL | Cambios radicales en topología |
| Modos observe-only, advisory y active | Optimización prematura no sustentada por métricas |

## 5. Estado base que se asume antes de desplegar

Antes de tocar configuración, el operador debe verificar que el entorno conserva el mismo estado descrito por la auditoría: `wg-quick@wg0` activo, peer con handshakes recientes, tráfico real cursando por el túnel, `unbound` escuchando en `10.200.0.1`, `ip_forward=1`, reglas mangle presentes, MSS clamping activo y puerto UDP 51820 permitido. Si cualquiera de esas condiciones ya no se cumple, el despliegue debe suspenderse y convertirse primero en una tarea de restauración de baseline.

## 6. Secuencia de despliegue recomendada

La ruta correcta no es saltar directamente a Fase 4, sino desplegar en cinco etapas operativas. Cada etapa debe cerrar con validación formal y criterio de aceptación. Si una etapa no pasa, no se avanza a la siguiente.

| Etapa | Nombre | Objetivo operacional | Riesgo |
|---|---|---|---|
| 0 | Baseline y resguardo | Capturar estado actual y preparar rollback | Bajo |
| 1 | Hardening determinista | Corregir config frágil sin cambiar arquitectura | Medio |
| 2 | Auto-validación | Detectar y restaurar desvíos post-reboot | Medio |
| 3 | Observabilidad y scoring | Medir hosts/origins con persistencia | Medio |
| 4 | Advisory routing | Simular decisiones sin aplicarlas | Medio |
| 5 | Active adaptive routing | Aplicar cambios controlados con anti-flapping | Alto |

## 7. Etapa 0 — Baseline, inventario y rollback

La primera etapa debe producir una instantánea completa del sistema. No es burocracia; es el mecanismo que separa un cambio profesional de una modificación riesgosa. Debe conservarse copia de `wg0.conf`, `onn.conf`, reglas actuales de iptables, salida de `wg show`, tablas de rutas, `ip rule`, configuración de Unbound relevante y estado de unidades systemd implicadas. Además, deben identificarse los archivos `wg0.conf.bak*` para evitar ambigüedad durante el despliegue.

La salida esperada de esta etapa es un directorio de respaldo con timestamp y un procedimiento de reversión probado a nivel documental. Ninguna corrección posterior debe iniciarse si este paquete de baseline no existe.

## 8. Etapa 1 — Hardening determinista de red

Esta etapa corrige las fragilidades silenciosas detectadas por la auditoría sin alterar la filosofía general del sistema. El primer cambio es separar las directivas `PostUp` y `PostDown` de DSCP para que cada regla sea independiente y re-aplicable tras restart de `wg-quick`. El segundo cambio es restringir `MASQUERADE` al origen `10.200.0.0/24`, preservando la funcionalidad del túnel y recuperando trazabilidad sobre tráfico local del VPS. El tercer cambio es eliminar duplicados `FORWARD`, dejando una política mínima, explícita y auditable.

| Cambio | Acción exacta | Justificación | Validación inmediata |
|---|---|---|---|
| DSCP `PostUp` | Separar PREROUTING y POSTROUTING en líneas distintas | Evitar pérdida silenciosa de QoS tras reinicio | Reiniciar `wg-quick` y comprobar reglas mangle |
| DSCP `PostDown` | Separar eliminaciones en líneas distintas | Garantizar limpieza simétrica | Bajar/subir interfaz y verificar consistencia |
| NAT | Cambiar a `-s 10.200.0.0/24 -o eth0 -j MASQUERADE` | Limitar alcance del NAT | Confirmar navegación del peer y ausencia de efecto lateral |
| FORWARD | Eliminar reglas redundantes `-A` o duplicadas | Reducir ruido y deriva de configuración | Comparar `iptables-save` antes y después |
| Archivos backup ambiguos | Renombrar, mover o documentar con claridad | Evitar cargas accidentales de config obsoleta | Revisar ruta del archivo activo |

En esta etapa también conviene endurecer permisos del archivo principal de WireGuard y fijar una política explícita de edición. Sin embargo, aplicar inmutabilidad de archivo debe dejarse para el cierre de la etapa, no para el inicio, porque primero se debe demostrar que la nueva configuración reinicia sin pérdida funcional.

## 9. Etapa 2 — Auto-validación y remediación mínima

Una vez que la configuración de red sea determinista, el siguiente paso es instrumentar validación continua. Aquí no se persigue “inteligencia”, sino **consistencia operativa**. Debe incorporarse un validador que compruebe WireGuard, handshake reciente, NAT, reglas DSCP y MSS clamping. Si detecta ausencia de un elemento crítico, debe restaurarlo y registrar el evento.

El patrón de ejecución correcto es mediante servicios y temporizadores del sistema, no con cron implícito ni scripts aislados sin control de ciclo de vida. La frecuencia inicial recomendada es cada 30 segundos para el validador, con registro estructurado y sin acciones agresivas sobre el túnel salvo que exista evidencia clara de caída o desalineación persistente.

| Componente | Requisito de despliegue | Criterio de aceptación |
|---|---|---|
| `validate.sh` o `netshield-validator.sh` | Debe comprobar WG, NAT, mangle y MSS | Detecta y corrige faltantes sin duplicar reglas |
| `netshield.service` | Debe ejecutar el validador de forma idempotente | Finaliza limpio y deja logs consistentes |
| `netshield.timer` | Debe disparar validación periódica | Corre tras boot y mantiene frecuencia esperada |
| Logs | Deben quedar en formato estructurado o al menos consistente | Permiten postmortem simple y trazable |

## 10. Etapa 3 — Observabilidad y scoring en modo observe-only

Cuando la base ya se comporta de forma predecible tras reinicio, se habilita la capa de medición real. El collector debe registrar RTT, jitter, pérdida, tiempo de conexión TCP, TTFB de segmentos HLS, tiempo de resolución DNS, HTTP status y errores. Esta etapa no cambia rutas. Solo observa, mide y persiste estado.

La estructura recomendada es declarativa bajo `/opt/netshield/`, con `config/`, `state/`, `logs/`, `bin/` y `systemd/`. El collector debe escribir métricas en JSONL y el scorer debe mantener un `state.json` con score bruto, score EMA, estado del host, contadores de fallo y cooldown potencial. Durante esta etapa, el sistema debe permanecer al menos entre 24 y 72 horas en modo observe-only para construir una línea base real.

| Artefacto | Contenido mínimo |
|---|---|
| `hosts.yml` | Origins, IPs, URL de probe y clase operacional |
| `scoring.yml` | Pesos, umbrales, EMA, cooldown y contadores |
| `collector.py` | Medición real de red y HTTP sin mocks |
| `scorer.py` | Cálculo de score, EMA y clasificación de estado |
| `state.json` | Estado persistente por host/destino |
| `metrics.jsonl` | Una línea por muestra con timestamp y métricas |
| `decisions.jsonl` | Decisiones calculadas, aunque no aplicadas |

## 11. Etapa 4 — Advisory routing

El paso siguiente no consiste en cambiar la red, sino en **demostrar que las decisiones automáticas serían correctas**. En modo advisory, el sistema calcula qué política o tabla habría elegido para cada origin, pero no ejecuta `ip rule`, ni cambia `fwmark`, ni toca rutas activas. Esto permite validar umbrales, histéresis, contadores y cooldown usando tráfico real sin impacto productivo.

La duración mínima recomendada de esta etapa es una ventana suficiente para capturar degradaciones reales, idealmente varios ciclos diarios. El criterio de salida es que las decisiones propuestas muestren coherencia con las métricas observadas y que no aparezcan oscilaciones frecuentes en hosts con comportamiento marginal.

## 12. Etapa 5 — Active adaptive routing

Solo cuando observe-only y advisory hayan sido satisfactorios debe activarse el ruteo adaptativo real. En esta etapa se introducen `ip rule`, tablas de ruteo dedicadas y marcado por destino/origin mediante `fwmark`. La activación debe comenzar con un subconjunto reducido de destinos de prueba y con cooldown estricto. No deben permitirse cambios por mediciones aisladas; la degradación debe requerir fallos consecutivos y la recuperación debe exigir una secuencia más larga de éxitos.

| Mecanismo | Recomendación inicial |
|---|---|
| Degradación | 3 fallos consecutivos |
| Recuperación | 5 checks buenos consecutivos |
| Cooldown | 180 segundos como punto de partida |
| Frecuencia de cambio | Máximo un cambio por destino por ventana |
| Scope inicial | Solo hosts más relevantes y mejor entendidos |

## 13. Validación por etapa

Cada etapa debe cerrarse con pruebas concretas. En hardening, la prueba principal es reiniciar `wg-quick@wg0` y confirmar supervivencia de NAT, DSCP y MSS. En auto-validación, la prueba principal es simular pérdida de reglas y comprobar remediación automática. En observabilidad, la prueba principal es consistencia de logs y estado persistente. En advisory, la prueba principal es estabilidad de decisiones. En active routing, la prueba principal es continuidad de servicio con cambios controlados y sin flapping.

| Etapa | Prueba crítica | Resultado esperado |
|---|---|---|
| 1 | Restart controlado de WireGuard | Reglas y servicio siguen íntegros |
| 2 | Borrado puntual de una regla crítica | El validador la restaura y registra |
| 3 | Ventana de 24–72 h | Métricas útiles, JSONL consistente, sin impacto en tráfico |
| 4 | Revisión de decisiones sugeridas | Coherencia entre score y recomendación |
| 5 | Activación parcial de rutas adaptativas | Sin buffering inducido, sin oscilación excesiva |

## 14. Ventana de cambio y control operativo

El despliegue debe realizarse en una ventana en la que exista baja sensibilidad de usuarios o consumo, con acceso administrativo continuo al VPS y capacidad de observación en tiempo real. Antes de cada cambio se debe anunciar internamente un punto de no retorno temporal, aunque sea una operación individual. Tras cada cambio debe existir un período corto de observación antes de ejecutar el siguiente. En otras palabras, el plan debe operarse como una secuencia de *checkpoints*, no como un bloque monolítico.

## 15. Riesgos principales y mitigaciones

El mayor riesgo no es una caída total del túnel, sino una degradación parcial difícil de ver, especialmente pérdida de DSCP o inconsistencia de reglas tras restart. También existe riesgo de introducir falsa inteligencia si se activa adaptive routing antes de contar con serie temporal suficiente. Por ello, el plan depende fuertemente de validación incremental y de registros persistentes.

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pérdida de DSCP tras reinicio | Degradación silenciosa de calidad | Separar `PostUp`, validar tras restart y auditar mangle |
| NAT demasiado amplio | Ambigüedad operativa y trazabilidad pobre | Restringir NAT al prefijo WG |
| Duplicación progresiva de reglas | Debugging complejo y deriva | Dejar política mínima e idempotente |
| Flapping de rutas | Inestabilidad y peor experiencia IPTV | Cooldown, histéresis y advisory previo |
| Score mal calibrado | Decisiones erróneas | Observe-only suficiente y revisión de umbrales |

## 16. Plan de rollback

El rollback debe ser simple, corto y ensayable. Si falla la Etapa 1, se revierte inmediatamente a la configuración `wg0.conf` previa, se restauran reglas desde el snapshot de iptables y se reinicia únicamente lo necesario. Si falla la Etapa 2, se deshabilitan las unidades del validador y se vuelve a operación manual sin tocar la base de red ya saneada. Si falla la Etapa 3 o 4, basta con desactivar collector, scorer o router sin desmontar WireGuard ni Unbound. Si falla la Etapa 5, el sistema debe volver a tabla principal, limpiar `ip rule` y marcas introducidas por NetShield, y retornar a observe-only.

| Falla en etapa | Rollback mínimo |
|---|---|
| 1 | Restaurar `wg0.conf`, recargar reglas previas y reiniciar interfaz |
| 2 | Deshabilitar timer/service de validación y conservar hardening base |
| 3 | Desactivar collector/scorer; mantener red intacta |
| 4 | Desactivar modo advisory; conservar observabilidad |
| 5 | Eliminar reglas/marks/tablas NetShield y volver a política estática |

## 17. Criterios de salida a producción estable

Puede considerarse que NET SHIELD ha pasado a una operación madura cuando el entorno supera cinco condiciones. La primera es que reinicios de `wg-quick` no alteren NAT, DSCP ni MSS. La segunda es que el validador detecte y repare desvíos reales sin producir duplicidad o ruido excesivo. La tercera es que el collector y el scorer generen datos útiles y persistentes durante varios días. La cuarta es que el modo advisory demuestre decisiones estables. La quinta es que el modo active opere con cambios medidos, pocos switches y sin degradación perceptible.

## 18. Recomendación final de ejecución

La recomendación operativa es desplegar en el siguiente orden: **Etapa 0 y 1 en la misma ventana**, observar; luego **Etapa 2** y validar reinicio; después **Etapa 3** durante al menos 24–72 horas; a continuación **Etapa 4** durante un período comparable; y solo después abrir **Etapa 5** sobre un subconjunto de destinos. Este orden respeta el hallazgo central de la auditoría: el sistema ya rinde bien, pero necesita volverse **determinista antes de volverse inteligente**.

> En términos de arquitectura, el éxito del despliegue no se mide por cuántas funciones nuevas se activan, sino por cuánta **capacidad de recuperación, trazabilidad y control** gana el sistema sin perder la ventaja de rendimiento ya conseguida.

## 19. Próximo entregable sugerido

Si el siguiente paso es operativo, el documento que conviene construir a continuación no es otro diagnóstico, sino un **runbook de implementación** con comandos exactos, archivos destino, validaciones por comando y checklist de aceptación. Ese runbook debe derivarse directamente de este plan y ejecutarse por etapas, comenzando por hardening determinista y auto-validación.
