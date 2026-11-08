import com.ape.rea.ReaExternalPlayerActivity;
import com.ape.rea.ReaExternalRequest;
import android.os.Bundle;
import org.json.JSONObject;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Executes the production Activity's private parser, using Android's real Java
 * Bundle/JSONObject classes on a JVM. This does not exercise an Activity lifecycle,
 * Intent dispatch, network access, or physical Android playback. */
public final class ReaExternalHeadersContainerTest {
    private static int assertions;
    private static Method parser;
    private static void equal(Object actual, Object expected) {
        assertions++;
        if (actual == null ? expected != null : !actual.equals(expected)) {
            throw new AssertionError("Container assertion " + assertions + " failed");
        }
    }
    private static LinkedHashMap<String, String> parse(Object input) throws Exception {
        LinkedHashMap<String, String> result = new LinkedHashMap<String, String>();
        try { parser.invoke(null, result, input); }
        catch (InvocationTargetException failure) {
            Throwable cause = failure.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            throw failure;
        }
        return result;
    }
    private static void rejected(Object input) throws Exception {
        assertions++;
        try { parse(input); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Expected invalid container to be rejected (" + assertions + ")");
    }
    private static LinkedHashMap<String, String> fields(int count) {
        LinkedHashMap<String, String> data = new LinkedHashMap<String, String>();
        data.put("Authorization", "Bearer test+/==");
        data.put("Cookie", "session=fixture%2B; mode=2");
        data.put("User-Agent", "REA Test/1.0");
        for (int i = data.size(); i < count; i++) data.put("X-APE-Test-" + i, "1");
        return data;
    }
    private static Object[] containers(Map<String, String> fields) {
        Bundle bundle = new Bundle();
        List<String> pairs = new ArrayList<String>();
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            bundle.putString(entry.getKey(), entry.getValue());
            pairs.add(entry.getKey());
            pairs.add(entry.getValue());
        }
        return new Object[] {fields, bundle, new JSONObject(fields).toString(),
            pairs.toArray(new String[pairs.size()]), pairs};
    }
    public static void main(String[] args) throws Exception {
        parser = ReaExternalPlayerActivity.class.getDeclaredMethod("addHeaders", Map.class, Object.class);
        parser.setAccessible(true);
        final String signed = "https://cdn.example/live.m3u8?sig=a%2Bb%2Fc%3D&x=1+2&x=3";
        for (int count : new int[] {200, 256}) {
            LinkedHashMap<String, String> expected = fields(count);
            for (Object container : containers(expected)) {
                LinkedHashMap<String, String> actual = parse(container);
                equal(actual, expected);
                ReaExternalRequest request = ReaExternalRequest.parse(signed, actual, null);
                equal(request.headers.size(), count);
                equal(request.uri, signed);
                equal(request.userAgent, expected.get("User-Agent"));
                equal(request.headers.get("Authorization"), expected.get("Authorization"));
                equal(request.headers.get("Cookie"), expected.get("Cookie"));
            }
        }
        for (Object container : containers(fields(257))) rejected(container);
        equal(parse(new String[] {"USER-agent", "first", "user-AGENT", "last"}).size(), 1);
        equal(parse(Arrays.asList("USER-agent", "first", "user-AGENT", "last")).get("user-AGENT"), "last");
        rejected(new String[] {"odd"});
        rejected(Arrays.asList("odd"));
        rejected(Arrays.asList(Integer.valueOf(1), "invalid-key"));
        rejected(Arrays.asList("X-Test", Integer.valueOf(1)));
        for (String badKey : new String[] {"Invalid Header", "A\r\nB", ""}) {
            LinkedHashMap<String, String> invalid = new LinkedHashMap<String, String>();
            invalid.put(badKey, "test");
            for (Object container : containers(invalid)) rejected(container);
        }
        for (String badValue : new String[] {"one\r\nInjected: two", "one\ntwo", "one\u0000two"}) {
            LinkedHashMap<String, String> invalid = new LinkedHashMap<String, String>();
            invalid.put("X-Test", badValue);
            for (Object container : containers(invalid)) rejected(container);
        }
        char[] huge = new char[8193];
        Arrays.fill(huge, 'a');
        LinkedHashMap<String, String> invalid = new LinkedHashMap<String, String>();
        invalid.put("X-Test", new String(huge));
        for (Object container : containers(invalid)) rejected(container);
        Arrays.fill(huge, 'é');
        invalid.put("X-Test", new String(huge, 0, 4097));
        for (Object container : containers(invalid)) rejected(container);
        invalid.clear();
        invalid.put("A", new String(huge, 0, 4096));
        invalid.put("B", new String(huge, 0, 4095));
        for (Object container : containers(invalid)) equal(parse(container), invalid);
        invalid.put("B", new String(huge, 0, 4096));
        for (Object container : containers(invalid)) rejected(container);
        System.out.println("{\"suite\":\"external_header_containers\",\"assertions\":" + assertions
            + ",\"passed\":true,\"formats\":[\"Map\",\"Bundle\",\"JSON\",\"String[]\",\"List\"]"
            + ",\"android_runtime_tested\":false,\"uses_test_doubles\":false}");
    }
}
