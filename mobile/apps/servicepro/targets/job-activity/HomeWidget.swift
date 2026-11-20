// The Home Screen widget: the job you have on now and where it is, read from the app group the app writes (packages/native/ios Widget/HomeWidgetStore).
import SwiftUI
import WidgetKit

struct HomeEntry: TimelineEntry {
  let date: Date
  let title: String?
  let line: String?
}

struct HomeProvider: TimelineProvider {
  private func read() -> HomeEntry {
    let group = Bundle.main.object(forInfoDictionaryKey: "ZappyAppGroup") as? String
    let saved = group.flatMap { UserDefaults(suiteName: $0)?.dictionary(forKey: "zappy.homeWidget") }
    return HomeEntry(date: Date(), title: saved?["title"] as? String, line: saved?["line"] as? String)
  }
  func placeholder(in context: Context) -> HomeEntry { HomeEntry(date: Date(), title: "Your booking", line: "Your pro is on the way") }
  func getSnapshot(in context: Context, completion: @escaping (HomeEntry) -> Void) { completion(read()) }
  // The app reloads the widget on every change; a quarter-hour refresh is only a safety net.
  func getTimeline(in context: Context, completion: @escaping (Timeline<HomeEntry>) -> Void) {
    completion(Timeline(entries: [read()], policy: .after(Date().addingTimeInterval(15 * 60))))
  }
}

struct HomeWidgetView: View {
  let entry: HomeEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 6) {
        Circle().fill(Color("brand")).frame(width: 8, height: 8)
        Text("ZappyOne").font(.caption2.weight(.bold)).foregroundStyle(Color("brand"))
      }
      if let title = entry.title {
        Text(title).font(.headline).foregroundStyle(Color("ink")).lineLimit(2)
        Text(entry.line ?? "").font(.subheadline).foregroundStyle(Color("muted")).lineLimit(2)
      } else {
        Text("Nothing on right now").font(.headline).foregroundStyle(Color("ink"))
        Text("Open ZappyOne to book or see your jobs").font(.subheadline).foregroundStyle(Color("muted")).lineLimit(2)
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct HomeWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ZappyHome", provider: HomeProvider()) { entry in
      if #available(iOS 17.0, *) {
        HomeWidgetView(entry: entry).containerBackground(Color.white, for: .widget)
      } else {
        HomeWidgetView(entry: entry).background(Color.white)
      }
    }
    .configurationDisplayName("ZappyOne")
    .description("Your current job and where it is.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
