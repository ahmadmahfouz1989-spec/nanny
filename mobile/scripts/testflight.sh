#!/usr/bin/env bash
# Builds the iOS app and uploads it to TestFlight.
#
#   ASC_KEY_ID=... ASC_ISSUER_ID=... npm run testflight
#
# Needs, on this Mac (see README.md, "TestFlight uploads"):
#   ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8   App Store Connect API key
#   ~/Library/Keychains/ouiknow-signing.keychain-db          Apple Distribution certificate
#   ~/.appstoreconnect/signing/keychain-password             that keychain's password
#   the "ouiKnow App Store" provisioning profile, installed
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ASC_KEY_ID:?set ASC_KEY_ID}"
: "${ASC_ISSUER_ID:?set ASC_ISSUER_ID}"
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
KEYCHAIN="$HOME/Library/Keychains/ouiknow-signing.keychain-db"
OUT="$(mktemp -d)"
# Every upload needs a higher build number; a timestamp always is.
BUILD="${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}"

security unlock-keychain -p "$(cat "$HOME/.appstoreconnect/signing/keychain-password")" "$KEYCHAIN"
npx cap sync ios

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/ouiKnow.xcarchive" \
  CURRENT_PROJECT_VERSION="$BUILD" OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" archive

xcodebuild -exportArchive -archivePath "$OUT/ouiKnow.xcarchive" \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath "$OUT/export" \
  -authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID"

echo "Uploaded build $BUILD. It appears in App Store Connect > TestFlight after processing (10-30 min)."
