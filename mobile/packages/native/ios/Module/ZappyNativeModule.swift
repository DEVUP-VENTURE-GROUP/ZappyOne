// ZappyOne's own iPhone code, called from JavaScript as `zappyNative` (packages/native/index.ts); the Android twin is packages/native/android ZappyNativeModule.kt.
import ExpoModulesCore
#if canImport(ActivityKit)
import ActivityKit
#endif

// The JavaScript side of JobActivityAttributes.ContentState.
struct JobStateRecord: Record {
  @Field var stage: String = "booked"
  @Field var step: Int = 0
  @Field var steps: Int = 7
  @Field var headline: String = ""
  @Field var proName: String? = nil
  @Field var etaMinutes: Int? = nil
  @Field var updatedAt: Int = 0
}

public class ZappyNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZappyNative")
    Events("onLiveActivityToken")

    // Android-only features answer "not here" on iPhone, so shared screens need no platform checks.
    Function("canFullScreen") { false }
    Function("openFullScreenSettings") {}
    Function("enqueueUpload") { (_: String, _: String, _: String, _: String) -> Bool in false }

    Function("liveActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }

    AsyncFunction("startJobActivity") { (jobId: String, title: String, reference: String, state: JobStateRecord) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      // One card per job: a second start (screen opened again) reuses the running one.
      if let running = Activity<JobActivityAttributes>.activities.first(where: { $0.attributes.jobId == jobId }) {
        await running.update(ActivityContent(state: Self.contentState(state), staleDate: nil))
        self.watchToken(running, jobId: jobId)
        return running.id
      }
      let attributes = JobActivityAttributes(jobId: jobId, title: title, reference: reference)
      let activity = try Activity.request(attributes: attributes, content: ActivityContent(state: Self.contentState(state), staleDate: nil), pushType: .token)
      self.watchToken(activity, jobId: jobId)
      return activity.id
    }

    AsyncFunction("updateJobActivity") { (jobId: String, state: JobStateRecord) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<JobActivityAttributes>.activities where activity.attributes.jobId == jobId {
        await activity.update(ActivityContent(state: Self.contentState(state), staleDate: nil))
      }
    }

    AsyncFunction("endJobActivity") { (jobId: String) in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<JobActivityAttributes>.activities where activity.attributes.jobId == jobId {
        await activity.end(nil, dismissalPolicy: .default)
      }
    }
  }

  @available(iOS 16.2, *)
  private static func contentState(_ r: JobStateRecord) -> JobActivityAttributes.ContentState {
    JobActivityAttributes.ContentState(stage: r.stage, step: r.step, steps: r.steps, headline: r.headline, proName: r.proName, etaMinutes: r.etaMinutes, updatedAt: r.updatedAt)
  }

  // Apple hands out the activity's push token after it starts and may rotate it: each one goes to JavaScript, which sends it to the server.
  @available(iOS 16.2, *)
  private func watchToken(_ activity: Activity<JobActivityAttributes>, jobId: String) {
    Task {
      for await data in activity.pushTokenUpdates {
        let token = data.map { String(format: "%02x", $0) }.joined()
        self.sendEvent("onLiveActivityToken", ["jobId": jobId, "token": token])
      }
    }
  }
}
