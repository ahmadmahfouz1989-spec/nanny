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
- **Sign in with Apple** (iPhone only), Apple's native sheet, through
  `@capacitor-community/apple-sign-in`. Apple requires it in an app that
  offers Google sign-in. The page sends Apple's token to `/auth/apple`,
  which signs in with Supabase (`signInWithIdToken`).
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

Authentication → Sign In / Providers → **Apple**: turn it on and put
`com.ouiknow.app` in **Client IDs**. That's all native sign-in needs; the
OAuth secret fields are only for Sign in with Apple on a website, which
we don't offer. Until it's on, the Apple button shows a "Something went
wrong" error.

### iOS

Published under Aya Al atat's Apple Developer account (Individual
membership, team `74NH8J42VR`). On an Individual membership only the
Account Holder can sign in Xcode, so builds are signed **manually** with a
distribution certificate created through the App Store Connect API (an
Admin's API key), and uploaded from the command line. Debug builds in
Xcode stay on automatic signing.

1. Apple Developer → Keys → new key with **Apple Push Notifications service
   (APNs)** → download the `.p8` (you can only download it once).
2. Railway env vars:
   - `APNS_KEY`: the `.p8` file's contents (line breaks may be written `\n`)
   - `APNS_KEY_ID`: the key's ID
   - `APNS_TEAM_ID`: `74NH8J42VR`
   - `APNS_SANDBOX=1`: **only** while testing builds run straight from
     Xcode. Never for TestFlight and App Store builds.

#### TestFlight uploads

```sh
cd mobile
ASC_KEY_ID=MKS573L36P ASC_ISSUER_ID=fb53c104-164f-4d43-813c-0d65167559d8 npm run testflight
```

Archives a Release build (version from `MARKETING_VERSION` in the Xcode
project, build number = UTC timestamp), signs it and uploads it. It needs,
on the Mac running it:

- `~/.appstoreconnect/private_keys/AuthKey_MKS573L36P.p8`: App Store
  Connect API key (Users and Access → Integrations, Admin access).
- `~/Library/Keychains/ouiknow-signing.keychain-db` holding the
  **Apple Distribution: Aya Al atat** certificate, and its password in
  `~/.appstoreconnect/signing/keychain-password` (the certificate's private
  key is also kept in `~/.appstoreconnect/signing/dist-key.pem`).
- The **ouiKnow App Store** provisioning profile, installed in
  `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`.

The App ID has the **Sign in with Apple** capability (added 2026-10-24, which
is why the profile was regenerated that day). Adding another capability
means regenerating the profile again.

Release builds use `App/App.Release.entitlements` (`aps-environment`
production); Debug uses `App/App.entitlements` (development).

**Yearly renewal**: the certificate and profile expire on 2027-10-19.
Before then: create a new DISTRIBUTION certificate from a fresh CSR via the
API, import it into the signing keychain, regenerate the "ouiKnow App
Store" profile with it, and install the profile. Builds already uploaded
keep working after expiry; only new uploads need the renewed ones.

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

## Privacy manifest

`ios/App/App/PrivacyInfo.xcprivacy` declares no tracking (the Meta Pixel
never loads in the app) and the data the service collects, all linked to
the account and used only to run it: email, phone, name, photos (profile,
work, ID documents), voice notes, other user content (profiles, posts,
messages), user ID, device ID (push token), coarse location (the area you
pick, and a sign-in's approximate place from its IP) and health (optional
nursing notes). Keep it in step with `/privacy` (`src/lib/legal.ts`) and
the App Privacy answers in App Store Connect.

**No XML comments in it.** Apple's upload check rejected build
202610250012 with ITMS-91056 (invalid privacy manifest) while the file had
`<!-- -->` comments, though every key and value was valid.

## Store review notes

Apple rejects apps that are "just a website" (guideline 4.2). Mention in
the review notes: native push notifications for new messages and matches,
camera and microphone for profile photos and voice messages, and Google
sign-in through the system browser. Give the reviewer a test account that
has an approved profile, so they can see matches and messaging.
