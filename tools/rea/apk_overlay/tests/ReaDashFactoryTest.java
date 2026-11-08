import com.ape.rea.ReaExternalRequest;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.dash.DashMediaSource;
import java.lang.reflect.Field;
import java.util.LinkedHashMap;

/** Exercises the pinned official DASH factory and real HTTP factory objects on a
 * JVM. No request, license negotiation, codec, display, or Android lifecycle is run. */
public final class ReaDashFactoryTest {
    private static int assertions;
    private static void equal(Object actual, Object expected) {
        assertions++;
        if (actual == null ? expected != null : !actual.equals(expected)) {
            throw new AssertionError("DASH factory assertion " + assertions + " failed");
        }
    }
    private static Object field(Object target, String name) throws Exception {
        Class<?> type = target.getClass();
        while (type != null) {
            try {
                Field field = type.getDeclaredField(name);
                field.setAccessible(true);
                return field.get(target);
            } catch (NoSuchFieldException absent) { type = type.getSuperclass(); }
        }
        throw new NoSuchFieldException(name);
    }
    public static void main(String[] args) throws Exception {
        LinkedHashMap<String, String> headers = new LinkedHashMap<String, String>();
        headers.put("Authorization", "Bearer fixture+/==");
        headers.put("Cookie", "session=fixture%2B; mode=2");
        headers.put("Referer", "https://portal.example/watch?a=1&b=2");
        headers.put("User-Agent", "Provider Fixture/1.0");
        for (int i = headers.size(); i < 200; i++) headers.put("X-APE-Test-" + i, "1");
        ReaExternalRequest request = ReaExternalRequest.parse(
                "https://cdn.example/live.MPD?sig=a%2Bb%2Fc%3D&x=1+2&x=3", headers, "ignored");
        DefaultHttpDataSource.Factory upstream = new DefaultHttpDataSource.Factory()
                .setUserAgent(request.userAgent).setDefaultRequestProperties(request.headers);
        DashMediaSource.Factory dash = new DashMediaSource.Factory(upstream);
        DataSource.Factory manifest = (DataSource.Factory) field(dash, "manifestDataSourceFactory");
        DataSource.Factory chunks = (DataSource.Factory) field(field(dash, "chunkSourceFactory"), "dataSourceFactory");
        equal(manifest == upstream, true);
        equal(chunks == upstream, true);
        for (DataSource.Factory factory : new DataSource.Factory[] {manifest, chunks}) {
            DataSource source = factory.createDataSource();
            HttpDataSource.RequestProperties defaults =
                    (HttpDataSource.RequestProperties) field(source, "defaultRequestProperties");
            equal(defaults.getSnapshot(), headers);
            equal(field(source, "userAgent"), "Provider Fixture/1.0");
            equal(defaults.getSnapshot().get("Authorization"), headers.get("Authorization"));
            equal(defaults.getSnapshot().get("Cookie"), headers.get("Cookie"));
            equal(defaults.getSnapshot().get("Referer"), headers.get("Referer"));
            equal(defaults.getSnapshot().size(), 200);
        }
        System.out.println("{\"suite\":\"dash_factory_auth\",\"assertions\":" + assertions
                + ",\"passed\":true,\"android_runtime_tested\":false,\"network_playback_tested\":false,\"uses_test_doubles\":false}");
    }
}
