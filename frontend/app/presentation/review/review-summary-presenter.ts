import type { ReviewSessionModel } from "@application/shared/models";

type CompletedReviewSession = Extract<
  ReviewSessionModel,
  { status: "completed" }
>;

type Translate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string;

export interface ReviewSummaryViewModel {
  mode: "range" | "single_batch";
  successful: boolean;
  symbol: "✓" | "→";
  eyebrow: string;
  title: string;
  description: string;
  completed: number;
  mastered: number;
  revisit: number;
  returnLabel: string;
  restartLabel: string;
}

export function presentReviewSummary(
  session: CompletedReviewSession,
  t: Translate,
): ReviewSummaryViewModel {
  const single = session.mode === "single_batch";
  const successful = session.summary.skippedBatches === 0;
  const titleKey = single
    ? successful
      ? "review.singleCompleteTitle"
      : "review.singleRetryTitle"
    : successful
      ? "review.rangeCompleteTitle"
      : "review.rangeReviewedTitle";
  const descriptionKey = successful
    ? "review.summarySuccessCopy"
    : single
      ? "review.singleIncompleteCopy"
      : "review.rangeIncompleteCopy";

  return {
    mode: session.mode,
    successful,
    symbol: successful ? "✓" : "→",
    eyebrow: t(single ? "review.singleFinished" : "review.finished"),
    title: t(titleKey, { count: session.summary.totalBatches }),
    description: t(descriptionKey),
    completed: session.summary.totalBatches,
    mastered: session.summary.successfulBatches,
    revisit: session.summary.unsuccessfulBatches,
    returnLabel: t("review.viewLibrary"),
    restartLabel: t(single ? "review.restartSingle" : "review.restartRange"),
  };
}
