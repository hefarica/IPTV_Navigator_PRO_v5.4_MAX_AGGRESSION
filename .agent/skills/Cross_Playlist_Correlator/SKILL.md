---
name: Skill_Cross_Playlist_Correlator
description: "Establece mapeos entre canales de Lista A y Lista B."
---

# Skill_Cross_Playlist_Correlator

## 🎯 Objetivo
Resolver la carencia de alta disponibilidad cruzando manifiestos M3U completos sin descargar nada de los videos. Su misión es crear un "Árbol de Respaldo" que conecte canales de una *Lista Proveedora A* hacia canales equivalentes de una *Lista de Backup B* utilizando exclusivamente firmas algorítmicas de Metadata (Hashes).

## 📥 Inputs
- **Fingerprint Target:** Generado por `Skill_Stream_Fingerprinting`.
- **Arrays Topológicos:** Información compilada de *Lista A* y *Lista B*.

## 📤 Outputs
- **Boolean:** `isMatched`.
- **Correlated Node:** Nodo del canal backup.

## 🧠 Lógica Interna y Reglas
1. Esta skill opera fuera de tiempo real (`Offline Indexing`), mapeando y comparando `duplicate_group` IDs. 
2. Si el canal solicitado `HBO` de Lista A cae (status 404), el motor utilizará la salida de correlación previa elaborada por esta skill para derivar inteligentemente hacia el mismo grupo lógico en Lista B.

## 💻 Pseudocódigo
```javascript
function Cross_Playlist_Correlator(fingerprintA, fingerprintB) {
    // La correspondencia es binaria si la derivación topológica SHA-256 es exacta.
    // Esto previene enrutar a un canal SD cuando el usuario veía 4K HDR.
    return fingerprintA === fingerprintB;
}

// Extensión para Mapeo
function Build_Backup_Tree(listA, listB) {
    let backupMap = new Map();
    listA.forEach(chA => {
        let match = listB.find(chB => chB.fingerprint === chA.fingerprint);
        if (match) backupMap.set(chA.id, match.url);
    });
    return backupMap;
}
```
