/**
 * Android App Links: lets the Android app open invite links
 * (oui-know.com/r/CODE) itself. Android checks the app was signed by one of
 * these keys: Google Play's app signing key (installs from the Play Store)
 * and the upload key (builds installed by hand).
 */
const FINGERPRINTS = [
  // Upload key (~/.ouiknow-android/upload.jks)
  "F3:DA:93:DC:87:DF:51:C7:00:EC:0D:01:53:D3:28:3F:FD:68:26:CF:B3:58:7B:C8:9A:92:11:45:0C:94:8C:CF",
];

export function GET() {
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.ouiknow.app", sha256_cert_fingerprints: FINGERPRINTS },
    },
  ]);
}
