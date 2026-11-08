import com.ape.rea.ReaExternalRequest;
import com.ape.rea.ReaMediaSources;
import java.net.URI;
import java.util.LinkedHashMap;

/** Pure container-selection tests against the production helper; no network or device. */
public final class ReaMediaSourcesTest {
    private static int assertions;
    private static void equal(Object actual, Object expected) {
        assertions++;
        if (actual == null ? expected != null : !actual.equals(expected)) {
            throw new AssertionError("Source routing assertion " + assertions + " failed");
        }
    }
    public static void main(String[] args) throws Exception {
        for (boolean external : new boolean[] {false, true}) {
            equal(ReaMediaSources.resolveMimeType("/A.MPD", null, external), "application/dash+xml");
            equal(ReaMediaSources.resolveMimeType("/A.MPD", "video/*", external), "application/dash+xml");
            equal(ReaMediaSources.resolveMimeType("/stream", "application/dash+xml", external), "application/dash+xml");
            equal(ReaMediaSources.resolveMimeType("/stream", "APPLICATION/DASH+XML; charset=utf-8", external), "application/dash+xml");
            equal(ReaMediaSources.resolveMimeType("/A.M3U8", null, external), "application/x-mpegURL");
            equal(ReaMediaSources.resolveMimeType("/stream", "application/vnd.apple.mpegurl", external), "application/x-mpegURL");
            equal(ReaMediaSources.resolveMimeType("/stream", "application/x-mpegURL", external), "application/x-mpegURL");
            for (String extension : new String[] {"mp4", "m4v", "mkv", "webm", "ts", "m2ts", "mov", "mp3", "aac", "ogg", "flac", "wav"}) {
                equal(ReaMediaSources.resolveMimeType("/media." + extension, null, external), null);
            }
            equal(ReaMediaSources.resolveMimeType("/movie.mp4", "video/mp4", external), "video/mp4");
            equal(ReaMediaSources.resolveMimeType("/movie.ts", "video/mp2t", external), "video/mp2t");
            equal(ReaMediaSources.resolveMimeType("/stream", "video/*", external), null);
            equal(ReaMediaSources.resolveMimeType("/stream", "application/octet-stream", external), null);
        }
        equal(ReaMediaSources.resolveMimeType("/stream", null, false), "application/x-mpegURL");
        equal(ReaMediaSources.resolveMimeType("/stream", null, true), null);
        equal(ReaMediaSources.resolveMimeType(null, "application/dash+xml", true), "application/dash+xml");
        equal(ReaMediaSources.resolveMimeType("/stream.mpd/part.mp4", null, true), null);
        String signed = "https://cdn.example/channel.MPD?sig=a%2Bb%2Fc%3D&x=1+2&x=3#untouched";
        LinkedHashMap<String, String> headers = new LinkedHashMap<String, String>();
        headers.put("Authorization", "Bearer fixture+/==");
        headers.put("User-Agent", "Provider Fixture/1.0");
        ReaExternalRequest request = ReaExternalRequest.parse(signed, headers, null);
        equal(request.uri, signed);
        equal(request.headers, headers);
        equal(ReaMediaSources.resolveMimeType(new URI(request.uri).getPath(), null, true), "application/dash+xml");
        System.out.println("{\"suite\":\"media_source_routing\",\"assertions\":" + assertions
                + ",\"passed\":true,\"android_runtime_tested\":false,\"network_playback_tested\":false}");
    }
}
