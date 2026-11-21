const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, 'channels_map.json');
let data;
try {
    data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    console.log('Original map loaded, keys:', Object.keys(data).length);
} catch (e) {
    console.error('Error loading map:', e);
    process.exit(1);
}

const channelsToUpdate = ['rtk.al', '30', 'beinsports1fr.qa'];
let updated = 0;

channelsToUpdate.forEach(ch => {
    if (data[ch]) {
        data[ch].fallbacks = [
            {
                origin: 'pro.123sat.net:2082',
                user: 'backup1',
                pass: 'pass1',
                stream_id: ch + '_bkp1'
            },
            {
                origin: 'line.dndnscloud.ru',
                user: 'f828e5e261',
                pass: 'e1372a7053f1',
                stream_id: ch
            }
        ];
        updated++;
    }
});

fs.writeFileSync(mapPath, JSON.stringify(data, null, 2));
console.log(`Fallbacks inyectados con éxito en ${updated} canales de channels_map.json`);
