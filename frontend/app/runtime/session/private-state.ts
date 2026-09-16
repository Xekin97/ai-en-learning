import type { Ref } from "vue";

// Weakly scoped by Nuxt application: no private state shared across SSR requests.
const resets = new WeakMap<object, Map<string, () => void>>();
export function registerPrivateState<T>(
  app: object,
  key: string,
  state: Ref<T>,
  initial: () => T,
) {
  let entries = resets.get(app);
  if (!entries) {
    entries = new Map();
    resets.set(app, entries);
  }
  entries.set(key, () => {
    state.value = initial();
  });
}
export function resetPrivateStates(app: object) {
  for (const reset of resets.get(app)?.values() ?? []) reset();
}
