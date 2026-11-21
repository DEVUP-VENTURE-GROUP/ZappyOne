// "Show my ServicePro jobs" and "Open ServicePro": Siri, Spotlight and the Shortcuts app open ServicePro at the right screen through its link (zappyone-servicepro://).
import AppIntents
import Foundation

@available(iOS 18.0, *)
struct MyJobsIntent: AppIntent {
  static var title: LocalizedStringResource = "Show my jobs"
  static var description = IntentDescription("Open your ServicePro jobs: what is on now and what is next.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone-servicepro://worker/work")!))
  }
}

@available(iOS 18.0, *)
struct OpenHomeIntent: AppIntent {
  static var title: LocalizedStringResource = "Open ServicePro"
  static var description = IntentDescription("Open ServicePro's Home, where you go online for new jobs.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone-servicepro://worker")!))
  }
}

@available(iOS 18.0, *)
struct ZappyShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: MyJobsIntent(), phrases: ["Show my \(.applicationName) jobs", "What jobs do I have on \(.applicationName)"],
                shortTitle: "My jobs", systemImageName: "briefcase")
    AppShortcut(intent: OpenHomeIntent(), phrases: ["Open \(.applicationName)", "Go online on \(.applicationName)"],
                shortTitle: "Go online", systemImageName: "power")
  }
}

// An App Intents extension needs a Swift entry point, or App Store Connect rejects the upload (error 90896).
@main
struct ZappyShortcutsExtension: AppIntentsExtension {}
