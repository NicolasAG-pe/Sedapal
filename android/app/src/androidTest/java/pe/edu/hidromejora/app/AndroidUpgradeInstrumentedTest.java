package pe.edu.hidromejora.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Opt-in, solo AVD aislado sin red. Ejecutar antes y después de adb install -r. */
@RunWith(AndroidJUnit4.class)
public class AndroidUpgradeInstrumentedTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private String evaluate(BridgeActivity activity, String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(script, value -> {
            result.set(value);
            done.countDown();
        }));
        assertTrue("WebView no respondió", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    @Test
    public void storageSurvivesSignedUpgrade() throws Exception {
        Bundle args = InstrumentationRegistry.getArguments();
        String phase = args.getString("hidroUpgradePhase", "");
        assumeTrue("Requiere fase explícita seed/verify y AVD independiente",
            (phase.equals("seed") || phase.equals("verify")) &&
            (Build.FINGERPRINT.contains("generic") || Build.MODEL.startsWith("sdk_gphone")));
        String packageName = instrumentation.getTargetContext().getPackageName();
        assertEquals("pe.edu.hidromejora.app", packageName);
        String version = instrumentation.getTargetContext().getPackageManager()
            .getPackageInfo(packageName, 0).versionName;
        assertEquals(phase.equals("seed") ? "1.0.0" : "1.1.0", version);
        Intent intent = new Intent().setClassName(packageName, packageName + ".MainActivity")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        Activity started = instrumentation.startActivitySync(intent);
        try {
            assertTrue(started instanceof BridgeActivity);
            BridgeActivity activity = (BridgeActivity) started;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            while (!"true".equals(evaluate(activity,
                "document.readyState === 'complete' && !!document.getElementById('login-form')"))) {
                assertTrue("No cargó el runtime local", System.nanoTime() < deadline);
                Thread.sleep(100);
            }
            assertEquals("\"https://localhost\"", evaluate(activity, "location.origin"));
            assertEquals("true", evaluate(activity, "Capacitor.isNativePlatform()"));
            assertEquals("true", evaluate(activity, "Capacitor.isPluginAvailable('HidroDocuments')"));
            if (phase.equals("seed")) {
                // Preferencia real del tutorial y marcador sintético; ninguna cuenta ni JWT.
                assertEquals("true", evaluate(activity,
                    "(()=>{localStorage.setItem('hm_tutorial_seen','1');" +
                    "localStorage.setItem('hm_native_upgrade_fixture','synthetic-avance16');return true;})()"));
            }
            assertEquals("\"1\"", evaluate(activity, "localStorage.getItem('hm_tutorial_seen')"));
            assertEquals("\"synthetic-avance16\"", evaluate(activity,
                "localStorage.getItem('hm_native_upgrade_fixture')"));
            assertEquals("null", evaluate(activity, "sessionStorage.getItem('hm_token')"));
            assertEquals("true", evaluate(activity, "!document.getElementById('login-form').hidden"));
        } finally {
            instrumentation.runOnMainSync(started::finish);
        }
    }
}
