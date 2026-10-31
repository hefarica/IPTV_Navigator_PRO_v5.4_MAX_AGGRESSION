# MANDATO DE AUTO-CONSTRUCCIÓN DE SKILLS

El agente que implementa el FAKE 4K CRYSTAL CHINO NO recibe skills terminadas.
Está OBLIGADO a:

1. Escribir sus propias skills en /etc/ara/skills/self/<id>.md
2. Cubrir los 9 dominios, mínimo 3 skills por dominio
3. Cada skill: frontmatter (id, domain, source) + Regla + Código ejecutable + Antipatrón
4. Citar fuente real (URL) por skill
5. Responder el examen SIN consultar /etc/ara/skills/SKILLS.md
6. Aprobar con >= 90 puntos y 100% de cobertura de dominios
7. Solo entonces ara-skill-bootstrap emite APPROVED y el canary arranca
8. Si cambia una skill, el hash cambia y debe re-aprobar

PROHIBIDO: copiar SKILLS.md tal cual, skills sin código, skills sin fuente,
inventar parámetros, declarar 8K nativo, declarar AI-SR como NPU.
