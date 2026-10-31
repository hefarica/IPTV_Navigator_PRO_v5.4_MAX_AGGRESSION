package com.ape.fluid;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Optional HTTPS control. Network failures never block the player thread. */
public final class FluidControlClient {
    public interface Callback { void onDirective(JSONObject directive); }
    private final Context context;
    private final String base, token, deviceId;
    private final Callback callback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean closed;
    private volatile HttpURLConnection currentConnection;

    public FluidControlClient(Context context, Callback callback) {
        this.context = context.getApplicationContext(); this.callback = callback;
        SharedPreferences prefs = FluidStore.prefs(context);
        this.base = FluidStore.validateControlUrl(prefs.getString("vps_base_url", ""));
        this.token = prefs.getString("vps_token", "");
        if (token.length() < 16 || token.length() > 4096 || token.indexOf('\r') >= 0 || token.indexOf('\n') >= 0)
            throw new IllegalArgumentException("El token de control debe tener entre 16 y 4096 caracteres, sin saltos de línea.");
        this.deviceId = FluidStore.deviceId(context);
    }

    public void exchange(final JSONObject metrics) {
        if (closed || !busy.compareAndSet(false, true)) return;
        try {
            executor.execute(new Runnable() { public void run() {
                try {
                    if (closed) return;
                    metrics.put("device_id", deviceId);
                    request("POST", "/api/v1/telemetry", metrics.toString());
                    if (closed) return;
                    String query = "?device_id=" + URLEncoder.encode(deviceId, "UTF-8")
                            + "&channel_id=" + URLEncoder.encode(metrics.optString("channel_id", ""), "UTF-8");
                    String response = request("GET", "/api/v1/directive" + query, null);
                    if (!closed && response != null && !response.isEmpty()) callback.onDirective(new JSONObject(response));
                } catch (Exception ex) {
                    if (!closed) FluidStore.event(context, "CONTROL_UNAVAILABLE", ex.getClass().getSimpleName());
                } finally { busy.set(false); }
            }});
        } catch (RuntimeException ex) { busy.set(false); }
    }

    private String request(String method, String path, String body) throws Exception {
        if (closed) throw new java.io.InterruptedIOException("Control closed");
        HttpURLConnection connection = (HttpURLConnection) new URL(base + path).openConnection();
        currentConnection = connection;
        try {
            if (closed) throw new java.io.InterruptedIOException("Control closed");
            connection.setConnectTimeout(3500); connection.setReadTimeout(3500);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Accept", "application/json");
            if (body != null) {
                byte[] bytes = body.getBytes("UTF-8");
                if (bytes.length > 65536) throw new IllegalArgumentException("Telemetry too large");
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                OutputStream out = connection.getOutputStream(); try { out.write(bytes); } finally { out.close(); }
            }
            int status = connection.getResponseCode();
            if (status == 204) return null;
            if (status < 200 || status >= 300) throw new java.io.IOException("Control HTTP status " + status);
            InputStream in = connection.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try {
                byte[] buffer = new byte[2048]; int count;
                while ((count = in.read(buffer)) != -1) {
                    if (closed) throw new java.io.InterruptedIOException("Control closed");
                    if (out.size() + count > 65536) throw new java.io.IOException("Control response too large");
                    out.write(buffer, 0, count);
                }
            } finally { in.close(); }
            return out.toString("UTF-8");
        } finally { connection.disconnect(); currentConnection = null; }
    }

    public void close() {
        closed = true;
        HttpURLConnection connection = currentConnection;
        if (connection != null) connection.disconnect();
        executor.shutdownNow();
    }
}
