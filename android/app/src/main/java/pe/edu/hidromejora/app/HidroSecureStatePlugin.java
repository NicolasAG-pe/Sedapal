package pe.edu.hidromejora.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.GeneralSecurityException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Nunca registra argumentos/respuestas. Capacitor loggingBehavior debe ser none. */
@CapacitorPlugin(name = "HidroSecureState")
public class HidroSecureStatePlugin extends Plugin {
    private static final ExecutorService OPERATIONS = Executors.newSingleThreadExecutor();
    private interface Operation { JSObject run(EncryptedStateStore store) throws Exception; }

    private void execute(PluginCall call, Operation operation) {
        OPERATIONS.execute(() -> {
            try { call.resolve(operation.run(new EncryptedStateStore(getContext()))); }
            catch (Exception ignored) {
                // Sin excepción/causa: un error criptográfico nunca debe incluir la credencial.
                call.reject("No se pudo acceder al almacenamiento seguro. Intenta nuevamente.", "SECURE_STATE_UNAVAILABLE");
            }
        });
    }

    @PluginMethod
    public void readSession(PluginCall call) {
        execute(call, store -> {
            JSObject result = new JSObject();
            try { result.put("token", store.read("session")); }
            catch (GeneralSecurityException ignored) {
                store.clear("session");
                result.put("invalid", true);
            }
            return result;
        });
    }

    @PluginMethod
    public void writeSession(PluginCall call) {
        String token = call.getString("token", "");
        if (token.length() > 8192 || !token.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) {
            call.reject("Credencial inválida.");
            return;
        }
        execute(call, store -> { store.write("session", token); return new JSObject(); });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        execute(call, store -> { store.clear("session"); return new JSObject(); });
    }
}
