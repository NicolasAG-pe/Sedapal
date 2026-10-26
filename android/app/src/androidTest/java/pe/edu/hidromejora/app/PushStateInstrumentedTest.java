package pe.edu.hidromejora.app;
import static org.junit.Assert.*;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import org.junit.Test;
import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
public class PushStateInstrumentedTest {
 @Test public void encryptedPushIsIndependent() throws Exception {
  assertEquals("1",InstrumentationRegistry.getArguments().getString("hidroSecureFixture"));
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();EncryptedStateStore store=new EncryptedStateStore(context);
  String proof="fixture-proof-only-not-an-actual-capability",session="fixture-session",registration="fixture-registration";
  try{store.write("session",session);store.write("registration",registration);store.write("push",proof);
   byte[] data=Files.readAllBytes(new File(context.getNoBackupFilesDir(),"hm-secure-v1/push.bin").toPath());assertFalse(new String(data,StandardCharsets.ISO_8859_1).contains(proof));assertEquals(proof,store.read("push"));
   store.clear("push");assertEquals(session,store.read("session"));assertEquals(registration,store.read("registration"));
   store.write("push",proof);store.clear("session");store.clear("registration");assertEquals(proof,store.read("push"));
  }finally{store.clear("session");store.clear("registration");store.clear("push");}
 }
}
