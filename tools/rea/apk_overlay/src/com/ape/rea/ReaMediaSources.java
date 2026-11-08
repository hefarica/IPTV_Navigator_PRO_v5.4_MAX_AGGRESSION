package com.ape.rea;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import androidx.media3.common.MediaItem;
import androidx.media3.datasource.DataSource;
import androidx.media3.exoplayer.dash.DashMediaSource;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.source.MediaSource;
import java.util.Locale;

/** Exact Media3 1.3.1 source adapter: HLS caching is applied only to HLS media chunks. */
public final class ReaMediaSources {
    private ReaMediaSources() {}

    public static MediaSource create(Context context, DataSource.Factory upstream, MediaItem item) {
        String uri = item.localConfiguration.uri.toString();
        String mime = item.localConfiguration.mimeType;
        boolean external = false;
        if (context instanceof Activity) {
            Intent intent = ((Activity) context).getIntent();
            if (intent != null) {
                external = intent.getBooleanExtra("rea_external", false);
                String declared = intent.getStringExtra("rea_mime_type");
                if (declared != null && declared.length() < 128) mime = declared;
            }
        }
        ReaExternalRequest.rejectUnsupported(uri, mime);
        mime = resolveMimeType(item.localConfiguration.uri.getPath(), mime, external);
        if (mime != null) item = item.buildUpon().setMimeType(mime).build();
        if ("application/dash+xml".equals(mime)) {
            // One upstream retains the supplied UA/auth for both MPD refreshes and chunks.
            // No license configuration is added by this external-player integration.
            return new DashMediaSource.Factory(upstream).createMediaSource(item);
        }
        if ("application/x-mpegURL".equals(mime)) {
            try {
                Object factory = Class.forName("com.ape.fluid.FluidBridge")
                        .getMethod("hlsFactory", Context.class, Object.class).invoke(null, context, upstream);
                return ((HlsMediaSource.Factory) factory).createMediaSource(item);
            } catch (Exception unavailableCache) {
                // Upstream retains all original authentication headers; caching is optional.
                return new HlsMediaSource.Factory(upstream).createMediaSource(item);
            }
        }
        return new DefaultMediaSourceFactory(upstream).createMediaSource(item);
    }

    /** Selects a container without changing the URI, bitrate, codec, or source range. */
    public static String resolveMimeType(String uriPath, String declaredMime, boolean external) {
        String path = uriPath == null ? "" : uriPath.toLowerCase(Locale.US);
        String type = declaredMime == null ? "" : declaredMime.toLowerCase(Locale.US).trim();
        int parameters = type.indexOf(';');
        if (parameters >= 0) type = type.substring(0, parameters).trim();
        // DASH must precede the host's extensionless/internal implicit-HLS default.
        if (path.endsWith(".mpd") || "application/dash+xml".equals(type)) return "application/dash+xml";
        if (path.endsWith(".m3u8") || type.contains("mpegurl")) return "application/x-mpegURL";
        boolean knownProgressive = path.matches(".*\\.(mp4|m4v|mkv|webm|ts|m2ts|mov|mp3|aac|ogg|flac|wav)$");
        if (!external && !knownProgressive && type.length() == 0) return "application/x-mpegURL";
        return type.length() == 0 || type.contains("*") || "application/octet-stream".equals(type) ? null : type;
    }
}
