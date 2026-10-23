package pe.edu.hidromejora.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.GeneralSecurityException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

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

    @PluginMethod
    public void readRegistration(PluginCall call) {
        execute(call, store -> {
            JSObject result = new JSObject();
            try {
                String saved = store.read("registration");
                if (saved != null) result.put("pending", new JSONObject(saved));
            } catch (GeneralSecurityException | org.json.JSONException ignored) {
                store.clear("registration");
                result.put("invalid", true);
            }
            return result;
        });
    }

    @PluginMethod
    public void writeRegistration(PluginCall call) {
        JSObject pending = call.getObject("pending");
        String id = pending == null ? "" : pending.optString("id", "");
        String supply = pending == null ? "" : pending.optString("suministro", "");
        if (!id.matches("(?i)[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}") || !supply.matches("[0-9]{9}")) {
            call.reject("Solicitud pendiente inválida."); return;
        }
        // Lista cerrada: ningún campo adicional puede persistir un OTP o credencial.
        JSObject minimal = new JSObject(); minimal.put("id", id); minimal.put("suministro", supply);
        execute(call, store -> { store.write("registration", minimal.toString()); return new JSObject(); });
    }

    @PluginMethod
    public void clearRegistration(PluginCall call) {
        execute(call, store -> { store.clear("registration"); return new JSObject(); });
    }
}
