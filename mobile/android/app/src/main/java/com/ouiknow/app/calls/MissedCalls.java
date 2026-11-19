package com.ouiknow.app.calls;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.ouiknow.app.MainActivity;
import com.ouiknow.app.R;
import java.util.Map;

/**
 * A missed call (1.6): the server sends it as data (src/lib/calls.ts,
 * pushMissedCall), and this shows it with Call back and Message buttons.
 * Each opens the app, which starts the call or the chat
 * (CallsPlugin "open", src/components/calls/call-provider.tsx).
 */
public final class MissedCalls {
    public static final String CHANNEL = "missed_calls";
    public static final String EXTRA_OPEN = "ouiOpen";
    public static final String EXTRA_MATCH_ID = "ouiMatchId";
    public static final String EXTRA_NAME = "ouiName";

    private MissedCalls() {}

    /** One missed-call notification per conversation: a second missed call replaces it. */
    public static int notificationId(String matchId) {
        return ("missed:" + matchId).hashCode();
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL) != null) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, context.getString(R.string.calls_missed_channel), NotificationManager.IMPORTANCE_HIGH));
    }

    private static PendingIntent open(Context context, String action, String matchId, String name, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_OPEN, action)
            .putExtra(EXTRA_MATCH_ID, matchId)
            .putExtra(EXTRA_NAME, name);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String or(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }

    public static void show(Context context, Map<String, String> data) {
        String matchId = data.get("matchId");
        if (matchId == null) return;
        // The ringing (if it's still up) gives way to the missed call.
        IncomingCalls.cancel(context, data.get("callId"));
        ensureChannel(context);
        String name = or(data.get("name"), "");
        int id = notificationId(matchId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(or(data.get("title"), or(name, context.getString(R.string.app_name))))
            .setContentText(or(data.get("body"), context.getString(R.string.calls_missed)))
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(open(context, "calls", matchId, name, id))
            .addAction(0, or(data.get("callBack"), context.getString(R.string.calls_call_back)), open(context, "callback", matchId, name, id + 1))
            .addAction(0, or(data.get("message"), context.getString(R.string.calls_message)), open(context, "message", matchId, name, id + 2));
        try {
            context.getSystemService(NotificationManager.class).notify(id, builder.build());
        } catch (SecurityException e) {
            // Notifications turned off for the app.
        }
    }

    public static void cancel(Context context, String matchId) {
        if (matchId == null) return;
        context.getSystemService(NotificationManager.class).cancel(notificationId(matchId));
    }
}
