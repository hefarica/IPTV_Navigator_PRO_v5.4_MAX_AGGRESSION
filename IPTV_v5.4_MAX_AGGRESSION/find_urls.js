const fs = require('fs');

const html = fs.readFileSync('c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html', 'utf8');
const lines = html.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('input') && lines[i].includes('http')) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
    }
}

// Also check backend credentials
try {
    const creds = fs.readFileSync('c:/Users/HFRC/Desktop/IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION/IPTV_v5.4_MAX_AGGRESSION/backend/ape_credentials.php', 'utf8');
    console.log("Credentials File Content:");
    console.log(creds.substring(0, 1000));
} catch (e) {
    console.error(e);
}
