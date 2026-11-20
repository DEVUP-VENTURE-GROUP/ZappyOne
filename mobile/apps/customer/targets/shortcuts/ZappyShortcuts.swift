// "Book a service with ZappyOne" and "Show my ZappyOne bookings": Siri, Spotlight and the Shortcuts app open the app at the right screen through its link (zappyone://).
import AppIntents
import Foundation

// OpenURLIntent is iOS 18; @bacons/apple-targets builds App Intents extensions for iOS 17.0 whatever expo-target.config.js says, so the availability lives here.
@available(iOS 18.0, *)
struct BookServiceIntent: AppIntent {
  static var title: LocalizedStringResource = "Book a service"
  static var description = IntentDescription("Open ZappyOne to book a home or vehicle service.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone://repair")!))
  }
}

@available(iOS 18.0, *)
struct MyBookingsIntent: AppIntent {
  static var title: LocalizedStringResource = "Show my bookings"
  static var description = IntentDescription("Open your ZappyOne bookings to track a job.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone://orders")!))
  }
}

@available(iOS 18.0, *)
struct ZappyShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: BookServiceIntent(), phrases: ["Book a service with \(.applicationName)", "Book on \(.applicationName)"],
                shortTitle: "Book a service", systemImageName: "wrench.and.screwdriver")
    AppShortcut(intent: MyBookingsIntent(), phrases: ["Show my \(.applicationName) bookings", "Track my \(.applicationName) booking"],
                shortTitle: "My bookings", systemImageName: "list.bullet.rectangle")
  }
}
