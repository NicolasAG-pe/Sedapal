package pe.edu.hidromejora.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Storage Access Framework: el usuario elige destino. No requiere permisos de almacenamiento. */
@CapacitorPlugin(name = "HidroDocuments")
public class HidroDocumentsPlugin extends Plugin {
    private boolean choosing = false;

    private byte[] payload(PluginCall call) {
        String encoded = call.getString("base64", "");
        if (encoded.length() > (DocumentPayload.MAX_BYTES * 4 / 3 + 8)) {
            throw new IllegalArgumentException("Documento demasiado grande.");
        }
        byte[] data = Base64.decode(encoded, Base64.DEFAULT);
        DocumentPayload.validate(call.getString("fileName"), data);
        return data;
    }

    @PluginMethod
    public void save(PluginCall call) {
        try { payload(call); } catch (IllegalArgumentException error) { call.reject(error.getMessage()); return; }
        synchronized (this) {
            if (choosing) { call.reject("Ya hay un documento en proceso de guardado."); return; }
            choosing = true;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName"));
        getActivity().runOnUiThread(() -> {
            try { startActivityForResult(call, intent, "documentCreated"); }
            catch (Exception error) { synchronized (this) { choosing = false; } call.reject("No se pudo abrir el selector de documentos."); }
        });
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) { synchronized (this) { choosing = false; } return; }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            synchronized (this) { choosing = false; }
            JSObject response = new JSObject(); response.put("saved", false); call.resolve(response); return;
        }
        // Escribir fuera del hilo visual, incluso si el proveedor tarda en responder.
        bridge.execute(() -> {
            try {
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(destination)) {
                    if (stream == null) throw new IllegalStateException("Destino no disponible.");
                    stream.write(payload(call)); stream.flush();
                }
                getActivity().runOnUiThread(() -> {
                    Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(destination, "application/pdf");
                    view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try { getActivity().startActivity(view); } catch (Exception ignored) { /* Guardado disponible aunque no haya visor PDF. */ }
                    synchronized (this) { choosing = false; }
                    JSObject response = new JSObject(); response.put("saved", true); call.resolve(response);
                });
            } catch (Exception error) {
                synchronized (this) { choosing = false; } call.reject("No se pudo guardar el PDF en el destino elegido.");
            }
        });
    }
}
