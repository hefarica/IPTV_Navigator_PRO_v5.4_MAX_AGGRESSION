/**
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 📤 APE Quality Icons - Upload to Cloudflare R2
 * ═══════════════════════════════════════════════════════════════════════════════════
 * 
 * Este script sube los iconos de calidad a Cloudflare R2.
 * 
 * REQUISITOS:
 * 1. Node.js instalado
 * 2. Wrangler CLI configurado (npx wrangler login)
 * 
 * USO:
 * cd iptv_nav/files/icons
 * node upload-icons-to-r2.js
 * 
 * O usando wrangler directamente:
 * npx wrangler r2 object put ape-iptv-channels/icons/quality-ultra-hd.svg --file=quality-ultra-hd.svg
 * ═══════════════════════════════════════════════════════════════════════════════════
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuración
const R2_BUCKET_NAME = 'apelistv2';  // Nombre correcto del bucket
const ICONS_PREFIX = 'icons';

// Lista de iconos a subir
const ICONS = [
    { file: 'quality-ultra-hd.svg', contentType: 'image/svg+xml' },
    { file: 'quality-full-hd.svg', contentType: 'image/svg+xml' },
    { file: 'quality-sd.svg', contentType: 'image/svg+xml' }
];

console.log(`
╔═══════════════════════════════════════════════════════════════════════════════════╗
║ 📤 APE Quality Icons - Upload to Cloudflare R2                                    ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
`);

async function uploadIcons() {
    const currentDir = __dirname || process.cwd();
    
    for (const icon of ICONS) {
        const filePath = path.join(currentDir, icon.file);
        const r2Key = `${ICONS_PREFIX}/${icon.file}`;
        
        // Verificar si el archivo existe
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  Archivo no encontrado: ${icon.file}`);
            continue;
        }
        
        console.log(`📤 Subiendo ${icon.file} → ${r2Key}...`);
        
        try {
            // Usar wrangler para subir
            const command = `npx wrangler r2 object put ${R2_BUCKET_NAME}/${r2Key} --file="${filePath}" --content-type="${icon.contentType}"`;
            
            execSync(command, { 
                stdio: 'pipe',
                cwd: path.join(currentDir, '../../cf_worker')
            });
            
            console.log(`✅ ${icon.file} subido correctamente`);
        } catch (error) {
            console.error(`❌ Error subiendo ${icon.file}:`, error.message);
        }
    }
    
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════════╗
║ ✅ Proceso completado                                                             ║
╠═══════════════════════════════════════════════════════════════════════════════════╣
║ URLs de los iconos:                                                               ║
║ • ULTRA HD: /public/icons/quality-ultra-hd.svg                                   ║
║ • FULL HD:  /public/icons/quality-full-hd.svg                                    ║
║ • SD:       /public/icons/quality-sd.svg                                         ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
    `);
}

// También mostrar comandos manuales por si el script falla
console.log(`
📋 Comandos manuales (ejecutar desde cf_worker/):

npx wrangler r2 object put ${R2_BUCKET_NAME}/icons/quality-ultra-hd.svg --file="../icons/quality-ultra-hd.svg" --content-type="image/svg+xml"
npx wrangler r2 object put ${R2_BUCKET_NAME}/icons/quality-full-hd.svg --file="../icons/quality-full-hd.svg" --content-type="image/svg+xml"
npx wrangler r2 object put ${R2_BUCKET_NAME}/icons/quality-sd.svg --file="../icons/quality-sd.svg" --content-type="image/svg+xml"
`);

uploadIcons().catch(console.error);
