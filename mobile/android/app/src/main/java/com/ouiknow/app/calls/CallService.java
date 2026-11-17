package com.ouiknow.app.calls;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.ouiknow.app.R;

/**
 * An ongoing call: keeps the app (and its microphone) running when the
 * screen locks or someone switches apps, with "ongoing call" in the
 * notifications to come back to it.
 */
public class CallService extends Service {
    private static final String CHANNEL = "calls_ongoing";
    private static final int NOTIFICATION_ID = 7001;
    static volatile String activeCallId;

    public static void start(Context context, String callId, String name) {
        activeCallId = callId;
        Intent intent = new Intent(context, CallService.class).putExtra("callId", callId).putExtra("name", name);
        try {
            androidx.core.content.ContextCompat.startForegroundService(context, intent);
        } catch (Exception ignored) {
            // Started from the background (not allowed): the call carries on while the app is open.
        }
    }

    public static void stop(Context context) {
        activeCallId = null;
        context.stopService(new Intent(context, CallService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String callId = intent != null ? intent.getStringExtra("callId") : null;
        String name = intent != null ? intent.getStringExtra("name") : null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager.getNotificationChannel(CHANNEL) == null) {
                manager.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.calls_ongoing_channel), NotificationManager.IMPORTANCE_LOW));
            }
        }
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(name == null || name.isEmpty() ? getString(R.string.app_name) : name)
            .setContentText(getString(R.string.calls_ongoing))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setContentIntent(IncomingCalls.openApp(this, callId == null ? "" : callId, "open", NOTIFICATION_ID))
            .build();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type);
        } catch (Exception e) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
