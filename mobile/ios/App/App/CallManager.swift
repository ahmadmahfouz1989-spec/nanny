import AVFoundation
import CallKit
import PushKit
import UIKit

/// Calls ringing like phone calls (iOS 1.5). The server sends a PushKit
/// (VoIP) push when someone calls (src/lib/calls.ts); iOS wakes the app,
/// and this shows the phone's own incoming-call screen through CallKit,
/// on the lock screen too. Answer and Decline there reach the website
/// through CallsPlugin; the audio itself is the website's WebRTC call
/// (src/components/calls/call-provider.tsx).
///
/// Apple's rule: every VoIP push must report a call to CallKit, or iOS
/// ends the app and eventually stops delivering them. So "cancel" pushes
/// (the caller hung up, or another phone answered) report too, then end.
final class CallManager: NSObject {
    static let shared = CallManager()

    /// How long a call rings, as RING_SECONDS in src/lib/calls.ts.
    private static let ringSeconds: TimeInterval = 45
    private static let site = "https://oui-know.com"

    private struct Ringing {
        let callId: String
        let actionToken: String
        var answered: Bool
        var timer: Timer?
    }

    private let provider: CXProvider
    private let controller = CXCallController()
    private var registry: PKPushRegistry?
    private var calls: [UUID: Ringing] = [:]

    private(set) var voipToken: String?
    /// Answered before the website was listening; it asks with takePending.
    var pending: (callId: String, action: String)?
    weak var plugin: CallsPlugin?

    private override init() {
        let config = CXProviderConfiguration()
        config.supportsVideo = false
        config.maximumCallGroups = 1
        config.maximumCallsPerCallGroup = 1
        config.supportedHandleTypes = [.generic]
        config.includesCallsInRecents = false
        if let icon = UIImage(named: "CallKitIcon") { config.iconTemplateImageData = icon.pngData() }
        provider = CXProvider(configuration: config)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    /// From AppDelegate at launch: PushKit must be set up before a push can arrive.
    func start() {
        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        self.registry = registry
    }

    // MARK: - Called by the website (CallsPlugin)

    /// Answers through CallKit, so iOS treats it as a phone call. False when CallKit doesn't know it.
    func answer(callId: String) -> Bool {
        guard let uuid = UUID(uuidString: callId), let call = calls[uuid], !call.answered else { return false }
        controller.request(CXTransaction(action: CXAnswerCallAction(call: uuid))) { error in
            if let error = error { NSLog("[calls] answer request failed: \(error)") }
        }
        return true
    }

    /// The website ended the call (or it ended on the other side): CallKit's screen goes.
    func ended(callId: String) {
        if pending?.callId == callId { pending = nil }
        guard let uuid = UUID(uuidString: callId), let call = calls.removeValue(forKey: uuid) else { return }
        call.timer?.invalidate()
        provider.reportCall(with: uuid, endedAt: Date(), reason: call.answered ? .remoteEnded : .unanswered)
    }

    // MARK: - Helpers

    private func update(name: String) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: name)
        update.localizedCallerName = name
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = false
        return update
    }

    /// Decline or hang up on the server, for when the website isn't running.
    private func tellServer(callId: String, token: String, action: String) {
        guard let url = URL(string: "\(CallManager.site)/api/calls/\(callId)/native") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token, "action": action])
        var task: UIBackgroundTaskIdentifier = .invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error = error { NSLog("[calls] \(action) failed: \(error)") }
            UIApplication.shared.endBackgroundTask(task)
        }.resume()
    }
}

// MARK: - PushKit

extension CallManager: PKPushRegistryDelegate {
    func pushRegistry(_ registry: PKPushRegistry, didUpdate credentials: PKPushCredentials, for type: PKPushType) {
        let token = credentials.token.map { String(format: "%02x", $0) }.joined()
        voipToken = token
        plugin?.voipTokenChanged(token)
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        voipToken = nil
    }

    func pushRegistry(_ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType, completion: @escaping () -> Void) {
        let data = payload.dictionaryPayload
        let kind = data["kind"] as? String ?? ""
        let callId = data["callId"] as? String ?? ""
        let uuid = UUID(uuidString: callId) ?? UUID()
        let name = (data["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "ouiKnow"

        if kind == "incoming", calls[uuid] == nil {
            let token = data["actionToken"] as? String ?? ""
            provider.reportNewIncomingCall(with: uuid, update: update(name: name)) { [weak self] error in
                defer { completion() }
                guard let self = self, error == nil else { return }
                let timer = Timer.scheduledTimer(withTimeInterval: CallManager.ringSeconds, repeats: false) { [weak self] _ in
                    guard let self = self, let call = self.calls[uuid], !call.answered else { return }
                    self.calls.removeValue(forKey: uuid)
                    self.provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
                }
                self.calls[uuid] = Ringing(callId: callId, actionToken: token, answered: false, timer: timer)
                // It's ringing here: the caller's screen says "Ringing…".
                self.tellServer(callId: callId, token: token, action: "reached")
            }
            return
        }

        // A cancel, or a repeat: iOS still requires a report. For a call it
        // already has, this one fails harmlessly; otherwise it's ended at once.
        let known = calls[uuid]
        provider.reportNewIncomingCall(with: uuid, update: update(name: name)) { [weak self] error in
            defer { completion() }
            guard let self = self else { return }
            if error == nil {
                self.provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
                return
            }
            // The phone that answered keeps its call.
            guard kind == "cancel", let call = known, !call.answered else { return }
            call.timer?.invalidate()
            self.calls.removeValue(forKey: uuid)
            let reason: CXCallEndedReason = (data["reason"] as? String) == "answered" ? .answeredElsewhere
                : (data["reason"] as? String) == "declined" ? .declinedElsewhere : .remoteEnded
            self.provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
            self.plugin?.callEnded(callId: call.callId)
        }
    }
}

// MARK: - CallKit

extension CallManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        calls.values.forEach { $0.timer?.invalidate() }
        calls.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        guard var call = calls[action.callUUID] else { return action.fail() }
        call.timer?.invalidate()
        call.timer = nil
        call.answered = true
        calls[action.callUUID] = call
        // The website's WebRTC audio, with the phone's voice processing.
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        if !(plugin?.callAnswered(callId: call.callId) ?? false) {
            pending = (call.callId, "answer")
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        if let call = calls.removeValue(forKey: action.callUUID) {
            call.timer?.invalidate()
            if pending?.callId == call.callId { pending = nil }
            tellServer(callId: call.callId, token: call.actionToken, action: call.answered ? "end" : "decline")
            plugin?.callEnded(callId: call.callId)
        }
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        // Muting is the website's own button; CallKit's is accepted but does nothing yet.
        action.fulfill()
    }
}
