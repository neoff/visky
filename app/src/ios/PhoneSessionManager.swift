import WatchConnectivity

@objcMembers
class PhoneSessionManager: NSObject, WCSessionDelegate {
  static let shared = PhoneSessionManager()

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func session(_ session: WCSession,
               activationDidCompleteWith activationState: WCSessionActivationState,
               error: Error?) {
    print("WCSession activated: \(activationState.rawValue)")
    if let error = error {
                print("Activation error: \(error.localizedDescription)")
            }
  }
  
  func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
          print("Received message from watch: \(message)")
      }
  
  @objc
  @available(watchOS 2.0, *)
  func sessionDidBecomeInactive(_ session: WCSession) {
    print("watchOS: Session did become inactive")
  }
  
  @objc
  @available(watchOS 2.0, *)
  func sessionDidDeactivate(_ session: WCSession) {
    print("watchOS: Session did deactivate")
    WCSession.default.activate()
  }
  
  func send(message: [String: Any]) {
      if WCSession.default.isReachable {
        WCSession.default.sendMessage(message, replyHandler: nil, errorHandler: nil)
      }
    }
}
