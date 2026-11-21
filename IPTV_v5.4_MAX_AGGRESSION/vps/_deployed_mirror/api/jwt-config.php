<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');
if (['REQUEST_METHOD']==='OPTIONS'){http_response_code(204);exit;}
echo json_encode(['status'=>'ok','jwt_accepted'=>true,'ts'=>date('c')]);
