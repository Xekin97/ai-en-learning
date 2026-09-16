import {
  canStartRange,
  type ReviewSetupState,
} from "@application/review/range-setup";

type Translate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string;
export function presentReviewSetup(
  state: ReviewSetupState,
  learner: boolean,
  t: Translate,
) {
  const p = state.preview;
  const known = p.kind === "ready" || p.kind === "empty" ? p.result : null;
  const issue = p.kind === "invalid" ? p.issue : null;
  const fieldError = issue
    ? t("review.range." + (issue.kind === "reversed" ? "reversed" : "missing"))
    : "";
  const resume = state.resume.status === "ready" ? state.resume.session : null;
  const loading = p.kind === "idle" || p.kind === "loading";
  const announcement =
    p.kind === "ready"
      ? t(
          p.result.batchCount === 1
            ? "review.range.readyOne"
            : "review.range.readyMany",
          { count: p.result.batchCount },
        )
      : p.kind === "empty"
        ? t("review.noStories")
        : p.kind === "invalid"
          ? fieldError
          : p.kind === "failed"
            ? t("review.range.errorTitle")
            : t("review.range.loading");
  return {
    eyebrow: t("review.eyebrow"),
    title: t("review.title"),
    description: t("review.description"),
    rangeTitle: t("review.rangeTitle"),
    rangeCopy: t("review.rangeCopy"),
    from: t("review.from"),
    to: t("review.to"),
    startDate: state.draft.startDate,
    endDate: state.draft.endDate,
    startInvalid: issue?.startInvalid ?? false,
    endInvalid: issue?.endInvalid ?? false,
    fieldError,
    status: p.kind,
    loading,
    announcement,
    count: known ? String(known.batchCount) : "—",
    countKnown: known !== null,
    stories: t("review.stories"),
    countHint: known
      ? t(
          known.entryCount === 1
            ? "review.range.wordOne"
            : "review.range.wordMany",
          { count: known.entryCount },
        )
      : loading
        ? t("review.range.loading")
        : issue
          ? t("review.range.invalid")
          : t("review.range.errorTitle"),
    canStart: canStartRange(state, learner),
    start: t("review.range.start"),
    empty: p.kind === "empty",
    emptyTitle: t("review.noStories"),
    emptyCopy: t("review.noStoriesCopy"),
    library: t("review.range.library"),
    create: t("review.range.create"),
    failed: p.kind === "failed",
    errorTitle: t("review.range.errorTitle"),
    errorCopy: t("review.range.errorCopy"),
    retry: t("review.range.retry"),
    resume: resume
      ? {
          title: t("review.range.resume"),
          action: t("review.resumeAction"),
          copy: t("review.resumeCopy", {
            current: resume.progress.completedBatches,
            total: resume.progress.totalBatches,
          }),
        }
      : null,
    resumeFailure: state.resume.failure,
    createFailure: state.create.failure,
  };
}
export type ReviewSetupViewModel = ReturnType<typeof presentReviewSetup>;
