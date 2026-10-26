package pe.edu.hidromejora.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HidroDocumentsPlugin.class);
        registerPlugin(HidroSecureStatePlugin.class);
        registerPlugin(HidroPushStatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
