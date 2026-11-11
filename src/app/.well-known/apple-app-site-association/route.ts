/**
 * Universal Links: lets the iPhone app open invite links (oui-know.com/r/CODE)
 * itself when it's installed. Apple reads this file when the app is installed
 * or updated. Only the bare domain: www redirects, and Apple doesn't follow.
 */
const TEAM_APP_ID = "74NH8J42VR.com.ouiknow.app";

export function GET() {
  return Response.json({
    applinks: {
      details: [{ appIDs: [TEAM_APP_ID], components: [{ "/": "/r/*" }, { "/": "/en/r/*" }, { "/": "/ar/r/*" }] }],
    },
  });
}
