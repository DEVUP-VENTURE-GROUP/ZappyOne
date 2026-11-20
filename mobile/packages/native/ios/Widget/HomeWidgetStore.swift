// What the Home Screen widget shows (the current job and where it is), kept in the app group both the app and the widget extension can read.
import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

enum HomeWidgetStore {
  static let key = "zappy.homeWidget"

  // The group comes from Info.plist (ZappyAppGroup, set in each app's app.config), so one module serves both apps.
  private static var defaults: UserDefaults? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ZappyAppGroup") as? String else { return nil }
    return UserDefaults(suiteName: group)
  }

  // Empty title clears it: the widget then shows the app's own invitation.
  static func set(title: String, line: String) {
    guard let defaults else { return }
    if title.isEmpty { defaults.removeObject(forKey: key) }
    else { defaults.set(["title": title, "line": line, "at": Date().timeIntervalSince1970], forKey: key) }
    #if canImport(WidgetKit)
    if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    #endif
  }
}
