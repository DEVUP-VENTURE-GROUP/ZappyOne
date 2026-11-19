// The shape of a job's Live Activity, shared by the app module and the widget extension; the server sends ContentState as JSON (server notification/live-activity stateFor).
// Keep identical to mobile/apps/customer/targets/job-activity/JobActivityAttributes.swift (checked by mobile/tools/tests/liveActivityShape.test.mjs).
import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
public struct JobActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var stage: String
    public var step: Int
    public var steps: Int
    public var headline: String
    public var proName: String?
    public var etaMinutes: Int?
    public var updatedAt: Int
  }

  public var jobId: String
  public var title: String
  public var reference: String
}
#endif
