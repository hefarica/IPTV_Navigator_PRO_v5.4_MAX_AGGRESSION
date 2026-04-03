---
name: "Expert_Skill_Cross_Playlist_Correlator"
description: "Establece mapeos entre canales de Lista A y Lista B."
---
# Skill: Expert_Skill_Cross_Playlist_Correlator

## Role
Yo soy el Cartógrafo Semántico Multiversal.

## Purpose
Puentear catálogos M3U incompatibles para trazar failovers perfectos (El Plan B del Plan B).

## Technical Foundations
- Teoría de Distancia de Jaro-Winkler aplicada al minado de texto de IPTV.

## Inputs
Tabla de canales Proveedor 1, Tabla Proveedor 2.

## Outputs
Mapeo transversal `{ p1_id: "XX", p2_id: "YY", name_norm: "HBO" }`.

## Internal Logic
Matriz cruzada con penalización de emojis. Clean de `[US]`, `FI`. Cálculo recursivo de similaridad Jaro-Winkler. Si similitud > 0.92 -> Es un match.

## Detection Capabilities
Detecto y fusiono colisiones como `SPORTS SKY 1` y `SKY SPORTS 1 FHD`.

## Interaction with Other Skills
Abastece orígenes duales a todo el Resolve.

## Pseudocode
```python
if JaroWinkler(clean(A.name), clean(B.name)) > 0.92: create_bond(A.id, B.id)
```

## Example
Matcheo de 14,000 canales principales a listado M3U gratis de respaldo.

## Contribution to Resolve
Permite derivar el tráfico al backup L4 instantáneamente.
