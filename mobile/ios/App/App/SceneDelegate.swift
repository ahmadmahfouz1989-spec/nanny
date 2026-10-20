import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AppViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// The app's web view. The swipe from the edge goes back a page, like any
/// other app (there's no browser back button here) -- except on the main
/// tab screens, where, as on X, the same swipe opens the menu instead.
class AppViewController: CAPBridgeViewController {
    private var urlObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        // url updates on the site's own page changes too, not just full loads.
        urlObservation = webView?.observe(\.url, options: [.initial, .new]) { webView, _ in
            webView.allowsBackForwardNavigationGestures = !AppViewController.isTabRoot(webView.url)
        }
    }

    /// The tab screens; the same list as TAB_ROOTS in src/components/shell/drawer-swipe.ts.
    private static let tabRoot = try! NSRegularExpression(
        pattern: "^(/[a-z]{2})?/(feed|notifications|messages|dashboard|categories/[^/]+/dashboard)/?$"
    )

    static func isTabRoot(_ url: URL?) -> Bool {
        guard let path = url?.path else { return false }
        return tabRoot.firstMatch(in: path, range: NSRange(path.startIndex..., in: path)) != nil
    }
}
