import type {
  PronunciationAccent,
  PronunciationPhase,
  PronunciationState,
} from "@application/pronunciation/models";

export function usePronunciationPresentation(
  entry: Ref<string>,
  state: Readonly<Ref<PronunciationState>>,
) {
  const { copy } = useDesignCopy();

  const accentLabel = (accent: PronunciationAccent) =>
    copy(
      accent === "uk"
        ? "pron.uk"
        : accent === "us"
          ? "pron.us"
          : "pron.english",
    );
  const icon = computed(() => {
    const phase = state.value.phase;
    return (
      ["preparing", "playing", "error", "gesture", "accent"] as const
    ).includes(
      phase as "preparing" | "playing" | "error" | "gesture" | "accent",
    )
      ? (phase as Exclude<PronunciationPhase, "idle" | "complete">)
      : "speaker";
  });
  const mainLabel = computed(() => {
    if (state.value.phase === "accent")
      return copy("pron.chooseAccent", { word: entry.value });
    if (state.value.phase === "gesture") return copy("pron.clickAgain");
    if (state.value.phase === "error") return copy("pron.retry");
    if (state.value.phase === "complete" || state.value.phase === "playing")
      return copy("pron.replayWord", { word: entry.value });
    return copy("pron.playWord", { word: entry.value });
  });
  const liveMessage = computed(() => {
    const phase = state.value.phase;
    if (phase === "preparing")
      return copy("pron.statusPreparing", { word: entry.value });
    if (phase === "playing")
      return copy("pron.statusPlaying", {
        word: entry.value,
        source: copy("pron.browser"),
      });
    if (phase === "gesture") return copy("pron.gesture");
    if (phase === "error")
      return copy("pron.statusUnavailable", { word: entry.value });
    if (phase === "accent" && state.value.failedSelection)
      return copy("pron.accentUnavailable", {
        word: entry.value,
        accent: accentLabel(state.value.failedSelection.accent),
      });
    return "";
  });

  return { accentLabel, icon, liveMessage, mainLabel };
}
