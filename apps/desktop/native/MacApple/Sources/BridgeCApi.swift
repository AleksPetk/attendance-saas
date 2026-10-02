import Foundation

/// C ABI for the Electron N-API addon (in-process; host identity app.checkstation.client).

public typealias CSMacAppleInvokeCallback = @convention(c) (
  UnsafeMutableRawPointer?,
  UnsafePointer<CChar>?
) -> Void

@_cdecl("cs_mac_apple_invoke")
public func cs_mac_apple_invoke(
  _ requestJson: UnsafePointer<CChar>?,
  _ context: UnsafeMutableRawPointer?,
  _ callback: CSMacAppleInvokeCallback?
) {
  guard let callback else { return }
  guard let requestJson else {
    #"{"ok":false,"code":"invalid_request","message":"Missing request."}"#.withCString { callback(context, $0) }
    return
  }
  let request = String(cString: requestJson)
  BridgeCore.handle(request) { response in
    response.withCString { ptr in
      callback(context, ptr)
    }
  }
}

@_cdecl("cs_mac_apple_ping")
public func cs_mac_apple_ping() -> Int32 {
  1
}
