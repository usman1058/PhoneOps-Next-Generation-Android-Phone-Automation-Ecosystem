import type { Step } from "@automation/shared";

export default function StepView({ steps }: { steps: Step[] }) {
  return (
    <div className="step-list">
      {steps.map((step, i) => (
        <div className="step" key={i}>
          <span className="muted">{i + 1}.</span>{" "}
          <span>{describe(step)}</span>
        </div>
      ))}
    </div>
  );
}

function describe(step: Step): string {
  switch (step.action) {
    case "open_app":
      return `open_app ${step.package}`;
    case "tap_by_text":
      return `tap_by_text "${step.text}"${step.timeoutMs ? ` (${step.timeoutMs}ms)` : ""}`;
    case "tap_by_coordinates":
      return `tap (${step.x}, ${step.y})`;
    case "swipe":
      return `swipe (${step.fromX},${step.fromY}) → (${step.toX},${step.toY})${
        step.durationMs ? ` (${step.durationMs}ms)` : ""
      }`;
    case "wait":
      return `wait ${step.ms}ms`;
    case "back":
      return "back";
    case "home":
      return "home";
    default:
      return JSON.stringify(step);
  }
}
