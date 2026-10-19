import type {
  PronunciationRegistration,
  PronunciationState,
} from "@application/pronunciation/models";

const initialState = (
  entry: string,
  surfaceId: string,
): PronunciationState => ({
  phase: "idle",
  supported: false,
  entry,
  surfaceId,
  options: [],
  selectedOptionId: null,
  selectionExplicit: false,
  failedSelection: null,
  actualSource: null,
  reason: null,
});

export function usePronunciationScope(input: {
  entry: Ref<string>;
  surfaceId: Ref<string>;
  active: Ref<boolean>;
}) {
  const state = shallowRef<PronunciationState>(
    initialState(input.entry.value, input.surfaceId.value),
  );
  let registration: PronunciationRegistration | undefined;
  let unsubscribe: (() => void) | undefined;
  let mounted = false;

  function coordinator() {
    return useNuxtApp().$pronunciation;
  }

  function release() {
    unsubscribe?.();
    unsubscribe = undefined;
    if (registration) coordinator()?.release(registration);
    registration = undefined;
  }

  function register() {
    release();
    state.value = initialState(input.entry.value, input.surfaceId.value);
    const current = coordinator();
    if (!mounted || !input.active.value || !current) return;
    registration = current.register(input.entry.value, input.surfaceId.value);
    unsubscribe = current.subscribe(registration, (next) => {
      state.value = next;
    });
  }

  function play() {
    if (registration) coordinator()?.play(registration);
  }

  function choose(optionId: string) {
    if (registration) coordinator()?.choose(registration, optionId);
  }

  const session = useSessionStore();
  watch([input.entry, input.surfaceId, input.active], register);
  watch(session.epoch, register);
  onMounted(() => {
    mounted = true;
    register();
  });
  onBeforeUnmount(() => {
    mounted = false;
    release();
  });

  return { state: readonly(state), play, choose };
}
