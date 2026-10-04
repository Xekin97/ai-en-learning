import { shallowRef } from "vue";
import type { Ref } from "vue";
export interface FeedbackMessage {
  sequence: number;
  key: string;
  values: Record<string, string | number>;
  welcome: boolean;
}
interface Feedback {
  message: Ref<FeedbackMessage | null>;
  host: Ref<HTMLDialogElement | null>;
  show: (key: string, values?: Record<string, string | number>) => void;
  clear: () => void;
  modal: (dialog: HTMLDialogElement, open: boolean) => void;
}
const services = new WeakMap<object, Feedback>();
export function feedbackFor(app: object): Feedback {
  const existing = services.get(app);
  if (existing) return existing;
  const message = shallowRef<FeedbackMessage | null>(null),
    host = shallowRef<HTMLDialogElement | null>(null);
  const dialogs: HTMLDialogElement[] = [];
  let sequence = 0;
  const service: Feedback = {
    message,
    host,
    show(key, values = {}) {
      message.value = {
        sequence: ++sequence,
        key,
        values,
        welcome:
          key === "welcome" ||
          key.startsWith("welcome.") ||
          key === "g.welcome.new",
      };
    },
    clear() {
      message.value = null;
    },
    modal(dialog, open) {
      const i = dialogs.indexOf(dialog);
      if (i >= 0) dialogs.splice(i, 1);
      if (open) dialogs.push(dialog);
      host.value = dialogs.at(-1) ?? null;
    },
  };
  services.set(app, service);
  return service;
}
