import type { CapacitorConfig } from "@capacitor/cli";

// The apps are a native shell around the live site: every deploy of the
// web app reaches them without a store release. www/ is only the screen
// shown when the site can't be reached.
const config: CapacitorConfig = {
  appId: "com.ouiknow.app",
  appName: "ouiKnow",
  webDir: "www",
  server: {
    url: "https://oui-know.com",
    // Pages on these hosts stay inside the app; any other link (WhatsApp,
    // Instagram, Google sign-in) opens outside it.
    allowNavigation: ["oui-know.com", "www.oui-know.com"],
    errorPath: "index.html",
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: "#fbf8f4",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
