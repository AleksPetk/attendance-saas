import AuthenticationServices
import Foundation
import AppKit
import StoreKit
import ObjectiveC

/// In-process MAS Apple Sign-In + StoreKit 2 core (runs inside Electron main).
/// Apple identity is the host app: app.checkstation.client

struct BridgeRequest: Decodable {
  let cmd: String
  let hashedNonce: String?
  let productIds: [String]?
  let productId: String?
  let appAccountToken: String?
}

enum BridgeCore {
  static func handle(_ jsonLine: String, completion: @escaping (String) -> Void) {
    guard let data = jsonLine.data(using: .utf8) else {
      completion(encode(["ok": false, "code": "invalid_request", "message": "Invalid UTF-8 request."]))
      return
    }
    let request: BridgeRequest
    do {
      request = try JSONDecoder().decode(BridgeRequest.self, from: data)
    } catch {
      completion(encode(["ok": false, "code": "invalid_request", "message": "Could not parse JSON request."]))
      return
    }

    switch request.cmd {
    case "appleSignIn":
      guard let hashed = request.hashedNonce, !hashed.isEmpty else {
        completion(encode(["ok": false, "code": "invalid_request", "message": "hashedNonce is required."]))
        return
      }
      AppleSignInRunner.run(hashedNonce: hashed) { payload in
        completion(encode(payload))
      }

    case "products":
      let ids = request.productIds ?? []
      Task {
        completion(encode(await StoreKitRunner.products(ids: ids)))
      }

    case "purchase":
      guard let productId = request.productId, !productId.isEmpty else {
        completion(encode(["ok": false, "code": "invalid_request", "message": "productId is required."]))
        return
      }
      Task {
        completion(encode(await StoreKitRunner.purchase(
          productId: productId,
          appAccountToken: request.appAccountToken
        )))
      }

    case "restore":
      Task {
        completion(encode(await StoreKitRunner.restore()))
      }

    case "manage":
      // Prefer host JS shell.openExternal; still supported for parity.
      Task {
        completion(encode(await StoreKitRunner.manage()))
      }

    default:
      completion(encode(["ok": false, "code": "unknown_command", "message": "Unknown cmd \(request.cmd)."]))
    }
  }

  static func encode(_ object: [String: Any]) -> String {
    guard JSONSerialization.isValidJSONObject(object),
          let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8)
    else {
      return #"{"ok":false,"code":"encode_error","message":"Could not encode response."}"#
    }
    return line
  }
}

// MARK: - Apple Sign In

final class AppleSignInRunner: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private let hashedNonce: String
  private let completion: ([String: Any]) -> Void
  private var window: NSWindow?

  private init(hashedNonce: String, completion: @escaping ([String: Any]) -> Void) {
    self.hashedNonce = hashedNonce
    self.completion = completion
  }

  static func run(hashedNonce: String, completion: @escaping ([String: Any]) -> Void) {
    let work = {
      let runner = AppleSignInRunner(hashedNonce: hashedNonce, completion: completion)
      objc_setAssociatedObject(NSApp, "cs.apple.signin", runner, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)

      // Electron may leave NSApp.applicationIconImage unset even when CFBundleIconFile
      // is correct. ASAuthorization reads the process icon for the native sheet.
      ensureHostAppIconImage()

      let provider = ASAuthorizationAppleIDProvider()
      let request = provider.createRequest()
      request.requestedScopes = [.fullName, .email]
      request.nonce = hashedNonce

      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = runner
      controller.presentationContextProvider = runner
      NSApp.activate(ignoringOtherApps: true)
      controller.performRequests()
    }
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }

  /// Prefer the host CheckStation.app icon so the SIWA sheet matches Finder/Dock.
  private static func ensureHostAppIconImage() {
    let hostIcon = NSWorkspace.shared.icon(forFile: Bundle.main.bundlePath)
    if hostIcon.size.width > 0, hostIcon.size.height > 0 {
      NSApp.applicationIconImage = hostIcon
    }
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // Prefer a real CheckStation window so the sheet is owned by app.checkstation.client.
    if let key = NSApp.keyWindow, key.styleMask.contains(.titled) { return key }
    if let main = NSApp.mainWindow, main.styleMask.contains(.titled) { return main }
    if let visible = NSApp.windows.first(where: { $0.isVisible && $0.styleMask.contains(.titled) }) {
      return visible
    }
    if let any = NSApp.windows.first(where: { $0.styleMask.contains(.titled) }) {
      return any
    }
    if let key = NSApp.keyWindow { return key }
    if let main = NSApp.mainWindow { return main }
    if let first = NSApp.windows.first { return first }
    if let window {
      return window
    }
    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1, height: 1),
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )
    window.isReleasedWhenClosed = false
    window.alphaValue = 0
    window.orderFrontRegardless()
    self.window = window
    return window
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    defer { cleanup() }
    guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
          let tokenData = credential.identityToken,
          let identityToken = String(data: tokenData, encoding: .utf8),
          !identityToken.isEmpty
    else {
      completion(["ok": false, "code": "missing_token", "message": "Apple did not return an identity token."])
      return
    }
    var fullName: [String: Any] = [:]
    if let given = credential.fullName?.givenName {
      fullName["givenName"] = given
    }
    if let family = credential.fullName?.familyName {
      fullName["familyName"] = family
    }
    var payload: [String: Any] = [
      "ok": true,
      "identityToken": identityToken,
    ]
    if !fullName.isEmpty {
      payload["fullName"] = fullName
    }
    if let email = credential.email {
      payload["email"] = email
    }
    completion(payload)
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    defer { cleanup() }
    let ns = error as NSError
    if ns.code == ASAuthorizationError.canceled.rawValue {
      completion(["ok": false, "code": "cancelled", "message": "Apple sign-in was cancelled."])
      return
    }
    completion([
      "ok": false,
      "code": "error",
      "message": error.localizedDescription,
    ])
  }

  private func cleanup() {
    window?.orderOut(nil)
    window = nil
    objc_setAssociatedObject(NSApp, "cs.apple.signin", nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
  }
}

