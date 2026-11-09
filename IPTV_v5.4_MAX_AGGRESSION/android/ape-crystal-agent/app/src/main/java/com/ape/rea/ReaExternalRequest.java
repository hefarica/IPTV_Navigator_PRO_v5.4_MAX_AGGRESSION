package com.ape.rea;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Pure request normalization. Never decodes/re-encodes a signed media URI. */
public final class ReaExternalRequest {
    // The generator caps EXTHTTP at 200 pairs / 8192 JSON bytes. Allow headroom for
    // player-added fields, while bounding the decoded headers that reach HTTP.
    public static final int MAX_HEADER_COUNT = 256;
    public static final int MAX_HEADER_VALUE_UTF8_BYTES = 8192;
    public static final int MAX_HEADERS_UTF8_BYTES = 16384;
    public final String uri;
    public final LinkedHashMap<String, String> headers;
    public final String userAgent;

    private ReaExternalRequest(String uri, LinkedHashMap<String, String> headers, String userAgent) {
        this.uri = uri;
        this.headers = headers;
        this.userAgent = userAgent;
    }

    public static ReaExternalRequest parse(String value, Map<String, String> supplied, String ua) {
        if (value == null || value.length() == 0 || value.length() > 65536) {
            throw new IllegalArgumentException("Falta una dirección HTTP(S) válida.");
        }
        LinkedHashMap<String, String> headers = new LinkedHashMap<String, String>();
        int pipe = value.indexOf('|');
        String uri = pipe < 0 ? value : value.substring(0, pipe);
        if (pipe >= 0) {
            String suffix = value.substring(pipe + 1);
            if (suffix.length() == 0) throw new IllegalArgumentException("Cabeceras de reproducción vacías.");
            for (String pair : suffix.split("&", -1)) {
                int equals = pair.indexOf('=');
                if (equals <= 0) throw new IllegalArgumentException("Formato de cabeceras no válido.");
                putHeader(headers, percentDecode(pair.substring(0, equals)), percentDecode(pair.substring(equals + 1)));
            }
        }
        validateUri(uri);
        if (supplied != null) {
            for (Map.Entry<String, String> entry : supplied.entrySet()) {
                putHeader(headers, entry.getKey(), entry.getValue());
            }
        }
        if (ua != null && ua.length() > 0) validateHeaderValue(ua);
        String headerUa = getHeader(headers, "User-Agent");
        if (headerUa != null) ua = headerUa;
        if (ua == null || ua.length() == 0) ua = "REA/1.0 Android";
        validateTotalBytes(headers, "User-Agent", "User-Agent", ua);
        rejectUnsupported(uri, null);
        return new ReaExternalRequest(uri, headers, ua);
    }

    public static void validateUri(String value) {
        if (value == null || value.length() > 65536) throw new IllegalArgumentException("Dirección no válida.");
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (!("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))
                    || uri.getRawAuthority() == null || uri.getRawAuthority().length() == 0
                    || uri.getHost() == null) {
                throw new IllegalArgumentException("Esta versión recibe fuentes HTTP o HTTPS.");
            }
        } catch (java.net.URISyntaxException failure) {
            throw new IllegalArgumentException("La dirección de reproducción no es válida.");
        }
    }

    public static void rejectUnsupported(String uri, String mime) {
        String type = mime == null ? "" : mime.toLowerCase(Locale.US);
        String path;
        try { path = new URI(uri).getPath().toLowerCase(Locale.US); }
        catch (Exception failure) { path = ""; }
        if (type.contains("ms-sstr") || path.matches(".*\\.ism[l]?(/manifest.*)?$")) {
            throw new IllegalArgumentException("SmoothStreaming no está incluido en esta compilación.");
        }
    }

    public static void putHeader(Map<String, String> headers, String key, String value) {
        if (key == null || !key.matches("[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}")) {
            throw new IllegalArgumentException("Nombre de cabecera HTTP no válido.");
        }
        validateHeaderValue(value);
        String previous = null;
        for (String candidate : headers.keySet()) {
            if (candidate.equalsIgnoreCase(key)) { previous = candidate; break; }
        }
        if (headers.size() + (previous == null ? 1 : 0) > MAX_HEADER_COUNT) {
            throw new IllegalArgumentException("Demasiadas cabeceras HTTP.");
        }
        // Validate before mutation so a rejected replacement keeps the last valid value.
        validateTotalBytes(headers, previous, key, value);
        if (previous != null) headers.remove(previous);
        headers.put(key, value);
    }

    public static String getHeader(Map<String, String> headers, String name) {
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(name)) return entry.getValue();
        }
        return null;
    }

    private static void validateHeaderValue(String value) {
        if (value == null || value.length() > MAX_HEADER_VALUE_UTF8_BYTES
                || utf8Bytes(value) > MAX_HEADER_VALUE_UTF8_BYTES) {
            throw new IllegalArgumentException("Valor de cabecera HTTP no válido.");
        }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 32 || c == 127) throw new IllegalArgumentException("La cabecera HTTP contiene caracteres no válidos.");
        }
    }

    private static int utf8Bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static void validateTotalBytes(Map<String, String> headers, String replaced,
            String key, String value) {
        // Aggregate means UTF-8 name + value bytes after decoding, not JSON syntax.
        // The effective User-Agent is included by parse even when sent separately.
        long total = utf8Bytes(key) + utf8Bytes(value);
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            if (replaced == null || !entry.getKey().equalsIgnoreCase(replaced)) {
                total += utf8Bytes(entry.getKey()) + utf8Bytes(entry.getValue());
            }
        }
        if (total > MAX_HEADERS_UTF8_BYTES) {
            throw new IllegalArgumentException("Las cabeceras HTTP superan el tamaño permitido.");
        }
    }

    private static String percentDecode(String value) {
        // Header suffix is percent encoded; literal '+' is a literal plus, not a form space.
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length();) {
            if (value.charAt(i) != '%') { out.append(value.charAt(i++)); continue; }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            while (i < value.length() && value.charAt(i) == '%') {
                if (i + 2 >= value.length()) throw new IllegalArgumentException("Codificación de cabecera no válida.");
                int hi = Character.digit(value.charAt(i + 1), 16);
                int lo = Character.digit(value.charAt(i + 2), 16);
                if (hi < 0 || lo < 0) throw new IllegalArgumentException("Codificación de cabecera no válida.");
                bytes.write(hi * 16 + lo);
                i += 3;
            }
            out.append(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        }
        return out.toString();
    }
}
