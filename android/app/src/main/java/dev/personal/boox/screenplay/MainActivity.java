package dev.personal.boox.screenplay;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocumentStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
