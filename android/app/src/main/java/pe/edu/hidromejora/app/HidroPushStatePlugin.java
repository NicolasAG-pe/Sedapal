package pe.edu.hidromejora.app;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.SecureRandom;
import android.util.Base64;
import java.util.UUID;

/** Capacidad exclusiva de revocación, separada del JWT y del registro OTP. */
@CapacitorPlugin(name="HidroPushState")
public class HidroPushStatePlugin extends Plugin {
    private static final Object LOCK=new Object();
    private JSObject state(EncryptedStateStore store) throws Exception {
        String raw=store.read("push");
        if(raw!=null)return new JSObject(raw);
        byte[] random=new byte[32];new SecureRandom().nextBytes(random);
        JSObject value=new JSObject();value.put("installation_id",UUID.randomUUID().toString());
        value.put("proof",Base64.encodeToString(random,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING));
        JSObject categories=new JSObject();for(String k:new String[]{"recibos","vencimientos","incidencias","cortes"})categories.put(k,true);value.put("categories",categories);
        value.put("enabled",false);value.put("pending",false);store.write("push",value.toString());return value;
    }
    @PluginMethod public void read(PluginCall call){
        synchronized(LOCK){try{call.resolve(state(new EncryptedStateStore(getContext())));}catch(Exception ignored){call.reject("No se pudo acceder al estado privado push.");}}
    }
    @PluginMethod public void flags(PluginCall call){
        synchronized(LOCK){try{EncryptedStateStore store=new EncryptedStateStore(getContext());JSObject value=state(store);
            String owner=call.getString("owner",value.optString("owner",""));
            if(!owner.isEmpty()&&!owner.matches("[1-9][0-9]{0,18}:[0-9]{9}")){call.reject("Contexto push inválido.");return;}
            value.put("owner",owner);
            JSObject categories=call.getObject("categories");if(categories!=null){JSObject safe=new JSObject();for(String k:new String[]{"recibos","vencimientos","incidencias","cortes"})safe.put(k,categories.optBoolean(k,true));value.put("categories",safe);}
            value.put("enabled",call.getBoolean("enabled",false));value.put("pending",call.getBoolean("pending",false));store.write("push",value.toString());call.resolve(value);
        }catch(Exception ignored){call.reject("No se pudo guardar el estado privado push.");}}
    }
    @PluginMethod public void configuration(PluginCall call){JSObject value=new JSObject();value.put("configured",BuildConfig.HM_PUSH_CONFIGURED);call.resolve(value);}
}
