package com.ouiknow.app.calls;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Takes the place of the push plugin's own receiver (AndroidManifest.xml):
 * call rings and cancels are handled here, every other push goes on to
 * the plugin as before.
 */
public class CallMessagingService extends MessagingService {
    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String kind = data.get("kind");
        if ("incoming".equals(kind)) {
            IncomingCalls.show(this, data);
            return;
        }
        if ("cancel".equals(kind)) {
            String callId = data.get("callId");
            // The phone that answered has the call open; only ringing stops.
            if (callId != null && !callId.equals(CallService.activeCallId)) IncomingCalls.cancel(this, callId);
            return;
        }
        super.onMessageReceived(remoteMessage);
    }
}
