package com.ouiknow.app.calls;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import com.ouiknow.app.MainActivity;
import com.ouiknow.app.R;
import java.util.Map;

/**
 * Calls ringing like phone calls on Android (1.4): a data push from the
 * server (src/lib/calls.ts) becomes a full-screen incoming-call
 * notification -- over the lock screen, ringing until answered, declined,
 * cancelled or 45 seconds pass. Answer opens the app, which connects the
 * call (src/components/calls/call-provider.tsx); Decline tells the server
 * from here (CallActionReceiver).
 */
public final class IncomingCalls {
    public static final String CHANNEL = "calls";
    public static final String EXTRA_CALL_ID = "ouiCallId";
    public static final String EXTRA_ACTION = "ouiCallAction";
    public static final String EXTRA_TOKEN = "ouiCallToken";
    /** As RING_SECONDS in src/lib/calls.ts. */
    private static final long RING_MS = 45_000;

    /** A call the app was opened for before the website was listening (CallsPlugin.takePending). */
    public static String pendingCallId;
    public static String pendingAction;

    private IncomingCalls() {}

    public static int notificationId(String callId) {
        return ("call:" + callId).hashCode();
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, context.getString(R.string.calls_channel), NotificationManager.IMPORTANCE_HIGH);
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 800, 600, 800, 600 });
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    static PendingIntent openApp(Context context, String callId, String action, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_ACTION, action);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void show(Context context, Map<String, String> data) {
        String callId = data.get("callId");
        if (callId == null) return;
        String name = data.get("name");
        if (name == null || name.isEmpty()) name = "ouiKnow";
        ensureChannel(context);
        int id = notificationId(callId);

        Intent decline = new Intent(context, CallActionReceiver.class)
            .setAction(CallActionReceiver.DECLINE)
            .putExtra(EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_TOKEN, data.get("actionToken"));
        PendingIntent declineIntent = PendingIntent.getBroadcast(context, id, decline, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Person caller = new Person.Builder().setName(name).setImportant(true).build();
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(name)
            .setContentText(context.getString(R.string.calls_incoming))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(RING_MS)
            .setContentIntent(openApp(context, callId, "ring", id + 1))
            .setFullScreenIntent(openApp(context, callId, "ring", id + 2), true)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, openApp(context, callId, "answer", id + 3)));

        Notification notification = builder.build();
        // Rings until it's answered or goes away, like a phone call.
        notification.flags |= Notification.FLAG_INSISTENT;
        try {
            context.getSystemService(NotificationManager.class).notify(id, notification);
            // It's ringing here: the caller's screen says "Ringing…".
            CallActionReceiver.tellServer(callId, data.get("actionToken"), "reached", null);
        } catch (SecurityException e) {
            // Notifications turned off for the app: nothing to ring with.
        }
    }

    public static void cancel(Context context, String callId) {
        if (callId == null) return;
        context.getSystemService(NotificationManager.class).cancel(notificationId(callId));
    }
}
