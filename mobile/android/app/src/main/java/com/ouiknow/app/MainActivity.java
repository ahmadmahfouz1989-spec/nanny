package com.ouiknow.app;

import android.app.KeyguardManager;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.ouiknow.app.calls.CallsPlugin;
import com.ouiknow.app.calls.IncomingCalls;
import com.ouiknow.app.calls.MissedCalls;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, registered before the bridge starts.
        registerPlugin(InstallReferrerPlugin.class);
        registerPlugin(CallsPlugin.class);
        super.onCreate(savedInstanceState);
        handleCall(getIntent());
        handleMissedCall(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCall(intent);
        handleMissedCall(intent);
    }

    /** Opened from a missed-call notification: the Calls tab, Call back or Message. */
    private void handleMissedCall(Intent intent) {
        String action = intent == null ? null : intent.getStringExtra(MissedCalls.EXTRA_OPEN);
        if (action == null) return;
        String matchId = intent.getStringExtra(MissedCalls.EXTRA_MATCH_ID);
        intent.removeExtra(MissedCalls.EXTRA_OPEN);
        MissedCalls.cancel(this, matchId);
        CallsPlugin.deliverOpen(action, matchId, intent.getStringExtra(MissedCalls.EXTRA_NAME));
    }

    /** Opened from an incoming call (ringing, or Answer): show over the lock screen. */
    private void handleCall(Intent intent) {
        String callId = intent == null ? null : intent.getStringExtra(IncomingCalls.EXTRA_CALL_ID);
        if (callId == null || callId.isEmpty()) return;
        String action = intent.getStringExtra(IncomingCalls.EXTRA_ACTION);
        intent.removeExtra(IncomingCalls.EXTRA_CALL_ID);
        if ("open".equals(action)) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        if ("answer".equals(action)) {
            IncomingCalls.cancel(this, callId);
            // Answered: unlock to the call (the phone asks for the PIN if there is one).
            KeyguardManager keyguard = getSystemService(KeyguardManager.class);
            if (keyguard != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) keyguard.requestDismissKeyguard(this, null);
        }
        CallsPlugin.deliver(callId, action);
    }

    /** The call is over: back to an ordinary app that stays behind the lock screen. */
    public void leaveCallMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
    }
}
