package com.ape.rea;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.widget.Toast;
import java.lang.ref.WeakReference;

/** MediaSession observes metadata/control only. It never receives another app's video frames. */
public final class ReaOttBridge {
    private static final String TARGET = "studio.scillarium.ottnavigator";
    private static WeakReference<MediaController> observed = new WeakReference<MediaController>(null);
    private static long seenAt;
    private static long position = -1;
    private static long buffered = -1;
    private static int state = -1;
    private static boolean hasUri;

    private ReaOttBridge() {}

    public static synchronized void observe(Context context, MediaController controller) {
        try {
            if (controller == null || !TARGET.equals(controller.getPackageName())) { clear(context); return; }
            PlaybackState playback = controller.getPlaybackState();
            if (playback == null) { clear(context); return; }
            observed = new WeakReference<MediaController>(controller);
            seenAt = SystemClock.elapsedRealtime();
            state = playback.getState();
            position = playback.getPosition();
            buffered = playback.getBufferedPosition();
            hasUri = publishedUri(controller.getMetadata()) != null;
        } catch (Exception unavailable) { clear(context); }
    }

    public static synchronized void clear(Context context) {
        observed.clear();
        seenAt = 0;
        position = -1;
        buffered = -1;
        state = -1;
        hasUri = false;
    }

    public static synchronized String diagnostics(Context context) {
        boolean live = seenAt > 0 && SystemClock.elapsedRealtime() - seenAt < 5000 && observed.get() != null;
        if (!live) return "OTT: sin sesión observada. Activa el acceso a notificaciones y reproduce un canal en OTT Navigator.";
        return "OTT: sesión observada · estado " + stateName(state)
                + "\nPosición publicada: " + position + " ms · búfer publicado: " + buffered + " ms"
                + "\nURI multimedia publicada: " + (hasUri ? "sí" : "no")
                + "\nMediaSession comunica estado; el procesamiento de vídeo ocurre al abrir la fuente en REA.";
    }

    public static void openObserved(Activity activity) {
        try {
            MediaController controller;
            synchronized (ReaOttBridge.class) {
                controller = observed.get();
                if (seenAt == 0 || SystemClock.elapsedRealtime() - seenAt >= 5000) controller = null;
            }
            String uri = controller == null ? null : publishedUri(controller.getMetadata());
            if (uri == null) {
                Toast.makeText(activity, "OTT no publica una URI multimedia HTTP(S). Selecciona REA como reproductor externo en OTT Navigator.", Toast.LENGTH_LONG).show();
                return;
            }
            Intent intent = new Intent(activity, ReaExternalPlayerActivity.class);
            intent.setAction(Intent.ACTION_VIEW);
            intent.setData(Uri.parse(uri));
            intent.putExtra("title", "OTT Navigator · REA");
            // No speculative URI from mediaId/artwork, no token persistence, no background launch.
            activity.startActivity(intent);
        } catch (Exception failure) {
            Toast.makeText(activity, "No se pudo abrir la URI publicada. Usa la opción de reproductor externo de OTT.", Toast.LENGTH_LONG).show();
        }
    }

    public static void openNotificationSettings(Activity activity) {
        try { activity.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); }
        catch (Exception unavailable) {
            Toast.makeText(activity, "Abre Ajustes > Acceso a notificaciones y activa REA.", Toast.LENGTH_LONG).show();
        }
    }

    private static String publishedUri(MediaMetadata metadata) {
        if (metadata == null) return null;
        String value = metadata.getString(MediaMetadata.METADATA_KEY_MEDIA_URI);
        if (value == null && Build.VERSION.SDK_INT >= 23) {
            MediaDescription description = metadata.getDescription();
            if (description != null && description.getMediaUri() != null) value = description.getMediaUri().toString();
        }
        if (value == null) return null;
        try {
            ReaExternalRequest.validateUri(value);
            ReaExternalRequest.rejectUnsupported(value, null);
            return value;
        } catch (IllegalArgumentException invalid) { return null; }
    }

    private static String stateName(int value) {
        switch (value) {
            case PlaybackState.STATE_PLAYING: return "reproduciendo";
            case PlaybackState.STATE_PAUSED: return "pausado";
            case PlaybackState.STATE_BUFFERING: return "cargando";
            case PlaybackState.STATE_STOPPED: return "detenido";
            case PlaybackState.STATE_ERROR: return "error";
            default: return Integer.toString(value);
        }
    }
}
