// Adds the push's picture (the server's imageUrl) to the notification before iOS shows it; anything that fails shows the plain notification instead.
import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    content = request.content.mutableCopy() as? UNMutableNotificationContent
    guard let content else { contentHandler(request.content); return }
    // The server puts the picture's address in the push data (expo-notifications reads data from "body").
    let data = (request.content.userInfo["body"] as? [String: Any]) ?? request.content.userInfo as? [String: Any] ?? [:]
    guard let link = data["imageUrl"] as? String, let url = URL(string: link), url.scheme == "https" else { contentHandler(content); return }

    URLSession.shared.downloadTask(with: url) { file, response, _ in
      defer { contentHandler(content) }
      guard let file, (response as? HTTPURLResponse)?.statusCode == 200 else { return }
      let kept = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString).appendingPathExtension(url.pathExtension.isEmpty ? "jpg" : url.pathExtension)
      guard (try? FileManager.default.moveItem(at: file, to: kept)) != nil,
            let attachment = try? UNNotificationAttachment(identifier: "picture", url: kept) else { return }
      content.attachments = [attachment]
    }.resume()
  }

  // iOS is about to give up on us: show what we have.
  override func serviceExtensionTimeWillExpire() {
    if let handler, let content { handler(content) }
  }
}
