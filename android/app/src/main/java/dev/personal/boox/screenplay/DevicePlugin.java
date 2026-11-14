package dev.personal.boox.screenplay;

import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Reports whether a hardware (e.g. Bluetooth) keyboard is connected, and tells the web layer when that changes. */
@CapacitorPlugin(name = "Device")
public class DevicePlugin extends Plugin {
    private boolean lastValue;

    @Override
    public void load() {
        lastValue = hardwareKeyboardConnected(getContext().getResources().getConfiguration());
    }

    static boolean hardwareKeyboardConnected(Configuration c) {
        return c.keyboard != Configuration.KEYBOARD_NOKEYS
            && c.hardKeyboardHidden != Configuration.HARDKEYBOARDHIDDEN_YES;
    }

    @PluginMethod
    public void hasHardwareKeyboard(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", hardwareKeyboardConnected(getContext().getResources().getConfiguration()));
        call.resolve(result);
    }

    // MainActivity declares configChanges="keyboard|keyboardHidden", so a change arrives here
    // instead of recreating the activity.
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        boolean now = hardwareKeyboardConnected(newConfig);
        if (now == lastValue) return;
        lastValue = now;
        JSObject data = new JSObject();
        data.put("value", now);
        notifyListeners("keyboardChange", data);
    }
}
