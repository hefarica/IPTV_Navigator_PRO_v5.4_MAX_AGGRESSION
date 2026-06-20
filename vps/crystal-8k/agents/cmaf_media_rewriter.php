<?php
// cmaf_media_rewriter.php — Agente 4 component.
// Rewrites CMAF media playlists: absolutize #EXT-X-MAP init + segment URLs, mark LCEVC.
// Extends the existing cmaf_proxy.php. Deploy: /var/www/html/  (php -l on the VPS).
//
// Truth-guard: the base URL is the VERBATIM provider/CDN base (SHIELDED) — URLs are made
// absolute against it, never wrapped in /shield/ or rewritten to a different host.
// COUNCIL FIX: the PDF's broken regex '(URI=")([^"]+)("/)' -> corrected to '(")'.

class CMAFMediaRewriter
{
    private string $baseUrl;
    private bool $lcevcActive;

    public function __construct(string $baseUrl, bool $lcevc = true)
    {
        $this->baseUrl = rtrim($baseUrl, '/') . '/';
        $this->lcevcActive = $lcevc;
    }

    public function rewriteMediaPlaylist(string $content): string
    {
        $out = [];
        $marked = false;

        foreach (explode("\n", $content) as $line) {
            if (strncmp($line, '#EXT-X-MAP:', 11) === 0) {
                $line = preg_replace(
                    '/(URI=")([^"]+)(")/',
                    '${1}' . $this->baseUrl . '${2}${3}',
                    $line
                );
                if (!$marked && $this->lcevcActive) {
                    $out[] = '#EXT-X-APE-LCEVC:ACTIVE';
                    $marked = true;
                }
            } elseif ($line !== '' && $line[0] !== '#'
                      && preg_match('/\.(m4s|mp4|ts)(\?|$)/', $line)) {
                if (!preg_match('#^https?://#', $line)) {
                    $line = $this->baseUrl . ltrim($line, '/');
                }
            }
            $out[] = $line;
        }

        return implode("\n", $out);
    }
}
