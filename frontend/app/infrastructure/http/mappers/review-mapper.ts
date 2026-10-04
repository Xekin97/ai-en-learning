import type {
  SessionModel,
  DraftAttemptModel,
  ReceiptModel,
  SubmissionModel,
} from "@application/review/models";
import type { ClozeGroupRef } from "@application/shared/models";
import type {
  SessionDto,
  DraftAttemptDto,
  ReceiptDto,
  SubmitDto,
} from "../schemas/review";
export function mapSession(
  dto: SessionDto,
  revision: string | null = null,
): SessionModel {
  return {
    sessionId: dto.session_id,
    mode: dto.mode,
    status: dto.status,
    dateRange: dto.date_range
      ? {
          startDate: dto.date_range.start_date,
          endDate: dto.date_range.end_date,
          timezone: dto.date_range.timezone,
        }
      : null,
    progress: {
      completedBatches: dto.progress.completed_batches,
      totalBatches: dto.progress.total_batches,
      successfulBatches: dto.progress.successful_batches,
      unsuccessfulBatches: dto.progress.unsuccessful_batches,
      skippedBatches: dto.progress.skipped_batches,
    },
    currentBatch: dto.current_batch
      ? {
          batchId: dto.current_batch.batch_id,
          savedAt: dto.current_batch.saved_at,
          scenario: dto.current_batch.scenario,
        }
      : null,
    currentAttempt: dto.current_attempt
      ? {
          attemptId: dto.current_attempt.attempt_id,
          revision: dto.current_attempt.revision,
          state: "draft",
        }
      : null,
    revision,
  };
}
export function mapDraft(dto: DraftAttemptDto): DraftAttemptModel {
  // Sorting opaque HMACs provides a stable anonymous permutation, independent of word order.
  const groups = [
    ...new Set(
      dto.passage.segments.flatMap((s) =>
        s.kind === "blank" ? [s.group_key] : [],
      ),
    ),
  ].sort();
  return {
    attemptId: dto.attempt_id,
    sessionId: dto.session_id,
    batchId: dto.batch_id,
    revision: dto.revision,
    tokenExpiresAt: dto.token_expires_at,
    words: dto.words.map((w) => ({
      questionId: w.question_id,
      entryMeaning: w.entry_meaning,
      slots: w.slots.map((s) =>
        s.kind === "letters"
          ? { kind: "letters", count: s.count }
          : { kind: "separator", text: s.text },
      ),
      hint: w.hint.segments.map((s) =>
        s.kind === "text" ? { kind: "text", text: s.text } : { kind: "blank" },
      ),
    })),
    passage: dto.passage.segments.map((s) =>
      s.kind === "text"
        ? { kind: "text", text: s.text }
        : {
            kind: "blank",
            blankId: s.blank_id,
            groupRef:
              `cloze-group-${groups.indexOf(s.group_key)}` as ClozeGroupRef,
          },
    ),
  };
}
export function mapReceipt(dto: ReceiptDto): ReceiptModel {
  return {
    attemptId: dto.attempt_id,
    batchId: dto.batch_id,
    revision: dto.revision,
    submittedAt: dto.submitted_at,
    successful: dto.successful,
    answerState:
      dto.has_answer === null
        ? "unknown"
        : dto.has_answer
          ? "answered"
          : "unanswered",
  };
}
export function mapSubmission(dto: SubmitDto): SubmissionModel {
  const common = {
    receipt: mapReceipt(dto.receipt),
    session: mapSession(dto.session),
  };
  if (dto.outcome === "already_submitted")
    return { outcome: "already_submitted", ...common };
  return {
    outcome: "submitted",
    ...common,
    comparison: {
      words: dto.comparison.words.map((w) => ({
        questionId: w.question_id,
        input: w.input,
        correct: w.correct,
        result: w.result,
      })),
      passage: dto.comparison.passage_segments.map((s) =>
        s.kind === "text"
          ? { kind: "text", text: s.text }
          : {
              kind: "answer",
              blankId: s.blank_id,
              input: s.input,
              correct: s.correct,
              result: s.result,
            },
      ),
    },
    growth: {
      newMasteries: dto.growth.new_masteries,
      experienceAdded: dto.growth.experience_added,
      pointsAdded: dto.growth.points_added,
    },
  };
}
