package com.ouiknow.app.calls;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Decline on the incoming-call notification: stops the ringing and tells
 * the server, with the token the ring carried, without opening the app.
 */
public class CallActionReceiver extends BroadcastReceiver {
    public static final String DECLINE = "com.ouiknow.app.calls.DECLINE";
    private static final String SITE = "https://oui-know.com";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!DECLINE.equals(intent.getAction())) return;
        final String callId = intent.getStringExtra(IncomingCalls.EXTRA_CALL_ID);
        final String token = intent.getStringExtra(IncomingCalls.EXTRA_TOKEN);
        IncomingCalls.cancel(context, callId);
        CallsPlugin.notifyEnded(callId);
        if (callId == null || token == null) return;

        final PendingResult result = goAsync();
        // The caller's phone stops ringing on its own after 45 seconds if this fails.
        tellServer(callId, token, "decline", result::finish);
    }

    /**
     * Tells the server about this call with the token the ring carried:
     * "decline", or "reached" (ringing here: the caller sees "Ringing…").
     */
    static void tellServer(String callId, String token, String action, Runnable done) {
        if (callId == null || token == null) {
            if (done != null) done.run();
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(SITE + "/api/calls/" + callId + "/native").openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                JSONObject body = new JSONObject().put("token", token).put("action", action);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                connection.getResponseCode();
            } catch (Exception ignored) {
                // Best effort.
            } finally {
                if (connection != null) connection.disconnect();
                if (done != null) done.run();
            }
        }).start();
    }
}
