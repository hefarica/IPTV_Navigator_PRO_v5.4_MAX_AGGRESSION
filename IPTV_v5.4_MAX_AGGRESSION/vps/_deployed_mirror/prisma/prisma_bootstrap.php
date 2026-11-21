<?php
/**
 * APE PRISMA v1.1 — Bootstrap (auto_prepend_file)
 *
 * This file is loaded before EVERY PHP request via .user.ini.
 * It MUST be ultra-lean on the hot path when PRISMA is disabled.
 *
 * Hot path (PRISMA off): < 50 µs overhead
 *   Guard 1: script is not resolve.php → return
 *   Guard 2: state file missing or master disabled → return
 *   Guard 3: no active lanes → return
 *
 * Ring 1: Global try/catch ensures resolve.php NEVER breaks.
 */

try {
    // ── Guard 1: Only intercept resolve.php ──────────────────────────
    $script = basename($_SERVER['SCRIPT_FILENAME'] ?? '');
    if ($script !== 'resolve.php') {
        return;
    }

    // ── Guard 2: Quick master check (raw JSON, no class load) ────────
    $stateFile = '/dev/shm/prisma_state.json';
    if (!is_file($stateFile)) {
        return;
    }
    $raw = @file_get_contents($stateFile);
    if ($raw === false) {
        return;
    }
    $stateArr = json_decode($raw, true);
    if (!is_array($stateArr) || empty($stateArr['master_enabled'])) {
        return;
    }

    // ── Guard 3: Denormalized flag — any lane active? ────────────────
    if (empty($stateArr['lanes_any_active'])) {
        return;
    }

    // ── All guards passed: load processor and install ob_start ───────
    $processorFile = __DIR__ . '/prisma_processor.php';
    if (!is_file($processorFile)) {
        return;
    }
    require_once __DIR__ . '/prisma_state.php';
    PrismaState::primeFromArray($stateArr); // Prime cache to avoid re-reading

    require_once $processorFile;
    ob_start([PrismaProcessor::class, 'process']);

} catch (\Throwable $e) {
    // Ring 1: NEVER break resolve.php. Log and move on.
    @error_log('[PRISMA bootstrap] FATAL: ' . $e->getMessage());
}
