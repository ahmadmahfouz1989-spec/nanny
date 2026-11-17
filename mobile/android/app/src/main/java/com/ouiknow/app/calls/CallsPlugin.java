package com.ouiknow.app.calls;

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
