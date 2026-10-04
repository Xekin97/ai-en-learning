import type {
  DateRangeModel,
  ReviewBatchProjectionModel,
  ReviewProgressModel,
  SafePassageSegmentModel,
  ReviewRangePreviewModel,
  ActiveRangeModel,
} from "../shared/models";
export interface SessionModel {
  sessionId: string;
  mode: "range" | "single_batch";
  status: "active" | "completed" | "abandoned";
  dateRange: DateRangeModel | null;
  progress: ReviewProgressModel & { skippedBatches: number };
  currentBatch: ReviewBatchProjectionModel | null;
  currentAttempt: {
    attemptId: string;
    revision: string;
    state: "draft";
  } | null;
  revision: string | null;
}
export interface WordQuestion {
  questionId: string;
  entryMeaning: string;
  slots: (
    { kind: "letters"; count: number } | { kind: "separator"; text: string }
  )[];
  hint: ({ kind: "text"; text: string } | { kind: "blank" })[];
}
export interface DraftAttemptModel {
  attemptId: string;
  sessionId: string;
  batchId: string;
  revision: string;
  tokenExpiresAt: string;
  words: WordQuestion[];
  passage: SafePassageSegmentModel[];
}
export interface ReceiptModel {
  attemptId: string;
  batchId: string;
  revision: string;
  submittedAt: string;
  successful: boolean;
  answerState: "answered" | "unanswered" | "unknown";
}
export interface AnswerComparison {
  input: string;
  correct: string;
  result: "correct" | "incorrect" | "unanswered";
}
export interface ComparisonModel {
  words: (AnswerComparison & { questionId: string })[];
  passage: (
    | { kind: "text"; text: string }
    | ({ kind: "answer"; blankId: string } & AnswerComparison)
  )[];
}
export type AttemptReadModel =
  | { state: "draft"; attempt: DraftAttemptModel }
  | { state: "submitted"; receipt: ReceiptModel; session: SessionModel }
  | { state: "restarted"; session: SessionModel };
export type SubmissionModel =
  | {
      outcome: "submitted";
      receipt: ReceiptModel;
      session: SessionModel;
      comparison: ComparisonModel;
      growth: {
        newMasteries: number;
        experienceAdded: string;
        pointsAdded: string;
      };
    }
  | {
      outcome: "already_submitted";
      receipt: ReceiptModel;
      session: SessionModel;
    };
export interface SubmissionInput {
  expectedRevision: string;
  words: { questionId: string; answer: string }[];
  passage: { blankId: string; answer: string }[];
}
export interface ReviewPort {
  previewReviewRange(
    input: DateRangeModel,
    signal?: AbortSignal,
  ): Promise<ReviewRangePreviewModel>;
  getActiveRange(): Promise<ActiveRangeModel | null>;
  createReviewSession(
    input:
      | ({ mode: "range" } & DateRangeModel)
      | { mode: "single_batch"; batchId: string },
  ): Promise<{ session: SessionModel; reused: boolean }>;
  getReviewSession(id: string): Promise<SessionModel>;
  replaceReviewSession(
    id: string,
    revision: string,
    range: DateRangeModel,
  ): Promise<SessionModel>;
  startReviewAttempt(sessionId: string): Promise<DraftAttemptModel>;
  getReviewAttempt(id: string): Promise<AttemptReadModel>;
  submitReviewAttempt(
    id: string,
    input: SubmissionInput,
  ): Promise<SubmissionModel>;
  restartReviewAttempt(
    id: string,
    revision: string,
  ): Promise<{ attempt: DraftAttemptModel; session: SessionModel }>;
}
export interface DraftNavigation {
  step: number;
  stage: "editing" | "overview";
  returnToOverview: boolean;
  focus: number | null;
}
export interface LocalDraft {
  schemaVersion: 1;
  serverRevision: string;
  localRevision: number;
  wordInputs: Record<string, string[]>;
  passageInputs: Record<string, string>;
  navigation: DraftNavigation;
}
export type DraftKey = readonly [
  accountId: string,
  sessionId: string,
  attemptId: string,
];
