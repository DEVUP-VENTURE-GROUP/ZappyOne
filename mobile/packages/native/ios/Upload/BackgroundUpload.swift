// A job photo that could not upload on a weak signal is handed to iOS: a background URLSession sends it when the internet is back, even with the app closed (the Android twin is UploadWorker.kt).
import Foundation

final class BackgroundUpload: NSObject, URLSessionTaskDelegate {
  static let shared = BackgroundUpload()
  private static let sessionId = "com.zappyone.upload"

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: Self.sessionId)
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  // The picked photo lives in a cache iOS may clear: it is copied somewhere that stays until the upload finishes.
  private func keep(_ source: URL, as id: String) throws -> URL {
    let dir = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("pending-uploads", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let dest = dir.appendingPathComponent(id).appendingPathExtension(source.pathExtension.isEmpty ? "jpg" : source.pathExtension)
    if FileManager.default.fileExists(atPath: dest.path) { try FileManager.default.removeItem(at: dest) }
    try FileManager.default.copyItem(at: source, to: dest)
    return dest
  }

  // Queues the PUT to the presigned URL; false when the file or URL is unusable, so JavaScript tells the pro.
  func enqueue(id: String, fileUri: String, url: String, contentType: String) -> Bool {
    guard let source = URL(string: fileUri), source.isFileURL, let target = URL(string: url) else { return false }
    do {
      let file = try keep(source, as: id)
      var request = URLRequest(url: target)
      request.httpMethod = "PUT"
      request.setValue(contentType, forHTTPHeaderField: "Content-Type")
      let task = session.uploadTask(with: request, fromFile: file)
      task.taskDescription = file.path
      task.resume()
      return true
    } catch {
      return false
    }
  }

  // Done (or given up by iOS): the kept copy is removed.
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let path = task.taskDescription { try? FileManager.default.removeItem(atPath: path) }
  }
}
