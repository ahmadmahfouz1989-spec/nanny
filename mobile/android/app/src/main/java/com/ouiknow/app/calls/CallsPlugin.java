package com.ouiknow.app.calls;

import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.ouiknow.app.MainActivity;

/** The website's side of calls on Android ("OuiCalls" in src/lib/native-app.ts). */
@CapacitorPlugin(name = "OuiCalls")
public class CallsPlugin extends Plugin {
    private static CallsPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** Answer or open from the notification: to the website now if it's listening, else kept pending. */
    public static void deliver(String callId, String action) {
        CallsPlugin plugin = instance;
        if ("answer".equals(action) && plugin != null && plugin.hasListeners("callAnswered")) {
            JSObject data = new JSObject();
            data.put("callId", callId);
            plugin.notifyListeners("callAnswered", data);
            return;
        }
        if ("ring".equals(action) && plugin != null && plugin.hasListeners("callAnswered")) return; // the website finds ringing calls itself
        IncomingCalls.pendingCallId = callId;
        IncomingCalls.pendingAction = action;
    }

    static void notifyEnded(String callId) {
        CallsPlugin plugin = instance;
        if (plugin == null || callId == null) return;
        JSObject data = new JSObject();
        data.put("callId", callId);
        plugin.notifyListeners("callEnded", data);
    }

    /**
     * Whether an incoming call can take over the screen. Android 14+ only
     * allows it when the person turns it on (Play pre-grants it to calling
     * apps only); before that it's always allowed.
     */
    @PluginMethod
    public void fullScreenCalls(PluginCall call) {
        JSObject result = new JSObject();
        boolean needsPermission = Build.VERSION.SDK_INT >= 34;
        result.put("needsPermission", needsPermission);
        boolean allowed = true;
        if (needsPermission) {
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            allowed = manager != null && manager.canUseFullScreenIntent();
        }
        result.put("allowed", allowed);
        call.resolve(result);
    }

    /** Opens the phone's own switch for full-screen calls (Android 14+). */
    @PluginMethod
    public void openFullScreenCallsSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 34) {
            intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName()));
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
        } catch (Exception e) {
            // Some phones lack the direct screen: the app's settings page has it.
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    @PluginMethod
    public void getVoipToken(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject result = new JSObject();
        if (IncomingCalls.pendingCallId != null) {
            result.put("callId", IncomingCalls.pendingCallId);
            result.put("action", IncomingCalls.pendingAction);
        }
        IncomingCalls.pendingCallId = null;
        IncomingCalls.pendingAction = null;
        call.resolve(result);
    }

    /** Android answers in the website itself; this just stops the ringing. */
    @PluginMethod
    public void answer(PluginCall call) {
        IncomingCalls.cancel(getContext(), call.getString("callId"));
        JSObject result = new JSObject();
        result.put("handled", false);
        call.resolve(result);
    }

    @PluginMethod
    public void callActive(PluginCall call) {
        String callId = call.getString("callId");
        IncomingCalls.cancel(getContext(), callId);
        CallService.start(getContext(), callId, call.getString("name", ""));
        call.resolve();
    }

    @PluginMethod
    public void callEnded(PluginCall call) {
        IncomingCalls.cancel(getContext(), call.getString("callId"));
        CallService.stop(getContext());
        if (getActivity() instanceof MainActivity) getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).leaveCallMode());
        call.resolve();
    }
}
