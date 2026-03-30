---
name: Skill_Duplicate_Stream_Detector
description: "Agrupa streams dispares que comparten el mismo fingerprint físico."
---

# Skill_Duplicate_Stream_Detector

## 🎯 Objetivo
Detectar colisiones en los hashes SHA-256 de diferentes canales. Si "HBO Latino Prov 1" y "HBO Prov 2" emiten el mismo fingerprint, esta skill los agrupa bajo un ID unificado. Esto permite realizar derivación anti-cortes (Anti-Cut Fallback) sin que el sistema necesite procesar metadata del video.

## 📥 Inputs
- **Fingerprint Target:** Creado por `Skill_Stream_Fingerprinting`.
- **Global Fingerprint DB:** Mapa en memoria (provisto por el orquestador).

## 📤 Outputs
- `duplicate_group`: string. ID del cluster.
- `is_duplicate`: booleano indicando si alguien ya había registrado esa firma.

## 🧠 Lógica Interna y Reglas
1. La llave del clúster es un acrónimo del Hash.
2. Todo canal que ingrese al motor debe arrojar su fingerprint aquí antes del guardado final. Si coincide con una huella existente, se acopla inmediatamente al grupo asociado.

## 💻 Pseudocódigo
```javascript
function Duplicate_Stream_Detector(fingerprint, activeHashesMap) {
    let duplicate_group = `dup_group_${fingerprint.substring(0, 8)}`;
    let is_duplicate = false;
    
    if (activeHashesMap.has(fingerprint)) {
        is_duplicate = true;
        // Asume el ID del grupo previamente existente si difiere de algún modo
        duplicate_group = activeHashesMap.get(fingerprint).group_id; 
    } else {
        // Registra por primera vez
        activeHashesMap.set(fingerprint, { group_id: duplicate_group });
    }
    
    return { duplicate_group, is_duplicate };
}
```
