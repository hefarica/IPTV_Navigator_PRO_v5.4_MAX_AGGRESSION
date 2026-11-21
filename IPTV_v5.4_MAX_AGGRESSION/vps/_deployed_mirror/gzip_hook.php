
    // AUTO-GZIP: Compress .m3u8 and replace original with placeholder
    if (preg_match('/\.m3u8$/i', $finalFilename)) {
        $fullPath = $TARGET_DIR . $finalFilename;
        $gzPath = $fullPath . '.gz';
        exec('gzip -9 -f -k ' . escapeshellarg($fullPath) . ' 2>&1', $gzOut, $gzCode);
        if ($gzCode === 0 && file_exists($gzPath)) {
            file_put_contents($fullPath, "#EXTM3U\n");
            $response['gzip'] = true;
            $response['gz_size'] = filesize($gzPath);
            $response['gz_savings'] = round((1 - filesize($gzPath) / max($response['size'] ?? 1, 1)) * 100) . '%';
        }
    }
