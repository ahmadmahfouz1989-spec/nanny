# ouiKnow iOS and Android apps

Native shells (Capacitor 8) around the live site, `https://oui-know.com`.
The apps load the site itself, so **every deploy of the web app reaches the
apps without a store release**. Only changes in this folder (icons, native
permissions, plugins) need a new build in the stores.

What the shell adds over the website:

- **Native push**: APNs on iPhone, FCM on Android. The site detects the app
  (`src/lib/native-app.ts`), registers the device, and the server sends to it
  (`src/lib/native-push.ts`, table `native_push_tokens`). The permission
  dialog appears on its own at first launch; no tap or home-screen step.
- **Google sign-in** opens in the system browser, because Google blocks
  embedded web views, and comes back through `ouiknow://auth/callback`.
- A notification tap opens its page, and an offline screen (`www/index.html`)
  shows when the site can't be reached.

App ID / bundle ID: `com.ouiknow.app`.

## Day to day

```sh
cd mobile
npm install
npx cap sync          # after changing capacitor.config.ts or plugins
npm run ios           # opens Xcode
npm run android       # opens Android Studio
npm run assets        # regenerate icons/splash from assets/*.png
```

## One-time setup

### Supabase (both apps)

Authentication → URL Configuration → Redirect URLs: add
`ouiknow://auth/callback`. Without it, Google sign-in in the apps lands on
the website instead of returning to the app.

### iOS

1. Apple Developer account ($99/year).
2. Open in Xcode (`npm run ios`) → App target → Signing & Capabilities:
   choose your team. Push Notifications is already set up in
   `App/App.entitlements`; if Xcode asks, add the **Push Notifications**
   capability.
3. Apple Developer → Keys → new key with **Apple Push Notifications service
   (APNs)** → download the `.p8` (you can only download it once).
4. Railway env vars:
   - `APNS_KEY`: the `.p8` file's contents (line breaks may be written `\n`)
   - `APNS_KEY_ID`: the key's ID
   - `APNS_TEAM_ID`: your team ID (top right of the developer portal)
   - `APNS_SANDBOX=1`: **only** while testing builds run straight from
     Xcode. Remove it for TestFlight and App Store builds.
5. Product → Archive → Distribute → App Store Connect → TestFlight, then submit.

### Android

1. Install Android Studio, then `npm run android` once so it downloads the SDK.
2. Firebase console → new project → add an Android app with package
   `com.ouiknow.app` → download `google-services.json` into
   `mobile/android/app/` (it's picked up automatically; push doesn't work
   without it).
3. Firebase → Project settings → Service accounts → Generate new private
   key → put the whole JSON into the Railway env var `FCM_SERVICE_ACCOUNT`.
4. Google Play Console ($25 once) → create the app → Build → Generate
   Signed Bundle (`.aab`) in Android Studio → upload to internal testing,
   then production.

## Store review notes

Apple rejects apps that are "just a website" (guideline 4.2). Mention in
the review notes: native push notifications for new messages and matches,
camera and microphone for profile photos and voice messages, and Google
sign-in through the system browser. Give the reviewer a test account that
has an approved profile, so they can see matches and messaging.
