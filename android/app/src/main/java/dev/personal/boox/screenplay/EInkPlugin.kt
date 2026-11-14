package dev.personal.boox.screenplay

import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.onyx.android.sdk.api.device.epd.EpdController
import com.onyx.android.sdk.api.device.epd.UpdateMode

/**
 * Thin bridge to the Onyx EPD SDK (`onyxsdk-device`). No policy here: when to switch mode lives
 * in `src/platform/refreshPolicy.ts`. On anything that is not an Onyx device every call resolves
 * and does nothing, and the Onyx classes are never touched.
 *
 * Mapping (names verified against onyx-intl/OnyxAndroidDemo docs, see ticket 02 Handoff notes):
 *   fast   -> UpdateMode.ANIMATION   (fastest, black and white; tuning belongs to ticket 16)
 *   normal -> UpdateMode.REGAL       (partial update, 16 grays, tuned for text)
 *   full   -> UpdateMode.GC          (full-screen clean redraw, via EpdController.invalidate)
 *
 * Key-event forwarding (volume keys for page turns, ticket 15) should be added here: override
 * handleOnNewIntent-style hooks in MainActivity and call `notifyListeners("key", ...)`.
 */
@CapacitorPlugin(name = "EInk")
class EInkPlugin : Plugin() {
    private val isOnyx: Boolean
        get() = Build.MANUFACTURER.equals("ONYX", ignoreCase = true)

    @PluginMethod
    fun isEInk(call: PluginCall) {
        call.resolve(JSObject().put("value", isOnyx))
    }

    @PluginMethod
    fun setRefreshMode(call: PluginCall) {
        val mode = call.getString("mode")
        if (!isOnyx) return call.resolve()
        runOnUi(call) {
            when (mode) {
                "fast" -> EpdController.setViewDefaultUpdateMode(bridge.webView, UpdateMode.ANIMATION)
                "normal" -> EpdController.setViewDefaultUpdateMode(bridge.webView, UpdateMode.REGAL)
                "full" -> EpdController.invalidate(bridge.webView, UpdateMode.GC)
                else -> return@runOnUi call.reject("Unknown mode: $mode")
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun fullRefresh(call: PluginCall) {
        if (!isOnyx) return call.resolve()
        runOnUi(call) {
            EpdController.invalidate(bridge.webView, UpdateMode.GC)
            call.resolve()
        }
    }

    private fun runOnUi(call: PluginCall, block: () -> Unit) {
        activity.runOnUiThread {
            try {
                block()
            } catch (e: Throwable) {
                // SDK missing or API mismatch on this firmware: refresh control is cosmetic.
                call.reject("Onyx refresh failed: ${e.message}")
            }
        }
    }
}
