import AuthenticationServices
import Capacitor
import UIKit

/// The website's side of calls on iPhone ("OuiCalls" in src/lib/native-app.ts):
/// CallKit through CallManager, and Apple's sign-in sheet for Google sign-in.
@objc(CallsPlugin)
public class CallsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallsPlugin"
    public let jsName = "OuiCalls"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getVoipToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "answer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "callActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "callEnded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    ]

    private var tokenWaiters: [CAPPluginCall] = []
    private var authSession: ASWebAuthenticationSession?

    override public func load() {
        CallManager.shared.plugin = self
    }

    // MARK: - From CallManager

    func voipTokenChanged(_ token: String) {
        tokenWaiters.forEach { $0.resolve(["token": token]) }
        tokenWaiters.removeAll()
        notifyListeners("voipToken", data: ["token": token])
    }

    /// True when the website heard it; otherwise CallManager keeps it pending.
    func callAnswered(callId: String) -> Bool {
        guard hasListeners("callAnswered") else { return false }
        notifyListeners("callAnswered", data: ["callId": callId])
        return true
    }

    func callEnded(callId: String) {
        notifyListeners("callEnded", data: ["callId": callId])
    }

    // MARK: - From the website

    @objc func getVoipToken(_ call: CAPPluginCall) {
        if let token = CallManager.shared.voipToken { return call.resolve(["token": token]) }
        // PushKit usually answers within a second of launch.
        tokenWaiters.append(call)
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            guard let self = self, let i = self.tokenWaiters.firstIndex(where: { $0 === call }) else { return }
            self.tokenWaiters.remove(at: i)
            call.resolve([:])
        }
    }

    @objc func takePending(_ call: CAPPluginCall) {
        guard let pending = CallManager.shared.pending else { return call.resolve([:]) }
        CallManager.shared.pending = nil
        call.resolve(["callId": pending.callId, "action": pending.action])
    }

    @objc func answer(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        DispatchQueue.main.async { call.resolve(["handled": CallManager.shared.answer(callId: callId)]) }
    }

    @objc func callActive(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func callEnded(_ call: CAPPluginCall) {
        let callId = call.getString("callId") ?? ""
        DispatchQueue.main.async {
            CallManager.shared.ended(callId: callId)
            call.resolve()
        }
    }

    /// Google sign-in in Apple's sign-in sheet, which returns to the app by
    /// itself -- the in-app browser's redirect to ouiknow:// can be refused.
    @objc func signIn(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), let scheme = call.getString("scheme") else {
            return call.reject("Missing url or scheme")
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.authSession = nil
                if let callback = callback {
                    call.resolve(["url": callback.absoluteString])
                } else {
                    call.reject("cancelled", nil, error)
                }
            }
            session.presentationContextProvider = self
            self.authSession = session
            if !session.start() {
                self.authSession = nil
                call.reject("Couldn't open the sign-in sheet")
            }
        }
    }
}

extension CallsPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
