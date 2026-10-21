package pe.edu.hidromejora.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Solo estado propio de la instalación: sin backup, claves no exportables, AES-GCM. */
final class EncryptedStateStore {
    private static final Object LOCK = new Object();
    private static final int MAX_BYTES = 16384;
    private final File directory;
    private final String namespace;

    EncryptedStateStore(Context context) throws IOException {
        directory = new File(context.getNoBackupFilesDir(), "hm-secure-v1");
        namespace = context.getPackageName();
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Almacenamiento no disponible.");
    }

    private AtomicFile file(String slot) {
        if (!"session".equals(slot)) throw new IllegalArgumentException("Estado no admitido.");
        return new AtomicFile(new File(directory, slot + ".bin"));
    }

    private AtomicFile denied(String slot) { return new AtomicFile(new File(directory, slot + ".denied")); }

    private SecretKey key(String slot) throws Exception {
        String alias = namespace + ".state." + slot + ".v1";
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) {
            java.security.Key saved = store.getKey(alias, null);
            if (!(saved instanceof SecretKey)) throw new GeneralSecurityException("Clave no disponible.");
            return (SecretKey) saved;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private void atomicWrite(AtomicFile target, byte[] value) throws IOException {
        FileOutputStream stream = null;
        try {
            stream = target.startWrite();
            stream.write(value);
            target.finishWrite(stream);
        } catch (IOException error) {
            if (stream != null) target.failWrite(stream);
            throw error;
        }
    }

    void write(String slot, String value) throws Exception {
        synchronized (LOCK) {
            AtomicFile target = file(slot);
            byte[] plain = value.getBytes(StandardCharsets.UTF_8);
            if (plain.length == 0 || plain.length > MAX_BYTES) throw new IllegalArgumentException("Estado inválido.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(slot));
            cipher.updateAAD((namespace + ":" + slot + ":v1").getBytes(StandardCharsets.UTF_8));
            try {
                byte[] encrypted = cipher.doFinal(plain), iv = cipher.getIV();
                if (iv.length != 12) throw new GeneralSecurityException("IV inválido.");
                byte[] packet = new byte[1 + iv.length + encrypted.length];
                packet[0] = 1;
                System.arraycopy(iv, 0, packet, 1, iv.length);
                System.arraycopy(encrypted, 0, packet, 13, encrypted.length);
                atomicWrite(target, packet);
                denied(slot).delete();
                if (denied(slot).getBaseFile().exists()) throw new IOException("Estado bloqueado.");
            } finally { Arrays.fill(plain, (byte) 0); }
        }
    }

    String read(String slot) throws Exception {
        synchronized (LOCK) {
            AtomicFile target = file(slot);
            if (denied(slot).getBaseFile().exists()) return null;
            if (!target.getBaseFile().exists()) return null;
            if (target.getBaseFile().length() > MAX_BYTES + 29) throw new GeneralSecurityException("Estado inválido.");
            byte[] packet = target.readFully();
            if (packet.length < 30 || packet[0] != 1) throw new GeneralSecurityException("Estado inválido.");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(slot), new GCMParameterSpec(128, packet, 1, 12));
            cipher.updateAAD((namespace + ":" + slot + ":v1").getBytes(StandardCharsets.UTF_8));
            byte[] plain = cipher.doFinal(packet, 13, packet.length - 13);
            try { return new String(plain, StandardCharsets.UTF_8); }
            finally { Arrays.fill(plain, (byte) 0); }
        }
    }

    void clear(String slot) throws IOException {
        synchronized (LOCK) {
            AtomicFile target = file(slot);
            // La marca durable precede al borrado: un cierre interrumpido no habilita la credencial.
            atomicWrite(denied(slot), new byte[] { 1 });
            target.delete();
            if (target.getBaseFile().exists()) throw new IOException("No se pudo retirar el estado.");
        }
    }
}
