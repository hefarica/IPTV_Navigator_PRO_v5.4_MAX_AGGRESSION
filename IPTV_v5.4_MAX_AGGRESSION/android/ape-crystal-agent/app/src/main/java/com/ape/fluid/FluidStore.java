package com.ape.fluid;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Private settings and channel-scoped source registry. No source URLs enter telemetry. */
public final class FluidStore {
    private FluidStore() { }
    public static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences("ape_fluid", Context.MODE_PRIVATE);
    }

    public static final class Variant {
        public String id, channelId, url, ua, codec = "";
        public int width, height;
        public long bitrateBps;
        public boolean hdr;
        public Variant(String channelId, String id, String url, String ua) {
            this.channelId = channelId; this.id = id; this.url = url; this.ua = ua;
        }
    }

    public static synchronized void saveChannel(Context context, String channelId, String url,
                                                 String backup, String ua) {
        channelId = channelId == null ? "" : channelId.trim();
        if (!channelId.matches("[A-Za-z0-9._-]{1,80}"))
            throw new IllegalArgumentException("El canal debe tener entre 1 y 80 letras, números, puntos, guiones o guiones bajos.");
        url = validateMediaUrl(url);
        backup = backup == null ? "" : backup.trim();
        if (!backup.isEmpty()) backup = validateMediaUrl(backup);
        if (url.equals(backup)) throw new IllegalArgumentException("El respaldo debe ser una URL diferente del mismo canal.");
        ua = ua == null ? "" : ua.trim();
        if (ua.length() > 512 || ua.indexOf('\r') >= 0 || ua.indexOf('\n') >= 0)
            throw new IllegalArgumentException("Agente de usuario inválido.");
        SharedPreferences settings = prefs(context);
        try {
            JSONObject channels = new JSONObject(settings.getString("channels_json", "{}"));
            if (!channels.has(channelId) && channels.length() >= 100)
                throw new IllegalArgumentException("Se alcanzó el límite de 100 perfiles locales.");
            JSONObject channel = new JSONObject();
            channel.put("channel_id", channelId); channel.put("ua", ua);
            JSONArray variants = new JSONArray();
            variants.put(new JSONObject().put("id", "principal").put("url", url));
            if (!backup.isEmpty()) variants.put(new JSONObject().put("id", "respaldo").put("url", backup));
            channel.put("variants", variants);
            channels.put(channelId, channel);
            settings.edit().putString("channels_json", channels.toString())
                    .putString("channel_id", channelId).putString("primary_url", url)
                    .putString("backup_url", backup).putString("ua", ua).apply();
        } catch (IllegalArgumentException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalArgumentException("No se pudo guardar el perfil."); }
    }

    public static String validateMediaUrl(String input) {
        String value = input == null ? "" : input.trim();
        if (value.length() > 8192 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0)
            throw new IllegalArgumentException("La URL no es válida.");
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    || uri.getHost() == null || uri.getHost().isEmpty())
                throw new IllegalArgumentException("Usa una URL HTTP o HTTPS de video.");
        } catch (IllegalArgumentException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalArgumentException("La URL no es válida."); }
        return value;
    }

    public static String validateControlUrl(String input) {
        String value = validateMediaUrl(input);
        try {
            URI uri = new URI(value);
            if (uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
                throw new IllegalArgumentException("El servidor debe ser una URL base sin credenciales ni parámetros.");
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            if (!"https".equalsIgnoreCase(uri.getScheme()) && !(host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]") || host.equals("::1")))
                throw new IllegalArgumentException("El control remoto requiere HTTPS; HTTP se admite solo en localhost.");
            while (value.endsWith("/")) value = value.substring(0, value.length() - 1);
            return value;
        } catch (IllegalArgumentException ex) { throw ex; }
        catch (Exception ex) { throw new IllegalArgumentException("URL de servidor inválida."); }
    }

    public static synchronized String deviceId(Context context) {
        SharedPreferences settings = prefs(context);
        String id = settings.getString("device_id", "");
        if (!id.matches("[A-Za-z0-9._-]{1,80}")) {
            id = "ape-" + UUID.randomUUID().toString().substring(0, 12);
            settings.edit().putString("device_id", id).apply();
        }
        return id;
    }

    /** Ambiguous or external URLs get their own isolated channel and no inherited backup. */
    public static List<Variant> variantsFor(Context context, String url, String ua) {
        List<Variant> found = null;
        try {
            JSONObject channels = new JSONObject(prefs(context).getString("channels_json", "{}"));
            java.util.Iterator<String> keys = channels.keys();
            while (keys.hasNext()) {
                String key = keys.next(); JSONObject channel = channels.optJSONObject(key);
                if (channel == null) continue;
                JSONArray entries = channel.optJSONArray("variants");
                if (entries == null) continue;
                boolean matches = false;
                List<Variant> candidates = new ArrayList<Variant>();
                for (int i = 0; i < entries.length(); i++) {
                    JSONObject entry = entries.optJSONObject(i); if (entry == null) continue;
                    String source = validateMediaUrl(entry.optString("url", ""));
                    String id = entry.optString("id", "");
                    if (!id.matches("[A-Za-z0-9._-]{1,80}")) continue;
                    if (source.equals(url)) matches = true;
                    candidates.add(new Variant(key, id, source, channel.optString("ua", ua)));
                }
                if (matches) {
                    if (found != null) return single(url, ua);
                    found = candidates;
                }
            }
        } catch (Exception ignored) { return single(url, ua); }
        return found == null || found.isEmpty() ? single(url, ua) : found;
    }

    private static List<Variant> single(String url, String ua) {
        List<Variant> result = new ArrayList<Variant>();
        result.add(new Variant("externo_" + digest(url), "principal", url, ua));
        return result;
    }

    private static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes("UTF-8"));
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < 6; i++) out.append(String.format(Locale.ROOT, "%02x", bytes[i] & 255));
            return out.toString();
        } catch (Exception ignored) { return Integer.toHexString(value.hashCode()); }
    }

    public static synchronized void event(Context context, String kind, String detail) {
        // Callers pass categorical information only: never URLs, authorization or exception messages.
        try {
            JSONObject row = new JSONObject().put("time_ms", System.currentTimeMillis())
                    .put("event", kind).put("detail", detail);
            File file = new File(context.getFilesDir(), "fluid_events.jsonl");
            if (file.length() > 512 * 1024) {
                File previous = new File(context.getFilesDir(), "fluid_events.previous.jsonl");
                if (previous.exists()) previous.delete();
                file.renameTo(previous);
            }
            FileOutputStream out = new FileOutputStream(file, true);
            try { out.write((row.toString() + "\n").getBytes("UTF-8")); }
            finally { out.close(); }
        } catch (Exception ignored) { }
    }
}
