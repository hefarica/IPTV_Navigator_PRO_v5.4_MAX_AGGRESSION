# Checklist SSD

## Antes de escribir código

- [ ] ¿Existe `docs/constitution.md`? Si no, proponer y aprobar 6–8 principios.
- [ ] ¿La spec tiene contexto, usuarios, historias y `RF-1..RF-n` en EARS?
- [ ] ¿Cada RF es observable y testeable?
- [ ] ¿Hay casos límite, fuera de alcance y dudas abiertas?
- [ ] ¿La clarificación se hizo como QA, sin resolver?
- [ ] ¿El plan mapea cada RF a módulo y test, con alternativas descartadas?
- [ ] ¿Las tareas son <30 min, ordenadas, con checkbox y `Hecho cuando`?
- [ ] ¿El cambio toca imagen/APE? Añadir truth-guards y medición.

## Durante la implementación

- [ ] Solo se implementa la tarea Tn.
- [ ] El test existe antes o junto al cambio.
- [ ] No se amplía el alcance sin actualizar spec/plan/tasks.
- [ ] No se borran tests ni canales/líneas para pasar.
- [ ] No se escribe en producción sin autorización.
- [ ] Cada afirmación tiene evidencia: comando, salida, ruta.

## Cierre de una tarea

- [ ] Suite en verde y salida mostrada.
- [ ] `Tn` marcada; `Hecho cuando` cumplido.
- [ ] El agente se detuvo y espera.
- [ ] Se actualizó el mapa RF→test si aplica.

## Validación final

- [ ] Todos los RF tienen test y resultado.
- [ ] Casos límite acordados cubiertos.
- [ ] Nada fuera de alcance.
- [ ] `NO VERIFICADO` donde no haya evidencia; no se convierte en PASS.
- [ ] Rollback documentado si toca VPS/producción.

## Rollback

- Código: revertir el commit de la tarea, no la spec.
- Lista: conservar el original y el sidecar; borrar solo la copia derivada.
- VPS: backup + `nginx -t`/`php -l` + rollback según el runbook.
- Datos: restaurar el backup; no borrar evidencia del incidente.
