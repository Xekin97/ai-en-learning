import { shallowRef } from "vue";
import type { AuthSessionResult } from "@application/shared/models";
import { feedbackFor } from "@runtime/feedback/service";
const services = new WeakMap<object, ReturnType<typeof create>>();
function create(app: object) {
  let pending: {
    result: AuthSessionResult;
    kind: "login" | "register";
  } | null = null;
  const reminders = shallowRef(0);
  return {
    reminders,
    queue(result: AuthSessionResult, kind: "login" | "register") {
      pending = { result, kind };
    },
    clear() {
      pending = null;
      feedbackFor(app).clear();
    },
    present() {
      const event = pending;
      pending = null;
      if (!event) return;
      const { result, kind } = event;
      if (result.actor.kind === "account" && result.actor.role === "learner") {
        const w = result.welcome,
          name = w?.displayName ?? result.actor.username;
        if (kind === "register")
          feedbackFor(app).show("welcome.first", { name });
        else if (w)
          feedbackFor(app).show(
            w.kind === "no_learning"
              ? "g.welcome.new"
              : w.kind === "same_day"
                ? "welcome.today"
                : "welcome",
            { name, days: w.daysSinceLearning ?? 0 },
          );
      }
      if (kind === "login") reminders.value++;
    },
  };
}
export function authenticationFeedbackFor(app: object) {
  let value = services.get(app);
  if (!value) {
    value = create(app);
    services.set(app, value);
  }
  return value;
}
