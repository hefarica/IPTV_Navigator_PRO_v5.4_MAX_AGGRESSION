---
description: [Estabilizador de Reproducción Inicial (Zero-Freeze Zapping)]
---
# Skill_Initial_Playback_Stabilizer

## Descripción
Componente rector del modo de arranque. Detecta el instante exacto de la reconexión o Zapping (`strikes == 0`) e interviene temporalmente la física de reproducción.

## Operación (Fase Impulso)
- Evita que los filtros masivos de luminancia (zscale) asfixien el hardware en los primeros 10 segundos.
- Inyecta colchones ciegos de memoria cache masiva (`network-caching=20000ms`, `multiplier=8`).
- Desacelera silenciosamente tras los primeros segundos garantizando inicio de película ininterrumpido.
