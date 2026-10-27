#!/usr/bin/env bash
# Builds the signed Android App Bundle (.aab) to upload to Google Play.
#
#   npm run playbundle
#
# Needs, on this Mac (see README.md, "Google Play uploads"):
#   JDK 21 (brew install openjdk@21) and the Android SDK (ANDROID_HOME)
#   ~/.ouiknow-android/keystore.properties and the upload key it points to
#   android/app/google-services.json (Firebase, for push)
set -euo pipefail
cd "$(dirname "$0")/.."

# Always JDK 21: a JAVA_HOME from the shell may point at an older Java the
# Android build refuses.
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
[ -f "$HOME/.ouiknow-android/keystore.properties" ] || { echo "missing ~/.ouiknow-android/keystore.properties"; exit 1; }
[ -f android/app/google-services.json ] || { echo "missing android/app/google-services.json (push won't work)"; exit 1; }

# Every upload needs a higher versionCode: year, day of year and hour (UTC)
# always is, and stays far below Play's 2100000000 limit.
CODE="${VERSION_CODE:-$(date -u +%y%j%H)}"

npx cap sync android
(cd android && ./gradlew --quiet bundleRelease -PouiknowVersionCode="$CODE")
OUT=android/app/build/outputs/bundle/release/app-release.aab
echo "Built $OUT (versionCode $CODE). Upload it in Play Console > Test and release."
