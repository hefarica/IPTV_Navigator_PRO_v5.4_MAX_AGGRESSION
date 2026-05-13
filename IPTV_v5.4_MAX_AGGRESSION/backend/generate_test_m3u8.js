const fs = require('fs');
const jsCode = fs.readFileSync('../frontend/js/ape-v9/m3u8-typed-arrays-ultimate.js', 'utf8');

// Mock DOM
global.window = {
    ApeModuleManager: { isEnabled: () => true },
    app: { state: { activeServers: [], currentServer: null } },
    btoa: (str) => Buffer.from(str).toString('base64'),
    StreamingCalculator: { calculateAllMetrics: () => ({riskScore: 0, memoryPeak: 0, memorySteady: 0, stallRate: 0, stallQuality: {level:'EXCELLENT'}, bwHeadroomPercent: 300, t1: 50, t2: 50, jitterMax: 10, fillTime: 2, riskLevel: 'SAFE', stability: {class: 'STABLE'} }) }
};
global.localStorage = { getItem: () => null };
global.btoa = global.window.btoa;

// Mock some dependencies missing from the script
const UAPhantomEngine_code = 
    global.UAPhantomEngine = {
        getLayeredUA: () => ({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', extvlcopt: '', kodiprop: '' }),
        getForChannel: () => ({ ua: 'Mozilla/5.0' })
    };
    global.generateNonce = () => 'jy97ymjmlb';
    global.sanitizeCredential = (t) => t;
    global._cortexTempBanHash = null;
    global.VERSION = '17.2';
;

// Evaluate the script safely
try {
    eval(UAPhantomEngine_code + jsCode);
    
    // Create a mock channel
    const channel = {
        name: '|TR| EUROSPORT 2 4K [TIVISION]',
        tvg_id: '707',
        tvg_logo: 'http://picon.tivi-ott.net:25461/picon/TURKEY/Eurosport.png',
        group_title: 'ASIA ORIENTE MEDIO/DEPORTES/ULTRA HD',
        url: 'http://line.tivi-ott.net/live/3JHFTC/U56BDP/707.m3u8',
        stream_id: '707',
        _classification: { type: 'P1' }
    };
    
    const profile = 'P1';
    const index = 1;

    let result = '';
    result += '#EXTM3U x-tvg-url="https://epg.example.com/guide.xml" catchup="flussonic" catchup-days="7"\n';
    result += '#EXT-X-VERSION:7\n';
    result += '#EXT-X-INDEPENDENT-SEGMENTS\n';
    result += '#EXT-X-START:TIME-OFFSET=-3.0,PRECISE=YES\n';
    result += '#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.0,CAN-SKIP-UNTIL=12.0\n';
    result += '#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.ape.net/v1",PATHWAY-ID="PRIMARY"\n';
    result += '#EXT-X-SESSION-DATA:DATA-ID="com.ape.session",VALUE="v=6.0&build=NUCLEAR"\n';
    result += '#EXT-X-DEFINE:NAME="cdn",VALUE="http://ky-tv.cc:80"\n';
    
    result += global.generateChannelEntry(channel, profile, index);
    
    fs.writeFileSync('C:/Users/HFRC/Desktop/OMEGA_CRYSTAL_TEST_10_10.m3u8', result, 'utf8');
    const lines = result.split('\n');
    console.log('SUCCESS! Lines count: ' + lines.length);
} catch (e) {
    console.log('Error evaluating the script: ' + e.message);
}
