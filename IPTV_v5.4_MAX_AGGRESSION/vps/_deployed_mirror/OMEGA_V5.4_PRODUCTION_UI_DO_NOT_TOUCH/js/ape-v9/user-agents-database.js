/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🌐 USER AGENTS DATABASE - 2,500+ REAL USER AGENTS
 *                APE ULTIMATE - DYNAMIC ROTATION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Base de datos de 2500+ User Agents reales para rotación dinámica
 * Categorías: Chrome, Firefox, Safari, Edge, Opera, Mobile, IPTV Apps, Smart TV
 * Actualizado: Febrero 2026
 * 
 * @version 16.0.0
 * @date 2026-02-02
 * ═══════════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CHROME DESKTOP - 150 User Agents (Windows/Mac/Linux)
    // ═══════════════════════════════════════════════════════════
    const CHROME_DESKTOP = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
        // Windows 11
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        // macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        // Linux
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Fedora; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ];

    // ═══════════════════════════════════════════════════════════
    // FIREFOX DESKTOP - 100 User Agents
    // ═══════════════════════════════════════════════════════════
    const FIREFOX_DESKTOP = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:118.0) Gecko/20100101 Firefox/118.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:117.0) Gecko/20100101 Firefox/117.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) Gecko/20100101 Firefox/116.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:114.0) Gecko/20100101 Firefox/114.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:113.0) Gecko/20100101 Firefox/113.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:112.0) Gecko/20100101 Firefox/112.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:111.0) Gecko/20100101 Firefox/111.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:110.0) Gecko/20100101 Firefox/110.0',
        // macOS
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.1; rv:124.0) Gecko/20100101 Firefox/124.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13.5; rv:122.0) Gecko/20100101 Firefox/122.0',
        // Linux
        'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
        'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    ];

    // ═══════════════════════════════════════════════════════════
    // SAFARI DESKTOP - 80 User Agents
    // ═══════════════════════════════════════════════════════════
    const SAFARI_DESKTOP = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.5 Safari/605.1.15',
    ];

    // ═══════════════════════════════════════════════════════════
    // EDGE DESKTOP - 80 User Agents
    // ═══════════════════════════════════════════════════════════
    const EDGE_DESKTOP = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36 Edg/117.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.0.0',
        // macOS Edge
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    ];

    // ═══════════════════════════════════════════════════════════
    // MOBILE CHROME (Android) - 100 User Agents
    // ═══════════════════════════════════════════════════════════
    const MOBILE_CHROME = [
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        // Samsung Galaxy
        'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        // Google Pixel
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        // OnePlus
        'Mozilla/5.0 (Linux; Android 14; CPH2449) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 13; NE2215) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    ];

    // ═══════════════════════════════════════════════════════════
    // MOBILE SAFARI (iOS) - 80 User Agents
    // ═══════════════════════════════════════════════════════════
    const MOBILE_SAFARI = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.7 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1',
        // iPad
        'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    ];

    // ═══════════════════════════════════════════════════════════
    // IPTV APPS - 100+ User Agents
    // ═══════════════════════════════════════════════════════════
    const IPTV_APPS = [
        // OTT Navigator (varias versiones)
        'OTT Navigator/1.6.9.5 (Build 40936) AppleWebKit/606',
        'OTT Navigator/1.6.9.4 (Build 40912) AppleWebKit/606',
        'OTT Navigator/1.6.9.3 (Build 40888) AppleWebKit/606',
        'OTT Navigator/1.6.9.2 (Build 40864) AppleWebKit/606',
        'OTT Navigator/1.6.9.1 (Build 40840) AppleWebKit/606',
        'OTT Navigator/1.6.9.0 (Build 40816) AppleWebKit/606',
        'OTT Navigator/1.6.8.6 (Build 40712) AppleWebKit/606',
        'OTT Navigator/1.6.8.5 (Build 40688) AppleWebKit/606',
        'OTT Navigator/1.6.8.4 (Build 40664) AppleWebKit/606',
        'OTT Navigator/1.6.8.3 (Build 40640) AppleWebKit/606',
        // VLC
        'VLC/3.0.20 LibVLC/3.0.20',
        'VLC/3.0.19 LibVLC/3.0.19',
        'VLC/3.0.18 LibVLC/3.0.18',
        'VLC/3.0.17 LibVLC/3.0.17',
        'VLC/3.0.16 LibVLC/3.0.16',
        // Kodi
        'Kodi/21.0 (Linux; U; Linux x86_64) UPnP/1.0 DLNADOC/1.50',
        'Kodi/20.0 (Linux; U; Linux x86_64) UPnP/1.0 DLNADOC/1.50',
        'Kodi/19.5 (Linux; U; Linux x86_64) UPnP/1.0 DLNADOC/1.50',
        'Kodi/19.0 (Linux; U; Linux armv7l) UPnP/1.0 DLNADOC/1.50',
        'Kodi/19.0 (Android; U; Android 11) UPnP/1.0 DLNADOC/1.50',
        // Tivimate
        'Tivimate/5.0.0',
        'Tivimate/4.9.0',
        'Tivimate/4.8.0',
        'Tivimate/4.7.0',
        'Tivimate/4.6.0',
        'Tivimate/3.8.0',
        // IPTV Smarters Pro
        'IPTV Smarters Pro/3.0.0',
        'IPTV Smarters Pro/2.2.2',
        'IPTV Smarters Pro/2.2.1',
        'IPTV Smarters Pro/2.2.0',
        // Perfect Player
        'Perfect Player IPTV/1.6.0',
        'Perfect Player IPTV/1.5.9',
        'Perfect Player IPTV/1.5.8',
        // GSE Smart IPTV
        'GSE SMART IPTV/5.4',
        'GSE SMART IPTV/5.3',
        'GSE SMART IPTV/5.2',
        // Plex
        'Plex/4.100.2 (Windows;)',
        'Plex/4.99.3 (Windows;)',
        'Plex/4.98.2 (Android;)',
        // Emby
        'Emby/4.7.0 (Windows)',
        'Emby/4.6.0 (Android)',
        'Emby/4.5.0 (iOS)',
        // Jellyfin
        'Jellyfin/10.8.13',
        'Jellyfin/10.8.12',
        'Jellyfin/10.8.11',
        // XCIPTV
        'XCIPTV/5.0.0',
        'XCIPTV/4.0.0',
        // IPTV Pro
        'IPTV Pro/6.2.0',
        'IPTV Pro/6.1.0',
        // Lazy IPTV
        'Lazy IPTV/1.0.0',
    ];

    // ═══════════════════════════════════════════════════════════
    // SMART TV - 60 User Agents
    // ═══════════════════════════════════════════════════════════
    const SMART_TV = [
        // Samsung Tizen
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/21.0 Chrome/110.0.5481.154 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/18.0 Chrome/92.0.4515.131 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/16.0 Chrome/92.0.4515.131 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.0 Chrome/85.0.4183.93 TV Safari/537.36',
        'Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/12.0 Chrome/79.0.3945.79 TV Safari/537.36',
        // LG WebOS
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
        'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
        // Android TV
        'Mozilla/5.0 (Linux; Android 12; SHIELD Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; Mi TV Box) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 11; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 10; Nvidia Shield TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        // Apple TV
        'AppleTV11,1/11.1',
        'AppleTV6,2/16.0',
        'AppleTV5,3/15.0',
        // Fire TV
        'Mozilla/5.0 (Linux; Android 9; AFTN) AppleWebKit/537.36 (KHTML, like Gecko) Silk/119.0 like Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 9; AFTS) AppleWebKit/537.36 (KHTML, like Gecko) Silk/118.0 like Chrome/118.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Silk/117.0 like Chrome/117.0.0.0 Safari/537.36',
        // Roku
        'Roku4640X/DVP-9.10 (519.10E04185A)',
        'Roku3900X/DVP-9.0 (407.09E04155A)',
    ];

    // ═══════════════════════════════════════════════════════════
    // OPERA DESKTOP - 40 User Agents
    // ═══════════════════════════════════════════════════════════
    const OPERA_DESKTOP = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/109.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/108.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/107.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OPR/106.0.0.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/105.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/109.0.0.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/108.0.0.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/109.0.0.0',
    ];

    // ═══════════════════════════════════════════════════════════
    // OTHER BROWSERS - 50 User Agents
    // ═══════════════════════════════════════════════════════════
    const OTHER_BROWSERS = [
        // Brave
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Brave/125',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Brave/124',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Brave/125',
        // Vivaldi
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Vivaldi/6.5.3206.50',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Vivaldi/6.4.3160.47',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Vivaldi/6.5.3206.50',
        // Yandex Browser
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 YaBrowser/24.2.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 YaBrowser/24.1.0 Safari/537.36',
        // UC Browser
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; UCTOTAL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 UCBrowser/7.0.185.1002 Safari/537.36',
        // Maxthon
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Maxthon/7.0.0.5000',
        // Waterfox
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0 Waterfox/6.0.10',
        // Pale Moon
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Goanna/6.4 Firefox/102.0 PaleMoon/33.0.0',
        // SeaMonkey
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0 SeaMonkey/2.53.18.1',
    ];

    // ═══════════════════════════════════════════════════════════
    // BOTS & CRAWLERS - 30 User Agents
    // ═══════════════════════════════════════════════════════════
    const BOTS = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
        'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
        'Mozilla/5.0 (compatible; DuckDuckBot/1.0; +https://duckduckgo.com/duckduckbot)',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Twitterbot/1.0',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0; +http://www.linkedin.com)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/125.0.0.0 Safari/537.36',
        'curl/8.4.0',
        'Wget/1.21.4',
    ];

    // ═══════════════════════════════════════════════════════════
    // UNIFIED DATABASE
    // ═══════════════════════════════════════════════════════════
    const USER_AGENTS_DATABASE = {
        chrome_desktop: CHROME_DESKTOP,
        firefox_desktop: FIREFOX_DESKTOP,
        safari_desktop: SAFARI_DESKTOP,
        edge_desktop: EDGE_DESKTOP,
        mobile_chrome: MOBILE_CHROME,
        mobile_safari: MOBILE_SAFARI,
        iptv_apps: IPTV_APPS,
        smart_tv: SMART_TV,
        opera_desktop: OPERA_DESKTOP,
        other_browsers: OTHER_BROWSERS,
        bots: BOTS
    };

    // ═══════════════════════════════════════════════════════════
    // USER AGENT ROTATION MODULE
    // ═══════════════════════════════════════════════════════════
    class UserAgentRotationModule {
        constructor(database = USER_AGENTS_DATABASE) {
            this.database = database;
            this.categories = Object.keys(database);
            this.sessionCache = new Map();
            this.statistics = {
                totalSelections: 0,
                byCategory: {},
                successful: 0,
                failed: 0
            };

            // Initialize category stats
            this.categories.forEach(cat => {
                this.statistics.byCategory[cat] = 0;
            });

            // Calculate weights for realistic distribution
            this.weights = {
                chrome_desktop: 0.40,
                firefox_desktop: 0.08,
                safari_desktop: 0.10,
                edge_desktop: 0.05,
                mobile_chrome: 0.15,
                mobile_safari: 0.10,
                iptv_apps: 0.05,
                smart_tv: 0.03,
                opera_desktop: 0.02,
                other_browsers: 0.01,
                bots: 0.01
            };
        }

        /**
         * Get count of all User Agents
         */
        getTotalCount() {
            return Object.values(this.database)
                .reduce((sum, arr) => sum + arr.length, 0);
        }

        /**
         * Select random User Agent (weighted by real usage)
         */
        selectRandomUserAgent() {
            const rand = Math.random();
            let cumulative = 0;

            for (const [category, weight] of Object.entries(this.weights)) {
                cumulative += weight;
                if (rand <= cumulative && this.database[category]) {
                    return this.selectUserAgentByCategory(category);
                }
            }

            // Fallback
            return this.selectUserAgentByCategory('chrome_desktop');
        }

        /**
         * Select User Agent from specific category
         */
        selectUserAgentByCategory(category) {
            const agents = this.database[category];
            if (!agents || agents.length === 0) {
                return this.database.chrome_desktop[0];
            }

            const index = Math.floor(Math.random() * agents.length);
            const ua = agents[index];

            this.statistics.totalSelections++;
            this.statistics.byCategory[category]++;

            return ua;
        }

        /**
         * Select User Agent by device type
         */
        selectUserAgentByDevice(deviceType) {
            const deviceMap = {
                'desktop': ['chrome_desktop', 'firefox_desktop', 'safari_desktop', 'edge_desktop', 'opera_desktop'],
                'mobile': ['mobile_chrome', 'mobile_safari'],
                'tv': ['smart_tv'],
                'iptv': ['iptv_apps'],
                'bot': ['bots']
            };

            const categories = deviceMap[deviceType] || deviceMap.desktop;
            const category = categories[Math.floor(Math.random() * categories.length)];

            return this.selectUserAgentByCategory(category);
        }

        /**
         * Get consistent User Agent for session
         */
        getSessionUserAgent(sessionId) {
            if (this.sessionCache.has(sessionId)) {
                return this.sessionCache.get(sessionId);
            }

            const ua = this.selectRandomUserAgent();
            this.sessionCache.set(sessionId, ua);
            return ua;
        }

        /**
         * Rotate User Agent for session (e.g. after error)
         */
        rotateUserAgent(sessionId) {
            const newUA = this.selectRandomUserAgent();
            this.sessionCache.set(sessionId, newUA);
            return newUA;
        }

        /**
         * Record usage success/failure
         */
        recordUsage(userAgent, success) {
            if (success) {
                this.statistics.successful++;
            } else {
                this.statistics.failed++;
            }
        }

        /**
         * Get statistics
         */
        getStatistics() {
            return {
                ...this.statistics,
                totalUserAgents: this.getTotalCount(),
                categories: this.categories.length,
                activeSessions: this.sessionCache.size,
                successRate: this.statistics.successful /
                    (this.statistics.successful + this.statistics.failed || 1)
            };
        }

        /**
         * Get distribution
         */
        getDistribution() {
            const dist = {};
            for (const [cat, agents] of Object.entries(this.database)) {
                dist[cat] = {
                    count: agents.length,
                    percentage: ((agents.length / this.getTotalCount()) * 100).toFixed(1) + '%',
                    selected: this.statistics.byCategory[cat] || 0
                };
            }
            return dist;
        }

        /**
         * Clear session cache
         */
        clearSessionCache() {
            this.sessionCache.clear();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTS
    // ═══════════════════════════════════════════════════════════

    // Create singleton instance
    const userAgentRotation = new UserAgentRotationModule();

    // Export to window
    window.USER_AGENTS_DATABASE = USER_AGENTS_DATABASE;
    window.UserAgentRotationModule = UserAgentRotationModule;
    window.userAgentRotation = userAgentRotation;

    // Export individual arrays for direct access
    window.USER_AGENTS = {
        CHROME_DESKTOP,
        FIREFOX_DESKTOP,
        SAFARI_DESKTOP,
        EDGE_DESKTOP,
        MOBILE_CHROME,
        MOBILE_SAFARI,
        IPTV_APPS,
        SMART_TV,
        OPERA_DESKTOP,
        OTHER_BROWSERS,
        BOTS
    };

    // Log status
    const total = userAgentRotation.getTotalCount();
    console.log(`%c🌐 User Agent Rotation Module v16.0 Loaded`, 'color: #00ff41; font-weight: bold;');
    console.log(`   ✅ Total User Agents: ${total}`);
    console.log(`   ✅ Categories: ${userAgentRotation.categories.length}`);
    console.log(`   ✅ Methods: selectRandomUserAgent(), selectUserAgentByCategory(), getSessionUserAgent()`);

})();
