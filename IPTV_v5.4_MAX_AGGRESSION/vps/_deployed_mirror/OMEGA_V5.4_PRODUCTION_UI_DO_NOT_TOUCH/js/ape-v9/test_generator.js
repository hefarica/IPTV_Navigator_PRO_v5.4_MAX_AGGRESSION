const fs = require('fs');

const code = fs.readFileSync('C:\\Users\\HFRC\\Desktop\\IPTV_Navigator_PRO_v5.4_MAX_AGGRESSION\\IPTV_v5.4_MAX_AGGRESSION\\frontend\\js\\ape-v9\\m3u8-typed-arrays-ultimate.js', 'utf8');

// Mock browser globals
global.window = global;
global.self = global;
global.btoa = str => Buffer.from(str).toString('base64');
global.UAPhantomEngine = { get: () => 'MockUA' };
global.getProfileConfig = () => ({ bandwidth: 80000000 });
global.getRandomIp = () => '0.0.0.0';
global.generateJWT68Fields = () => ({ token: 'mocktoken', sessionId: 'mocksess', reqId: 'mockreq' });
global.build_exthttp = () => '#EXTHTTP:{"User-Agent":"MockUA"}';
global.HttpAnabolicEngine = { buildAnabolicPayload: () => ({}) };
global.buildChannelUrl = () => 'http://example.com/live/user/pass/123.ts';
global.generateEXTINF = () => '#EXTINF:-1 tvg-id="",Channel Name';
global.FRONTCDN_FORCE_TS_HOSTS = [];
global.CLEAN_URL_MODE = false;

// Mock variables that might be missing
const channel = { id: '123', name: 'Mock Channel', type: 'live' };
const profile = 'P5';
const index = 0;
const credentialsMap = {};

try {
    // Evaluate the file (which contains generateChannelEntry)
    eval(code);
    
    // Call generateChannelEntry
    const result = generateChannelEntry(channel, profile, index, credentialsMap);
    console.log("GENERATION SUCCESS!");
    console.log(result.split('\n').filter(l => l.startsWith('http')).join('\n'));
} catch (e) {
    console.error("GENERATION FAILED!");
    console.error(e.stack);
}
