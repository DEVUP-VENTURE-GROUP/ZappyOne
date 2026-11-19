// The job on the customer's Lock Screen and Dynamic Island: what is happening now, who is coming, and how far along it is.
import ActivityKit
import SwiftUI
import WidgetKit

@main
struct JobActivityBundle: WidgetBundle {
  var body: some Widget { JobActivityWidget() }
}

struct JobActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: JobActivityAttributes.self) { context in
      LockScreenView(attributes: context.attributes, state: context.state)
        .activityBackgroundTint(Color.white)
        .activitySystemActionForegroundColor(Color("brand"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { StageIcon(stage: context.state.stage).padding(.leading, 4) }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.attributes.reference).font(.caption2).foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.headline).font(.headline).foregroundStyle(.white)
            Text(subline(context.state, context.attributes)).font(.caption).foregroundStyle(.white.opacity(0.7))
            StepBar(step: context.state.step, steps: context.state.steps, track: .white.opacity(0.2))
          }
        }
      } compactLeading: {
        StageIcon(stage: context.state.stage)
      } compactTrailing: {
        Text("\(context.state.step + 1)/\(context.state.steps)").font(.caption2.monospacedDigit()).foregroundStyle(Color("brand"))
      } minimal: {
        StageIcon(stage: context.state.stage)
      }
      .keylineTint(Color("brand"))
    }
  }
}

private func subline(_ s: JobActivityAttributes.ContentState, _ a: JobActivityAttributes) -> String {
  if let name = s.proName, !name.isEmpty { return "\(name) · \(a.title)" }
  return a.title
}

struct LockScreenView: View {
  let attributes: JobActivityAttributes
  let state: JobActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        StageIcon(stage: state.stage)
        VStack(alignment: .leading, spacing: 2) {
          Text(state.headline).font(.headline).foregroundStyle(Color("ink"))
          Text(subline(state, attributes)).font(.subheadline).foregroundStyle(Color("muted")).lineLimit(1)
        }
        Spacer(minLength: 0)
        Text(attributes.reference).font(.caption2.monospaced()).foregroundStyle(Color("muted"))
      }
      StepBar(step: state.step, steps: state.steps, track: Color("track"))
    }
    .padding(16)
  }
}

// One segment per stage, filled up to where the job is.
struct StepBar: View {
  let step: Int
  let steps: Int
  let track: Color

  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<max(steps, 1), id: \.self) { i in
        Capsule().fill(i <= step ? Color("brand") : track).frame(height: 5)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Step \(step + 1) of \(steps)")
  }
}

// System symbols only: no emoji, no illustration that looks machine-made.
struct StageIcon: View {
  let stage: String

  var body: some View {
    Image(systemName: symbol)
      .font(.system(size: 15, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: 28, height: 28)
      .background(Circle().fill(Color("brand")))
  }

  private var symbol: String {
    switch stage {
    case "assigned": return "person.fill.checkmark"
    case "on_the_way": return "scooter"
    case "arrived": return "mappin.and.ellipse"
    case "working": return "wrench.and.screwdriver.fill"
    case "payment": return "indianrupeesign"
    case "done": return "checkmark"
    default: return "magnifyingglass"
    }
  }
}
