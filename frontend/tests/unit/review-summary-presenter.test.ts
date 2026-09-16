import { describe, expect, it } from "vitest";
import type { ReviewSessionModel } from "@application/shared/models";
import { presentReviewSummary } from "@presentation/review/review-summary-presenter";

describe("review summary presenter", () => {
  it.each([
    {
      mode: "single_batch" as const,
      skipped: 0,
      expected: {
        eyebrow: "review.singleFinished",
        title: "review.singleCompleteTitle:1",
        description: "review.summarySuccessCopy",
        restartLabel: "review.restartSingle",
        symbol: "✓",
      },
    },
    {
      mode: "single_batch" as const,
      skipped: 1,
      expected: {
        eyebrow: "review.singleFinished",
        title: "review.singleRetryTitle:1",
        description: "review.singleIncompleteCopy",
        restartLabel: "review.restartSingle",
        symbol: "→",
      },
    },
    {
      mode: "range" as const,
      skipped: 0,
      expected: {
        eyebrow: "review.finished",
        title: "review.rangeCompleteTitle:5",
        description: "review.summarySuccessCopy",
        restartLabel: "review.restartRange",
        symbol: "✓",
      },
    },
    {
      mode: "range" as const,
      skipped: 1,
      expected: {
        eyebrow: "review.finished",
        title: "review.rangeReviewedTitle:5",
        description: "review.rangeIncompleteCopy",
        restartLabel: "review.restartRange",
        symbol: "→",
      },
    },
  ])("maps $mode with skipped=$skipped", ({ mode, skipped, expected }) => {
    const single = mode === "single_batch";
    const mastered = single ? (skipped === 0 ? 1 : 0) : 3;
    const completed = single ? 1 : 5;
    const view = presentReviewSummary(
      completedSession(mode, skipped),
      (key, parameters) =>
        parameters?.count ? `${key}:${parameters.count}` : key,
    );
    expect(view).toMatchObject(expected);
    expect(view).toMatchObject({
      completed,
      mastered,
      revisit: completed - mastered,
      returnLabel: "review.viewLibrary",
    });
  });
});

function completedSession(
  mode: "single_batch" | "range",
  skippedBatches: number,
): Extract<ReviewSessionModel, { status: "completed" }> {
  const single = mode === "single_batch";
  const totalBatches = single ? 1 : 5;
  const successfulBatches = single ? (skippedBatches === 0 ? 1 : 0) : 3;
  return {
    sessionId: `session-${mode}`,
    mode,
    status: "completed",
    dateRange: single
      ? null
      : {
          startDate: "2026-08-23",
          endDate: "2026-08-29",
          timezone: "Asia/Shanghai",
        },
    progress: {
      completedBatches: totalBatches,
      totalBatches,
      successfulBatches,
      unsuccessfulBatches: totalBatches - successfulBatches,
    },
    currentBatch: null,
    summary: {
      totalBatches,
      successfulBatches,
      unsuccessfulBatches: totalBatches - successfulBatches,
      skippedBatches,
    },
  };
}
