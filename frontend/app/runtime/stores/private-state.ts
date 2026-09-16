import { registerPrivateState } from "@runtime/session/private-state";

export function usePrivateState<T>(key: string, initial: () => T) {
  const state = useState<T>(key, initial);
  registerPrivateState(useNuxtApp(), key, state, initial);
  return state;
}
