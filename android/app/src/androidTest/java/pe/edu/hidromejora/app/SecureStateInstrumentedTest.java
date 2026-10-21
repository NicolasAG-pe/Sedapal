package pe.edu.hidromejora.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.io.DataInputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureStateInstrumentedTest {
    private byte[] bytes(File file) throws Exception {
        byte[] value=new byte[(int)file.length()];
        try(DataInputStream stream=new DataInputStream(new FileInputStream(file))){stream.readFully(value);}
        return value;
    }
    @Test
    public void keystoreCiphertextTamperAndLogout() throws Exception {
        assumeTrue("Solo fixtures opt-in en AVD independiente",
            "1".equals(InstrumentationRegistry.getArguments().getString("hidroSecureFixture")) &&
            (Build.FINGERPRINT.contains("generic") || Build.MODEL.startsWith("sdk_gphone")));
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        EncryptedStateStore store=new EncryptedStateStore(context);
        File file=new File(context.getNoBackupFilesDir(),"hm-secure-v1/session.bin");
        String synthetic="synthetic.header.signature";
        try {
            store.clear("session");store.write("session",synthetic);
            byte[] first=bytes(file);
            assertFalse(new String(first,StandardCharsets.ISO_8859_1).contains(synthetic));
            assertEquals(synthetic,store.read("session"));
            store.write("session",synthetic);
            byte[] second=bytes(file);assertFalse(Arrays.equals(first,second));
            KeyStore keys=KeyStore.getInstance("AndroidKeyStore");keys.load(null);
            assertNull(keys.getKey(context.getPackageName()+".state.session.v1",null).getEncoded());
            second[second.length-1]^=1;try(FileOutputStream output=new FileOutputStream(file)){output.write(second);}
            try {store.read("session");fail("Se aceptó un ciphertext alterado");}catch(GeneralSecurityException expected){}
            store.clear("session");assertNull(store.read("session"));assertFalse(file.exists());
            store.write("session",synthetic);assertEquals(synthetic,store.read("session"));
        }finally{store.clear("session");}
    }
}
