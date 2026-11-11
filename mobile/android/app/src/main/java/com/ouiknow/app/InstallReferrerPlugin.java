package com.ouiknow.app;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Google Play's install referrer: the `referrer` an invite link put on the
 * Play Store address (ref=CODE), handed to the app after it's installed.
 * Resolves { referrer: string | null }; never rejects.
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void get(final PluginCall call) {
        final InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        try {
            client.startConnection(new InstallReferrerStateListener() {
                private boolean done = false;

                @Override
                public void onInstallReferrerSetupFinished(int responseCode) {
                    if (done) return;
                    done = true;
                    JSObject result = new JSObject();
                    try {
                        if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                            ReferrerDetails details = client.getInstallReferrer();
                            result.put("referrer", details.getInstallReferrer());
                        } else {
                            result.put("referrer", null);
                        }
                    } catch (Exception e) {
                        result.put("referrer", null);
                    }
                    try {
                        client.endConnection();
                    } catch (Exception ignored) {}
                    call.resolve(result);
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    if (done) return;
                    done = true;
                    JSObject result = new JSObject();
                    result.put("referrer", null);
                    call.resolve(result);
                }
            });
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("referrer", null);
            call.resolve(result);
        }
    }
}
