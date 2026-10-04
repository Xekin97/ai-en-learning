import type { ReviewPort } from "@application/review/models";
import type { TokenVault } from "@runtime/session/token-vault";
import type { RawHttpTransport } from "../transports/transport";
import * as schemas from "../schemas/review";
import {
  mapSession,
  mapDraft,
  mapReceipt,
  mapSubmission,
} from "../mappers/review-mapper";
import { json } from "./repository-support";
export function createReviewRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): ReviewPort {
  const post = (body: unknown, attemptId?: string): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
      ...(attemptId
        ? { "x-review-attempt-token": vault.attempt(attemptId) }
        : {}),
    },
    body: JSON.stringify(body),
  });
  const root = "/api/v1/me",
    path = (id: string) => `${root}/review-attempts/${encodeURIComponent(id)}`;
  const draft = (dto: schemas.DraftAttemptDto) => {
    vault.setAttempt(dto.attempt_id, dto.attempt_token);
    return mapDraft(dto);
  };
  return {
    async previewReviewRange(input, signal) {
      const query = new URLSearchParams({
        start_date: input.startDate,
        end_date: input.endDate,
        timezone: input.timezone,
      });
      const { data } = await json(
        transport,
        `${root}/review-range/preview?${query}`,
        schemas.reviewRangePreviewEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      return {
        batchCount: data.batch_count,
        entryCount: data.entry_count,
        empty: data.empty,
      };
    },
    async getActiveRange() {
      const { data } = await json(
        transport,
        `${root}/review-sessions/active-range`,
        schemas.activeRangeEnvelopeSchema,
      );
      if (!data.session) return null;
      const session = mapSession(data.session);
      return {
        sessionId: session.sessionId,
        dateRange: session.dateRange!,
        progress: session.progress,
      };
    },
    async createReviewSession(input) {
      const body =
        input.mode === "range"
          ? {
              mode: "range",
              start_date: input.startDate,
              end_date: input.endDate,
              timezone: input.timezone,
            }
          : { mode: "single_batch", batch_id: input.batchId };
      const { data } = await json(
        transport,
        `${root}/review-sessions`,
        schemas.reviewSessionCreatedEnvelopeSchema,
        post(body),
      );
      return { session: mapSession(data.session), reused: data.reused };
    },
    async getReviewSession(id) {
      const { data } = await json(
        transport,
        `${root}/review-sessions/${encodeURIComponent(id)}`,
        schemas.reviewSessionEnvelopeSchema,
      );
      return mapSession(data.session, data.session_revision);
    },
    async replaceReviewSession(id, revision, range) {
      const { data } = await json(
        transport,
        `${root}/review-sessions/${encodeURIComponent(id)}/replace`,
        schemas.reviewReplaceEnvelopeSchema,
        post({
          confirmed: true,
          expected_session_revision: revision,
          range: {
            start_date: range.startDate,
            end_date: range.endDate,
            timezone: range.timezone,
          },
        }),
      );
      return mapSession(data.session);
    },
    async startReviewAttempt(id) {
      const { data } = await json(
        transport,
        `${root}/review-sessions/${encodeURIComponent(id)}/attempts`,
        schemas.reviewAttemptEnvelopeSchema,
        post({}),
      );
      return draft(data.attempt);
    },
    async getReviewAttempt(id) {
      const { data } = await json(
        transport,
        path(id),
        schemas.reviewReadEnvelopeSchema,
      );
      if (data.state === "draft")
        return { state: "draft", attempt: draft(data.attempt) };
      vault.clearAttempt(id);
      return data.state === "submitted"
        ? {
            state: "submitted",
            receipt: mapReceipt(data.receipt),
            session: mapSession(data.session),
          }
        : { state: "restarted", session: mapSession(data.session) };
    },
    async submitReviewAttempt(id, input) {
      const { data } = await json(
        transport,
        path(id) + "/submit",
        schemas.reviewSubmitEnvelopeSchema,
        post(
          {
            expected_revision: input.expectedRevision,
            words: input.words.map((w) => ({
              question_id: w.questionId,
              answer: w.answer,
            })),
            passage: input.passage.map((p) => ({
              blank_id: p.blankId,
              answer: p.answer,
            })),
          },
          id,
        ),
      );
      vault.clearAttempt(id);
      return mapSubmission(data);
    },
    async restartReviewAttempt(id, revision) {
      const { data } = await json(
        transport,
        path(id) + "/restart",
        schemas.reviewRestartEnvelopeSchema,
        post({ expected_revision: revision }),
      );
      vault.clearAttempt(id);
      return {
        attempt: draft(data.attempt),
        session: mapSession(data.session),
      };
    },
  };
}
