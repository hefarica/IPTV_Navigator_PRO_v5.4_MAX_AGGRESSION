package com.ape.rea;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;
import org.json.JSONObject;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Receives a source explicitly delegated by OTT's external-player integration. */
public final class ReaExternalPlayerActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        forward(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        forward(intent);
    }

    private void forward(Intent source) {
        try {
            if (source == null || !Intent.ACTION_VIEW.equals(source.getAction())) {
                throw new IllegalArgumentException("Selecciona REA como reproductor externo en OTT Navigator.");
            }
            Bundle extras = source.getExtras();
            if (extras != null) {
                for (String name : extras.keySet()) {
                    String lower = name.toLowerCase(java.util.Locale.US);
                    if (lower.contains("drm") || lower.contains("license_uri") || lower.contains("license_url")) {
                        throw new IllegalArgumentException("Esta entrada externa no negocia licencias DRM; conserva el reproductor autorizado de la fuente.");
                    }
                }
            }
            LinkedHashMap<String, String> headers = new LinkedHashMap<String, String>();
            addHeaders(headers, extra(extras, "http_headers"));
            addHeaders(headers, extra(extras, "headers"));
            addHeaders(headers, extra(extras, "android.media.intent.extra.HTTP_HEADERS"));
            String ua = text(extra(extras, "user_agent"));
            if (ua == null) ua = text(extra(extras, "ua"));
            if (ua == null) ua = text(extra(extras, "User-Agent"));
            String raw = source.getDataString();
            if (raw == null) raw = text(extra(extras, "url"));
            ReaExternalRequest request = ReaExternalRequest.parse(raw, headers, ua);
            ReaExternalRequest.rejectUnsupported(request.uri, source.getType());
            String title = text(extra(extras, "title"));
            if (title == null) title = text(extra(extras, Intent.EXTRA_TITLE));
            if (title == null || title.length() == 0) title = "OTT Navigator · REA";
            if (title.length() > 256) title = title.substring(0, 256);
            long position = position(extra(extras, "android.media.intent.extra.ITEM_POSITION"));
            if (position < 0) position = position(extra(extras, "position"));
            if (position < 0) position = position(extra(extras, "rea_resume_ms"));
            Intent player = new Intent();
            player.setClassName(getPackageName(), "com.ape.crystalagent.PlayerActivity");
            player.putExtra("url", request.uri);
            player.putExtra("ua", request.userAgent);
            player.putExtra("headers", new JSONObject(request.headers).toString());
            player.putExtra("title", title);
            player.putExtra("rea_external", true);
            if (source.getType() != null) player.putExtra("rea_mime_type", source.getType());
            if (position >= 0) player.putExtra("rea_resume_ms", position);
            startActivity(player);
        } catch (IllegalArgumentException failure) {
            Toast.makeText(this, failure.getMessage(), Toast.LENGTH_LONG).show();
        } catch (Exception failure) {
            // Do not include the exception message: parsers may embed signed URLs or secrets.
            Toast.makeText(this, "No se pudo abrir la fuente externa. Revisa el formato y las cabeceras de OTT.", Toast.LENGTH_LONG).show();
        } finally {
            finish();
        }
    }

    private static Object extra(Bundle bundle, String name) { return bundle == null ? null : bundle.get(name); }
    private static String text(Object value) { return value instanceof CharSequence ? value.toString() : null; }
    private static long position(Object value) {
        if (!(value instanceof Number)) return -1;
        long result = ((Number) value).longValue();
        return result >= 0 ? result : -1;
    }

    private static void addHeaders(Map<String, String> target, Object value) throws Exception {
        if (value == null) return;
        if (value instanceof Bundle) {
            Bundle bundle = (Bundle) value;
            for (String key : bundle.keySet()) addPair(target, key, bundle.get(key));
        } else if (value instanceof Map) {
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (!(entry.getKey() instanceof String)) throw new IllegalArgumentException("Formato de cabeceras HTTP no válido.");
                addPair(target, (String) entry.getKey(), entry.getValue());
            }
        } else if (value instanceof String) {
            JSONObject object = new JSONObject((String) value);
            for (Iterator<String> keys = object.keys(); keys.hasNext();) {
                String key = keys.next();
                addPair(target, key, object.get(key));
            }
        } else if (value instanceof String[]) {
            String[] pairs = (String[]) value;
            if ((pairs.length & 1) != 0 || pairs.length > ReaExternalRequest.MAX_HEADER_COUNT * 2) throw new IllegalArgumentException("Pares de cabeceras HTTP no válidos.");
            for (int i = 0; i < pairs.length; i += 2) addPair(target, pairs[i], pairs[i + 1]);
        } else if (value instanceof List) {
            List<?> pairs = (List<?>) value;
            if ((pairs.size() & 1) != 0 || pairs.size() > ReaExternalRequest.MAX_HEADER_COUNT * 2) throw new IllegalArgumentException("Pares de cabeceras HTTP no válidos.");
            for (int i = 0; i < pairs.size(); i += 2) {
                if (!(pairs.get(i) instanceof String)) throw new IllegalArgumentException("Nombre de cabecera HTTP no válido.");
                addPair(target, (String) pairs.get(i), pairs.get(i + 1));
            }
        } else {
            throw new IllegalArgumentException("OTT envió un formato de cabeceras no compatible.");
        }
    }

    private static void addPair(Map<String, String> target, String key, Object value) {
        if (!(value instanceof CharSequence)) throw new IllegalArgumentException("Valor de cabecera HTTP no válido.");
        ReaExternalRequest.putHeader(target, key, value.toString());
    }
}
