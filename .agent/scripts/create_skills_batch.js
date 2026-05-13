const fs = require('fs');
const path = require('path');

const inputFiles = ['macro1.json', 'macro2.json', 'macro3.json', 'macro4.json', 'macro5.json', 'macro6.json', 'macro7.json', 'macro8.json', 'macro9.json', 'macro10.json'];
const outputDir = path.join('C:\\Users\\HFRC\\Desktop\\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\\.agent\\skills');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

let skillCount = 0;

inputFiles.forEach(file => {
    const filePath = path.join('C:\\Users\\HFRC\\.gemini\\antigravity\\brain\\8c29323a-8e7b-4256-be94-1eee0a078f3f', file);
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return;
    }
    
    let raw = fs.readFileSync(filePath, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch(err) {
        console.error(`Invalid JSON in ${file}`, err);
        return;
    }

    data.forEach(roleData => {
        const rol = roleData.rol;
        roleData.skills.forEach(skill => {
            skillCount++;
            
            // Create a safe directory name
            const dirName = 'skill_' + skill.nombre
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_{2,}/g, '_')
                .substring(0, 50).replace(/_$/, '');
            
            const skillDir = path.join(outputDir, dirName);
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }

            const mdContent = `---
description: ${rol} - ${skill.nombre}
---
# ${skill.nombre}

## 1. Definición Operativa
${skill.definicion}

## 2. Capacidades Específicas
${skill.capacidades.map(cap => `- ${cap}`).join('\n')}

## 3. Herramientas y Tecnologías
**${skill.herramientas}**

## 4. Métrica de Dominio
**Métrica Clave:** ${skill.metrica}

## 5. Ejemplo Real Aplicado
> **Caso de Estudio Operativo:**
> ${skill.ejemplo}
`;

            fs.writeFileSync(path.join(skillDir, 'SKILL.md'), mdContent, 'utf8');
        });
    });
});

console.log('✅ Generación Atómica Completada!');
console.log(`📦 Se parsearon y desplegaron exitosamente ${skillCount} Archivos Skill.md FAANG-Grade en la bóveda .agent/skills.`);
