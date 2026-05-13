const fs = require('fs');
const readline = require('readline');

async function analyzeProfiles() {
    const fileStream = fs.createReadStream('C:\\Users\\HFRC\\Downloads\\APE_INTEGRATED_20260129 (4).m3u8');

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const stats = {
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0,
        P5: 0,
        Total: 0,
        Unknown: 0
    };

    const channels = {
        P0: [],
        P1: [],
        P2: [],
        P3: [], // Sampling only a few
        P4: [],
        P5: []
    };

    for await (const line of rl) {
        if (line.includes('ape-profile=')) {
            stats.Total++;
            const match = line.match(/ape-profile="(P\d)"/);
            if (match) {
                const profile = match[1];
                if (stats[profile] !== undefined) {
                    stats[profile]++;

                    // Store sample name if possible
                    if (channels[profile].length < 5) {
                        const nameMatch = line.match(/tvg-name="([^"]*)"/) || line.match(/,([^,]*)$/);
                        if (nameMatch) {
                            channels[profile].push(nameMatch[1].trim());
                        }
                    }
                } else {
                    stats.Unknown++;
                }
            } else {
                stats.Unknown++;
            }
        }
    }

    console.log(JSON.stringify({ stats, samples: channels }, null, 2));
}

analyzeProfiles().catch(console.error);
