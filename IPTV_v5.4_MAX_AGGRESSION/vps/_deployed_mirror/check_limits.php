<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
echo json_encode([
    'post_max_size' => ini_get('post_max_size'),
    'upload_max_filesize' => ini_get('upload_max_filesize'),
    'memory_limit' => ini_get('memory_limit'),
    'max_input_time' => ini_get('max_input_time'),
    'max_execution_time' => ini_get('max_execution_time')
]);
