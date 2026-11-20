// "Book a service with ZappyOne" and "Show my ZappyOne bookings": Siri, Spotlight and the Shortcuts app open the app at the right screen through its link (zappyone://).
import AppIntents
import Foundation

struct BookServiceIntent: AppIntent {
  static var title: LocalizedStringResource = "Book a service"
  static var description = IntentDescription("Open ZappyOne to book a home or vehicle service.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone://repair")!))
  }
}

struct MyBookingsIntent: AppIntent {
  static var title: LocalizedStringResource = "Show my bookings"
  static var description = IntentDescription("Open your ZappyOne bookings to track a job.")

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "zappyone://orders")!))
  }
}

struct ZappyShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: BookServiceIntent(), phrases: ["Book a service with \(.applicationName)", "Book on \(.applicationName)"],
                shortTitle: "Book a service", systemImageName: "wrench.and.screwdriver")
    AppShortcut(intent: MyBookingsIntent(), phrases: ["Show my \(.applicationName) bookings", "Track my \(.applicationName) booking"],
                shortTitle: "My bookings", systemImageName: "list.bullet.rectangle")
  }
}
