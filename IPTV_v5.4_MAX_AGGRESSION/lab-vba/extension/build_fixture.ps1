# Builds a small synthetic LAB_SNAPSHOT for smoke tests.
# 2 channels, 6 perfiles, fields per JSON section.
# P2 has deliberate null values to test outlier protection.
$ErrorActionPreference = 'Stop'
$f = [ordered]@{
  lab_bridge_version = '1.1'
  exported_at = '2026-04-26T00:00:00Z'
  source = 'fixture'
  servers = @(@{ id='srv_T'; name='TEST'; base_url='http://t.test'; base_url_raw='http://t.test/p.php'; url=$null; username='u'; password='p'; channel_count=2 })
  servers_summary = @{ total=1; by_id=@{ srv_T=2 } }
  filters_applied = @{ search=''; tier='ALL'; codec='ALL'; language='ALL'; group=$null }
  active_profile_id = 'P3'
  profiles_hash = "sha256:fixture_$(Get-Date -Format yyyyMMddHHmmss)"
  profiles_snapshot = [ordered]@{}
  channels = @(
    @{ stream_id=1; name='C1'; group='G'; country='ES'; language='es'; tvg_id='c1'; logo=''; resolution=''; codec=''; bitrate=$null; width=$null; height=$null; fps=$null; quality_tier=''; quality_tags=@(); quality_score=$null; is_uhd=$false; is_hd=$true; is_sd=$false; is_sports=$false; is_movie=$false; is_series=$false; server_id='srv_T'; url='http://t.test/live/u/p/1.ts' }
    @{ stream_id=2; name='C2'; group='G'; country='ES'; language='es'; tvg_id='c2'; logo=''; resolution=''; codec=''; bitrate=$null; width=$null; height=$null; fps=$null; quality_tier=''; quality_tags=@(); quality_score=$null; is_uhd=$false; is_hd=$true; is_sd=$false; is_sports=$false; is_movie=$false; is_series=$false; server_id='srv_T'; url='http://t.test/live/u/p/2.ts' }
  )
  channel_count = 2
}
foreach ($prf in 'P0','P1','P2','P3','P4','P5') {
  $f.profiles_snapshot[$prf] = [ordered]@{
    id=$prf; name=$prf; level=0; quality='Q'; description=''; color='#000'
    settings = [ordered]@{
      resolution="RES_$prf"; fps=24; bufferSeconds=10; bitrate=100; codec="C_$prf"
      networkCachingMs=5000; bufferTargetSec=15; maxBitrateKbps=150000
      maxResolution="MAXRES_$prf"; targetFps=60
    }
    vlcopt = [ordered]@{
      'network-caching'="VAL_$prf"
      'live-caching'="LIVE_$prf"
      'video-fps'='30,30,30,30'
    }
    kodiprop = [ordered]@{
      'inputstream.adaptive.manifest_type'='hls'
    }
    headerOverrides = [ordered]@{
      'X-Buffer-Target'="HDR_$prf"
      'X-Comma-Test'='a,b,c,d'
    }
    headers = [ordered]@{
      'User-Agent'="UA_$prf"
    }
    hlsjs = [ordered]@{
      maxBufferLength=30
      backBufferLength=20
    }
    prefetch_config = [ordered]@{
      parallel_downloads=2
    }
    quality_levels = [ordered]@{
      ladder_count=8
    }
  }
  if ($prf -eq 'P2') {
    # P2 outlier: deliberadamente null/empty para validar proteccion
    $f.profiles_snapshot[$prf].vlcopt['network-caching'] = $null
    $f.profiles_snapshot[$prf].headerOverrides['X-Buffer-Target'] = ''
  }
}
$f | ConvertTo-Json -Depth 10 | Set-Content -Path 'C:/tmp/lab_ext/fixture_mini.json' -Encoding UTF8
Write-Host "Fixture written: C:/tmp/lab_ext/fixture_mini.json ($((Get-Item 'C:/tmp/lab_ext/fixture_mini.json').Length) bytes)"
