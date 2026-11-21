const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        // Output all console messages from the page
        page.on('console', msg => {
            const type = msg.type();
            if (type === 'error' || type === 'warning') {
                console.log(`[PAGE ${type.toUpperCase()}] ${msg.text()}`);
            }
        });
        
        page.on('pageerror', error => {
            console.log(`[PAGE EXCEPTION] ${error.message}`);
        });
        
        page.on('requestfailed', request => {
            console.log(`[PAGE REQUEST FAILED] ${request.url()} - ${request.failure().errorText}`);
        });

        console.log("Navigating to index-v4.html...");
        await page.goto('http://127.0.0.1:5500/IPTV_v5.4_MAX_AGGRESSION/frontend/index-v4.html', { waitUntil: 'networkidle2', timeout: 10000 });
        
        console.log("Page loaded. Taking a screenshot...");
        await page.screenshot({path: 'headless_test_screenshot.png'});

        console.log("Simulating Generation button click...");
        // Evaluate in page to trigger the generator exactly as the UI does
        await page.evaluate(() => {
            if (window.app && typeof window.app.generateM3U8_TypedArrays === 'function') {
                window.app.generateM3U8_TypedArrays({hud: false});
            } else {
                console.error("generateM3U8_TypedArrays not found on window.app!");
            }
        });
        
        // Wait a few seconds for generation to start and potentially crash
        await new Promise(r => setTimeout(r, 5000));
        
        await browser.close();
        console.log("Browser closed.");
    } catch (e) {
        console.error("Puppeteer Script Error:", e.message);
    }
})();
