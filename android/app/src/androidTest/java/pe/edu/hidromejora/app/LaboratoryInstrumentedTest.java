package pe.edu.hidromejora.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.security.NetworkSecurityPolicy;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Solo la variante LAB en el AVD opt-in; nunca instala ni modifica la oficial. */
@RunWith(AndroidJUnit4.class)
public class LaboratoryInstrumentedTest {
    private Context laboratory() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assumeTrue("Solo emulador LAB opt-in",
            "1".equals(InstrumentationRegistry.getArguments().getString("hidroSecureFixture")) &&
            (Build.FINGERPRINT.contains("generic") || Build.MODEL.startsWith("sdk_gphone")) &&
            "pe.edu.hidromejora.app.lab120".equals(context.getPackageName()));
        return context;
    }
    @Test public void laboratoryIdentityAndNetworkPolicy() {
        Context context = laboratory();
        assertEquals("Hidro-Mejora LAB", context.getApplicationInfo().loadLabel(context.getPackageManager()).toString());
        NetworkSecurityPolicy policy = NetworkSecurityPolicy.getInstance();
        assertFalse(policy.isCleartextTrafficPermitted());
        assertTrue(policy.isCleartextTrafficPermitted("127.0.0.1"));
        assertTrue(policy.isCleartextTrafficPermitted("localhost"));
        for (String denied : new String[]{"10.0.2.2", "192.168.1.2", "example.com"}) assertFalse(policy.isCleartextTrafficPermitted(denied));
    }
    @Test public void laboratoryBackupAndPushDisabled() throws Exception {
        Context context = laboratory();
        assertEquals(0, context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
        assertTrue((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        assertFalse(BuildConfig.HM_PUSH_CONFIGURED);
        assertEquals("1.2.0-lab.1", context.getPackageManager().getPackageInfo(context.getPackageName(),0).versionName);
    }
}