// MARK: - StoreKit 2

enum StoreKitRunner {
  static let knownProductIds: Set<String> = [
    "app.checkstation.plus.monthly",
    "app.checkstation.plus.yearly",
    "app.checkstation.business.monthly",
    "app.checkstation.business.yearly",
  ]

  static func products(ids: [String]) async -> [String: Any] {
    let requested = ids.isEmpty ? Array(knownProductIds) : ids
    do {
      let products = try await Product.products(for: requested)
      let byId = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
      var ordered: [[String: Any]] = []
      for id in requested {
        guard let product = byId[id] else { continue }
        ordered.append([
          "productId": product.id,
          "displayPrice": product.displayPrice,
          "title": product.displayName,
          "description": product.description,
        ])
      }
      return ["ok": true, "products": ordered]
    } catch {
      return [
        "ok": false,
        "code": mapStoreError(error),
        "message": error.localizedDescription,
      ]
    }
  }

  static func purchase(productId: String, appAccountToken: String?) async -> [String: Any] {
    do {
      let products = try await Product.products(for: [productId])
      guard let product = products.first else {
        return ["ok": false, "code": "product_unavailable", "message": "Product not found in App Store."]
      }
      var options: Set<Product.PurchaseOption> = []
      if let token = appAccountToken, let uuid = UUID(uuidString: token) {
        options.insert(.appAccountToken(uuid))
      }
      let result = try await product.purchase(options: options)
      switch result {
      case .success(let verification):
        let transaction = try checkVerified(verification)
        let jws = verification.jwsRepresentation
        await transaction.finish()
        return [
          "ok": true,
          "productId": transaction.productID,
          "signedTransaction": jws,
          "transactionId": String(transaction.id),
          "originalTransactionId": String(transaction.originalID),
        ]
      case .userCancelled:
        return ["ok": false, "code": "cancelled", "message": "Purchase was cancelled."]
      case .pending:
        return ["ok": false, "code": "pending", "message": "Purchase is pending approval."]
      @unknown default:
        return ["ok": false, "code": "error", "message": "Unknown purchase result."]
      }
    } catch {
      return [
        "ok": false,
        "code": mapStoreError(error),
        "message": error.localizedDescription,
      ]
    }
  }

  static func restore() async -> [String: Any] {
    do {
      try await AppStore.sync()
      var rows: [[String: Any]] = []
      for await result in Transaction.currentEntitlements {
        guard case .verified(let transaction) = result else { continue }
        guard knownProductIds.contains(transaction.productID) else { continue }
        let signed = result.jwsRepresentation
        guard !signed.isEmpty else { continue }
        rows.append([
          "productId": transaction.productID,
          "signedTransaction": signed,
          "transactionId": String(transaction.id),
          "originalTransactionId": String(transaction.originalID),
        ])
        await transaction.finish()
      }
      return ["ok": true, "transactions": rows]
    } catch {
      return [
        "ok": false,
        "code": mapStoreError(error),
        "message": error.localizedDescription,
      ]
    }
  }

  static func manage() async -> [String: Any] {
    if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
      let ok = await MainActor.run { NSWorkspace.shared.open(url) }
      if ok {
        return ["ok": true, "opened": true, "mode": "url"]
      }
    }
    return ["ok": false, "code": "unavailable", "message": "Could not open Apple subscription management."]
  }

  private static func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
    switch result {
    case .unverified(_, let error):
      throw error
    case .verified(let safe):
      return safe
    }
  }

  private static func mapStoreError(_ error: Error) -> String {
    let message = error.localizedDescription.lowercased()
    if message.contains("cancel") {
      return "cancelled"
    }
    if message.contains("not available") || message.contains("permission") || message.contains("entitlement") {
      return "signing_required"
    }
    return "error"
  }
}
