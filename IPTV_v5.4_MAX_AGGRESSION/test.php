<?php
require "backend/resolve_quality_unified.php";
$str = "#EXTVLCOPT:video-filter=test\n#EXTINF:-1 blabla\n";
echo "Before:\n" . $str;
$str = preg_replace("/#EXTVLCOPT:video-filter=[^\n]*\n?/im", "", $str);
$poly = ape_polymorphic_video_filter();
$str = preg_replace("/(#EXTINF:[^\n]+\n)/im", "$1#EXTVLCOPT:" . $poly . "\n", $str);
echo "\nAfter:\n" . $str;
?>
