import com.ape.rea.ReaExternalRequest;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

public final class ReaExternalRequestTest {
    private static int assertions;
    interface Action { void run(); }
    private static void equal(Object actual, Object expected) {
        assertions++;
        if (actual == null ? expected != null : !actual.equals(expected)) {
            throw new AssertionError("Assertion " + assertions + " failed");
        }
    }
    private static void rejected(Action action) {
        assertions++;
        try { action.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected invalid request to be rejected (" + assertions + ")");
    }
    private static String repeat(String value, int count) {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < count; i++) text.append(value);
        return text.toString();
    }
    private static int headerBytes(Map<String, String> headers) {
        int total = 0;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            total += entry.getKey().getBytes(StandardCharsets.UTF_8).length;
            total += entry.getValue().getBytes(StandardCharsets.UTF_8).length;
        }
        return total;
    }
    public static void main(String[] args) {
        final String signed = "https://cdn.example/live/channel.m3u8?token=a%2Bb%2Fc%3D&x=1+2&x=3&sig=%25A0#unchanged";
        equal(ReaExternalRequest.parse(signed, null, null).uri, signed);
        equal(ReaExternalRequest.parse("http://[2001:db8::1]:8080/stream.ts", null, null).uri, "http://[2001:db8::1]:8080/stream.ts");
        LinkedHashMap<String, String> auth = new LinkedHashMap<String, String>();
        auth.put("Authorization", "Bearer Aa+/==");
        auth.put("Cookie", "session=A%2B; mode=2");
        auth.put("Referer", "https://portal.example/watch?a=1&b=2");
        auth.put("User-Agent", "Provider UA/2.0");
        ReaExternalRequest request = ReaExternalRequest.parse(signed, auth, "fallback");
        equal(request.uri, signed);
        equal(request.headers.get("Authorization"), auth.get("Authorization"));
        equal(request.headers.get("Cookie"), auth.get("Cookie"));
        equal(request.headers.get("Referer"), auth.get("Referer"));
        equal(request.userAgent, "Provider UA/2.0");
        request = ReaExternalRequest.parse(signed + "|User-Agent=Suffix%20UA&X-Sign=a+b%2Bc%252F", auth, "fallback");
        equal(request.uri, signed);
        equal(request.headers.get("X-Sign"), "a+b+c%2F");
        equal(request.userAgent, "Provider UA/2.0");
        LinkedHashMap<String, String> caseFolded = new LinkedHashMap<String, String>();
        ReaExternalRequest.putHeader(caseFolded, "USER-agent", "first");
        ReaExternalRequest.putHeader(caseFolded, "user-AGENT", "last");
        equal(caseFolded.size(), 1);
        equal(ReaExternalRequest.parse(signed, caseFolded, "ignored").userAgent, "last");
        equal(ReaExternalRequest.parse(signed, null, "Explicit UA").userAgent, "Explicit UA");
        rejected(new Action(){public void run(){ReaExternalRequest.parse("file:///private/a.mp4", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse("rtsp://example/stream", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse("https:///missing-host", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(" https://example/live.ts", null, null);}});
        equal(ReaExternalRequest.parse("https://example/a.mpd?token=1", null, null).uri, "https://example/a.mpd?token=1");
        ReaExternalRequest.rejectUnsupported(signed, "application/dash+xml");
        equal(ReaExternalRequest.parse("https://example/A.MPD?sig=a%2Bb", auth, null).headers, auth);
        rejected(new Action(){public void run(){ReaExternalRequest.parse("https://example/a.ism/Manifest", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed + "|X-Header=%0D%0AInjected%3Aevil", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed, null, "unsafe\nUA");}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed + "|X-A=%GG", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed + "|X-A=%2", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed + "|not-a-pair", null, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(new LinkedHashMap<String,String>(), "Invalid Header", "x");}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(new LinkedHashMap<String,String>(), "X-A", "x\u0000");}});
        final Map<String, String> bounded = new LinkedHashMap<String, String>();
        for (int i = 0; i < 256; i++) ReaExternalRequest.putHeader(bounded, "X-Test-" + i, "value");
        equal(bounded.size(), 256);
        ReaExternalRequest.putHeader(bounded, "x-test-0", "replacement");
        equal(bounded.size(), 256);
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(bounded, "X-Overflow", "value");}});
        equal(bounded.containsKey("X-Overflow"), false);
        equal(ReaExternalRequest.parse(signed, bounded, null).headers.size(), 256);
        equal(ReaExternalRequest.MAX_HEADER_COUNT, 256);
        equal(ReaExternalRequest.MAX_HEADER_VALUE_UTF8_BYTES, 8192);
        equal(ReaExternalRequest.MAX_HEADERS_UTF8_BYTES, 16384);

        // The generator's 200-field EXTHTTP size now fits, including auth and UA.
        final Map<String, String> generated = new LinkedHashMap<String, String>(auth);
        for (int i = generated.size(); i < 200; i++) generated.put("X-APE-Test-" + i, "1");
        equal(ReaExternalRequest.parse(signed, generated, null).headers.size(), 200);
        equal(ReaExternalRequest.parse(signed, generated, null).headers.get("Authorization"), auth.get("Authorization"));

        final Map<String, String> valueLimit = new LinkedHashMap<String, String>();
        ReaExternalRequest.putHeader(valueLimit, "A", repeat("a", 8192));
        equal(valueLimit.get("A").length(), 8192);
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(valueLimit, "A", repeat("a", 8193));}});
        equal(valueLimit.get("A").length(), 8192);
        ReaExternalRequest.putHeader(valueLimit, "A", repeat("é", 4096));
        equal(valueLimit.get("A").getBytes(StandardCharsets.UTF_8).length, 8192);
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(valueLimit, "A", repeat("é", 4096) + "a");}});
        ReaExternalRequest.putHeader(valueLimit, "A", repeat("\uD83D\uDE00", 2048));
        equal(valueLimit.get("A").getBytes(StandardCharsets.UTF_8).length, 8192);
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(valueLimit, "A", repeat("\uD83D\uDE00", 2049));}});

        final Map<String, String> exact = new LinkedHashMap<String, String>();
        ReaExternalRequest.putHeader(exact, "A", repeat("a", 8192));
        ReaExternalRequest.putHeader(exact, "B", repeat("b", 8190));
        equal(headerBytes(exact), 16384);
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(exact, "C", "");}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(exact, "b", repeat("b", 8191));}});
        equal(exact.containsKey("B"), true);
        equal(exact.containsKey("b"), false);
        equal(headerBytes(exact), 16384);
        ReaExternalRequest.putHeader(exact, "b", "replacement");
        equal(exact.size(), 2);
        equal(exact.containsKey("B"), false);
        equal(exact.get("b"), "replacement");

        final Map<String, String> effectiveUa = new LinkedHashMap<String, String>();
        ReaExternalRequest.putHeader(effectiveUa, "User-Agent", "u");
        ReaExternalRequest.putHeader(effectiveUa, "A", repeat("a", 8192));
        ReaExternalRequest.putHeader(effectiveUa, "B", repeat("b", 8179));
        equal(headerBytes(effectiveUa), 16384);
        equal(ReaExternalRequest.parse(signed, effectiveUa, "ignored").userAgent, "u");
        effectiveUa.remove("User-Agent");
        equal(ReaExternalRequest.parse(signed, effectiveUa, "u").userAgent, "u");
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed, effectiveUa, "uu");}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed, effectiveUa, null);}});
        effectiveUa.put("uSeR-aGeNt", "");
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed, effectiveUa, null);}});
        rejected(new Action(){public void run(){ReaExternalRequest.parse(signed, null, repeat("é", 4097));}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(new LinkedHashMap<String,String>(), "A\r\nB", "x");}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(new LinkedHashMap<String,String>(), "A", "x\u007f");}});
        rejected(new Action(){public void run(){ReaExternalRequest.putHeader(new LinkedHashMap<String,String>(), repeat("A", 129), "x");}});
        Map<String, String> tokenNames = new LinkedHashMap<String, String>();
        ReaExternalRequest.putHeader(tokenNames, "!#$%&'*+.^_`|~0123456789AZaz-", "value");
        equal(tokenNames.size(), 1);
        equal(ReaExternalRequest.parse("https://example/VIDEO.MP4?download=1", null, null).uri, "https://example/VIDEO.MP4?download=1");
        System.out.println("{\"suite\":\"external_request\",\"assertions\":"+assertions+",\"passed\":true,\"android_runtime_tested\":false}");
    }
}
