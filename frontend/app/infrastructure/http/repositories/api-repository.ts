import { createParser, type EventSourceMessage } from "eventsource-parser";
import { normalizeFailure } from "@application/shared/failure";
import type { z } from "zod";
import type { ApiPort } from "@application/shared/ports";
import type {
  GenerationEventModel,
  ReviewAnswerModel,
} from "@application/shared/models";
import type { TokenVault } from "@runtime/session/token-vault";
import type { RawHttpTransport } from "../transports/transport";
import {
  accountEnvelopeSchema,
  authEnvelopeSchema,
  bootstrapEnvelopeSchema,
  localeEnvelopeSchema,
} from "../schemas/session";
import {
  batchCreatedEnvelopeSchema,
  claimConsumedEnvelopeSchema,
  claimEnvelopeSchema,
  generationCancelEnvelopeSchema,
  generationCancelledEventSchema,
  generationFailedEventSchema,
  generationOptionsEnvelopeSchema,
  generationStartedEventSchema,
  generationValidatedEventSchema,
  passageDeltaEventSchema,
  vocabularyEnvelopeSchema,
} from "../schemas/generation";
import {
  batchDetailEnvelopeSchema,
  batchListEnvelopeSchema,
  learningSummaryEnvelopeSchema,
  participationEnvelopeSchema,
} from "../schemas/learning";
import {
  activeRangeEnvelopeSchema,
  reviewActionEnvelopeSchema,
  reviewAttemptEnvelopeSchema,
  reviewRangePreviewEnvelopeSchema,
  reviewSessionCreatedEnvelopeSchema,
  reviewSessionEnvelopeSchema,
} from "../schemas/review";
import {
  adminBatchDetailEnvelopeSchema,
  adminBatchListEnvelopeSchema,
  adminGroupEnvelopeSchema,
  adminGroupsEnvelopeSchema,
  adminModelEnvelopeSchema,
  adminModelListEnvelopeSchema,
  adminUserEnvelopeSchema,
  adminUsersEnvelopeSchema,
  credentialEnvelopeSchema,
  userGroupChangeEnvelopeSchema,
} from "../schemas/admin";
import { problemSchema } from "../schemas/common";
import {
  mapAccountDto,
  mapActiveRangeDto,
  mapAdminModelDto,
  mapAdminUserDetailDto,
  mapAdminUserSummaryDto,
  mapAuthDto,
  mapBatchDetailDto,
  mapBatchPageDto,
  mapBootstrapDto,
  mapCredentialDto,
  mapGenerationOptionsDto,
  mapGenerationValidatedDto,
  mapGroupDto,
  mapLearningSummaryDto,
  mapReviewActionDto,
  mapReviewAttemptDto,
  mapReviewRangePreviewDto,
  mapReviewSessionCreatedDto,
  mapReviewSessionDto,
  mapUserGroupChangeDto,
  mapVocabularyDto,
} from "../mappers";
import { mapProblemDto } from "../mappers/problem-mapper";

export function createApiRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
  persistSecrets: boolean,
): ApiPort {
  const mutation = (headers?: HeadersInit): Headers => {
    const result = new Headers(headers);
    result.set("content-type", "application/json");
    result.set("x-csrf-token", vault.csrf());
    return result;
  };

  const api: ApiPort = {
    async bootstrap() {
      const envelope = await json(
        transport,
        "/api/v1/bootstrap",
        bootstrapEnvelopeSchema,
      );
      if (persistSecrets) vault.setCsrf(envelope.data.csrf_token);
      return mapBootstrapDto(envelope.data);
    },
    async updateLocale(locale) {
      const envelope = await json(
        transport,
        "/api/v1/me/ui-locale",
        localeEnvelopeSchema,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({ ui_locale: locale }),
        },
      );
      return envelope.data.ui_locale;
    },
    async register(input) {
      const envelope = await json(
        transport,
        "/api/v1/auth/register",
        authEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify({
            username: input.username,
            password: input.password,
            password_confirmation: input.passwordConfirmation,
            ui_locale: input.uiLocale,
          }),
        },
      );
      if (persistSecrets) vault.setCsrf(envelope.data.csrf_token);
      return mapAuthDto(envelope.data);
    },
    async login(input) {
      const envelope = await json(
        transport,
        "/api/v1/auth/login",
        authEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify({
            username: input.username,
            password: input.password,
            browser_ui_locale: input.browserUiLocale,
          }),
        },
      );
      if (persistSecrets) vault.setCsrf(envelope.data.csrf_token);
      return mapAuthDto(envelope.data);
    },
    async logout() {
      await noContent(transport, "/api/v1/auth/logout", {
        method: "POST",
        headers: mutation(),
        body: "{}",
      });
      vault.clearAll();
    },
    async getAccount() {
      const envelope = await json(
        transport,
        "/api/v1/me/account",
        accountEnvelopeSchema,
      );
      return mapAccountDto(envelope.data);
    },
    async changePassword(input) {
      await noContent(transport, "/api/v1/me/password", {
        method: "PUT",
        headers: mutation(),
        body: JSON.stringify({
          current_password: input.currentPassword,
          new_password: input.newPassword,
          new_password_confirmation: input.confirmation,
        }),
      });
    },
    async deleteAccount(input) {
      await noContent(transport, "/api/v1/me/account", {
        method: "DELETE",
        headers: mutation(),
        body: JSON.stringify({
          current_password: input.currentPassword,
          confirmed: input.confirmed,
        }),
      });
      vault.clearAll();
    },

    async searchVocabulary(query, signal) {
      const envelope = await json(
        transport,
        `/api/v1/vocabulary/search?q=${encodeURIComponent(query)}&limit=10`,
        vocabularyEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      return mapVocabularyDto(envelope.data);
    },
    async getGenerationOptions() {
      const envelope = await json(
        transport,
        "/api/v1/generation-options",
        generationOptionsEnvelopeSchema,
      );
      return mapGenerationOptionsDto(envelope.data);
    },
    async streamGeneration(input, onEvent, signal) {
      await streamGeneration(transport, vault, input, onEvent, signal);
    },
    async cancelGeneration(runId) {
      const headers = mutation({
        "x-generation-token": vault.generation(runId),
      });
      const envelope = await json(
        transport,
        `/api/v1/generations/${encodeURIComponent(runId)}/cancel`,
        generationCancelEnvelopeSchema,
        { method: "POST", headers, body: "{}" },
      );
      return envelope.data.status;
    },
    async saveGeneration(runId) {
      const headers = mutation({
        "x-generation-token": vault.generation(runId),
      });
      const envelope = await json(
        transport,
        `/api/v1/generations/${encodeURIComponent(runId)}/save`,
        batchCreatedEnvelopeSchema,
        { method: "POST", headers, body: "{}" },
      );
      vault.clearGeneration(runId);
      return {
        batchId: envelope.data.batch_id,
        savedAt: envelope.data.saved_at,
      };
    },
    async discardGeneration(runId) {
      const headers = mutation({
        "x-generation-token": vault.generation(runId),
      });
      await noContent(
        transport,
        `/api/v1/generations/${encodeURIComponent(runId)}/discard`,
        { method: "POST", headers, body: "{}" },
      );
      vault.clearGeneration(runId);
    },
    async createVisitorClaim(runId) {
      const headers = mutation({
        "x-generation-token": vault.generation(runId),
      });
      const envelope = await json(
        transport,
        `/api/v1/generations/${encodeURIComponent(runId)}/visitor-claim`,
        claimEnvelopeSchema,
        { method: "POST", headers, body: "{}" },
      );
      vault.setClaim(envelope.data.claim_token);
      return { expiresAt: envelope.data.expires_at };
    },
    async consumeVisitorClaim() {
      const headers = mutation({ "x-claim-token": vault.claim() });
      const envelope = await json(
        transport,
        "/api/v1/visitor-claims/consume",
        claimConsumedEnvelopeSchema,
        { method: "POST", headers, body: "{}" },
      );
      vault.clearClaim();
      return { batchId: envelope.data.batch_id, claimed: true };
    },

    async getLearningSummary() {
      const envelope = await json(
        transport,
        "/api/v1/me/learning-summary",
        learningSummaryEnvelopeSchema,
      );
      return mapLearningSummaryDto(envelope.data);
    },
    async listBatches(input = {}) {
      const query = new URLSearchParams({ limit: "20" });
      if (input.entry) query.set("entry", input.entry);
      if (input.cursor) query.set("cursor", input.cursor);
      const envelope = await json(
        transport,
        `/api/v1/me/batches?${query}`,
        batchListEnvelopeSchema,
      );
      return mapBatchPageDto(envelope.data.items, envelope.meta);
    },
    async getBatch(batchId) {
      const envelope = await json(
        transport,
        `/api/v1/me/batches/${encodeURIComponent(batchId)}`,
        batchDetailEnvelopeSchema,
      );
      return mapBatchDetailDto(envelope.data.batch);
    },
    async setBatchParticipation(batchId, participates) {
      const envelope = await json(
        transport,
        `/api/v1/me/batches/${encodeURIComponent(batchId)}`,
        participationEnvelopeSchema,
        {
          method: "PATCH",
          headers: mutation(),
          body: JSON.stringify({ participates_in_range_review: participates }),
        },
      );
      return envelope.data.participates_in_range_review;
    },
    async deleteBatch(batchId) {
      await noContent(
        transport,
        `/api/v1/me/batches/${encodeURIComponent(batchId)}`,
        { method: "DELETE", headers: mutation(), body: "{}" },
      );
    },

    async previewReviewRange(input, signal) {
      const query = new URLSearchParams({
        start_date: input.startDate,
        end_date: input.endDate,
        timezone: input.timezone,
      });
      const envelope = await json(
        transport,
        `/api/v1/me/review-range/preview?${query}`,
        reviewRangePreviewEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      return mapReviewRangePreviewDto(envelope.data);
    },
    async getActiveRange() {
      const envelope = await json(
        transport,
        "/api/v1/me/review-sessions/active-range",
        activeRangeEnvelopeSchema,
      );
      return envelope.data.session
        ? mapActiveRangeDto(envelope.data.session)
        : null;
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
      const envelope = await json(
        transport,
        "/api/v1/me/review-sessions",
        reviewSessionCreatedEnvelopeSchema,
        { method: "POST", headers: mutation(), body: JSON.stringify(body) },
      );
      return mapReviewSessionCreatedDto(envelope.data);
    },
    async getReviewSession(sessionId) {
      const envelope = await json(
        transport,
        `/api/v1/me/review-sessions/${encodeURIComponent(sessionId)}`,
        reviewSessionEnvelopeSchema,
      );
      return mapReviewSessionDto(envelope.data.session);
    },
    async startReviewAttempt(sessionId) {
      const envelope = await json(
        transport,
        `/api/v1/me/review-sessions/${encodeURIComponent(sessionId)}/attempts`,
        reviewAttemptEnvelopeSchema,
        { method: "POST", headers: mutation(), body: "{}" },
      );
      vault.setAttempt(envelope.data.attempt_id, envelope.data.attempt_token);
      return mapReviewAttemptDto(envelope.data);
    },
    async actOnReview(attemptId, input) {
      const headers = mutation({
        "x-review-attempt-token": vault.attempt(attemptId),
      });
      const envelope = await json(
        transport,
        `/api/v1/me/review-attempts/${encodeURIComponent(attemptId)}/actions`,
        reviewActionEnvelopeSchema,
        {
          method: "POST",
          headers,
          body: JSON.stringify(mapReviewActionRequest(input)),
        },
      );
      const outcome = mapReviewActionDto(envelope.data);
      if (
        outcome.outcome === "batch_completed" ||
        outcome.outcome === "session_completed"
      )
        vault.clearAttempt(attemptId);
      return outcome;
    },

    async getCredential() {
      const envelope = await json(
        transport,
        "/api/v1/admin/openrouter-credential",
        credentialEnvelopeSchema,
      );
      return mapCredentialDto(envelope.data);
    },
    async putCredential(apiKey) {
      const envelope = await json(
        transport,
        "/api/v1/admin/openrouter-credential",
        credentialEnvelopeSchema,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({ api_key: apiKey, confirmed: true }),
        },
      );
      return mapCredentialDto(envelope.data);
    },
    async listModels(cursor) {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const envelope = await json(
        transport,
        `/api/v1/admin/models?${query}`,
        adminModelListEnvelopeSchema,
      );
      return {
        items: envelope.data.items.map(mapAdminModelDto),
        nextCursor: envelope.meta.next_cursor,
        hasMore: envelope.meta.has_more,
      };
    },
    async createModel(input) {
      const envelope = await json(
        transport,
        "/api/v1/admin/models",
        adminModelEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify({
            display_name: input.displayName,
            description: input.description,
            openrouter_model_id: input.openRouterModelId,
          }),
        },
      );
      return mapAdminModelDto(envelope.data.model);
    },
    async updateModel(modelId, input) {
      const body: Record<string, string | null> = {};
      if (input.displayName !== undefined)
        body.display_name = input.displayName;
      if (input.description !== undefined) body.description = input.description;
      if (input.openRouterModelId !== undefined)
        body.openrouter_model_id = input.openRouterModelId;
      const envelope = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(modelId)}`,
        adminModelEnvelopeSchema,
        { method: "PATCH", headers: mutation(), body: JSON.stringify(body) },
      );
      return mapAdminModelDto(envelope.data.model);
    },
    async setModelEnabled(modelId, enabled) {
      const action = enabled ? "enable" : "disable";
      const envelope = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(modelId)}/${action}`,
        adminModelEnvelopeSchema,
        { method: "POST", headers: mutation(), body: "{}" },
      );
      return mapAdminModelDto(envelope.data.model);
    },
    async listGroups() {
      const envelope = await json(
        transport,
        "/api/v1/admin/groups",
        adminGroupsEnvelopeSchema,
      );
      return envelope.data.items.map(mapGroupDto);
    },
    async putGroup(code, input) {
      const envelope = await json(
        transport,
        `/api/v1/admin/groups/${code}`,
        adminGroupEnvelopeSchema,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({
            rolling_24h_limit: input.rolling24hLimit,
            max_entries: input.maxEntries,
            allowed_lengths: input.allowedLengths,
            model_ids: input.modelIds,
          }),
        },
      );
      return mapGroupDto(envelope.data.group);
    },
    async listUsers(input = {}) {
      const query = new URLSearchParams({ limit: "20" });
      if (input.username) query.set("username", input.username);
      if (input.cursor) query.set("cursor", input.cursor);
      const envelope = await json(
        transport,
        `/api/v1/admin/users?${query}`,
        adminUsersEnvelopeSchema,
      );
      return {
        items: envelope.data.items.map(mapAdminUserSummaryDto),
        nextCursor: envelope.meta.next_cursor,
        hasMore: envelope.meta.has_more,
      };
    },
    hasVisitorClaim: () => vault.hasClaim(),
    async getUser(userId, signal) {
      const envelope = await json(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}`,
        adminUserEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      if (envelope.data.user.id !== userId) throw contractFailure();
      return mapAdminUserDetailDto(envelope.data.user);
    },
    async changeUserGroup(userId, groupCode) {
      const envelope = await json(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}/group`,
        userGroupChangeEnvelopeSchema,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({ group_code: groupCode, confirmed: true }),
        },
      );
      if (
        envelope.data.user.id !== userId ||
        envelope.data.user.role !== "learner" ||
        envelope.data.user.plan_code !== groupCode
      )
        throw contractFailure();
      return mapUserGroupChangeDto(envelope.data);
    },
    async resetUserPassword(userId, password, confirmation) {
      await noContent(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}/password`,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({
            new_password: password,
            new_password_confirmation: confirmation,
            confirmed: true,
          }),
        },
      );
    },
    async listUserBatches(userId, cursor, signal) {
      const query = new URLSearchParams({ limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const envelope = await json(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}/batches?${query}`,
        adminBatchListEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      return mapBatchPageDto(envelope.data.items, envelope.meta);
    },
    async getUserBatch(userId, batchId, signal) {
      const envelope = await json(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}/batches/${encodeURIComponent(batchId)}`,
        adminBatchDetailEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      if (envelope.data.batch.id !== batchId) throw contractFailure();
      return mapBatchDetailDto(envelope.data.batch);
    },
  };
  return api;
}

function mapReviewActionRequest(
  input: ReviewAnswerModel,
): Record<string, unknown> {
  if (input.action === "skip")
    return { action_id: input.actionId, item_id: input.itemId, action: "skip" };
  if ("answer" in input)
    return {
      action_id: input.actionId,
      item_id: input.itemId,
      action: "answer",
      answer: input.answer,
    };
  return {
    action_id: input.actionId,
    item_id: input.itemId,
    action: "answer",
    answers: input.answers.map((answer) => ({
      blank_id: answer.blankId,
      answer: answer.answer,
    })),
  };
}

async function streamGeneration(
  transport: RawHttpTransport,
  vault: TokenVault,
  input: Parameters<ApiPort["streamGeneration"]>[0],
  onEvent: (event: GenerationEventModel) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const response = await transport.send("/api/v1/generations/stream", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
    },
    body: JSON.stringify({
      model_id: input.modelId,
      meaning_language: input.meaningLanguage,
      scenario: input.scenario,
      length: input.length,
      entries: input.entries,
    }),
  });
  const requestId = response.headers.get("x-request-id");
  if (!response.ok) throw await problemFromResponse(response);
  if (
    !response.headers.get("content-type")?.startsWith("text/event-stream") ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw { ...contractFailure(), requestId };
  }

  let runId: string | null = null;
  let terminal: GenerationEventModel["kind"] | null = null;
  let parseError: ReturnType<typeof normalizeFailure> | null = null;
  const invalid = () => ({ ...contractFailure(), requestId });
  const parser = createParser({
    maxBufferSize: 1_048_576,
    onError() {
      if (!terminal) parseError = invalid();
    },
    onEvent(message) {
      if (terminal || parseError) return;
      try {
        if (
          (runId === null && message.event !== "generation.started") ||
          (runId !== null && message.event === "generation.started")
        )
          throw invalid();
        mapStreamMessage(message, vault, (event) => {
          if (event.kind === "started") runId = event.runId;
          if (event.kind === "validated" && event.runId !== runId)
            throw invalid();
          if (
            event.kind === "validated" ||
            event.kind === "failed" ||
            event.kind === "cancelled"
          )
            terminal = event.kind;
          onEvent(event);
        });
      } catch (error) {
        parseError = { ...normalizeFailure(error), requestId };
      }
    },
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    while (!terminal) {
      const item = await reader.read();
      signal.throwIfAborted();
      let text: string;
      try {
        text = decoder.decode(item.value, { stream: !item.done });
      } catch {
        throw invalid();
      }
      parser.feed(text);
      if (parseError) throw parseError;
      if (item.done && !terminal) {
        // EOF cannot complete an unterminated SSE event or validate a draft.
        throw {
          ...normalizeFailure(new Error("Incomplete stream")),
          requestId,
        };
      }
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    if (runId !== null && terminal !== "validated")
      vault.clearGeneration(runId);
  }
}

function mapStreamMessage(
  message: EventSourceMessage,
  vault: TokenVault,
  onEvent: (event: GenerationEventModel) => void,
): void {
  const raw: unknown = JSON.parse(message.data);
  switch (message.event) {
    case "generation.started": {
      const dto = generationStartedEventSchema.parse(raw);
      vault.setGeneration(dto.run_id, dto.generation_token);
      onEvent({ kind: "started", runId: dto.run_id });
      return;
    }
    case "passage.delta": {
      const dto = passageDeltaEventSchema.parse(raw);
      onEvent({ kind: "delta", text: dto.text });
      return;
    }
    case "generation.validated": {
      const dto = generationValidatedEventSchema.parse(raw);
      onEvent({
        kind: "validated",
        runId: dto.run_id,
        result: mapGenerationValidatedDto(dto),
      });
      return;
    }
    case "generation.failed": {
      const dto = generationFailedEventSchema.parse(raw);
      onEvent({
        kind: "failed",
        code: dto.code,
        quotaRefunded: dto.quota_refunded,
        retryable: dto.retryable,
        requestId: dto.request_id,
      });
      return;
    }
    case "generation.cancelled": {
      const dto = generationCancelledEventSchema.parse(raw);
      onEvent({ kind: "cancelled", quotaRefunded: dto.quota_refunded });
      return;
    }
    default:
      throw contractFailure();
  }
}

async function json<T extends z.ZodType>(
  transport: RawHttpTransport,
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await transport.send(path, init);
  if (!response.ok) throw await problemFromResponse(response);
  if (!response.headers.get("content-type")?.startsWith("application/json"))
    throw contractFailure();
  return schema.parse(await response.json());
}

async function noContent(
  transport: RawHttpTransport,
  path: string,
  init: RequestInit,
): Promise<void> {
  const response = await transport.send(path, init);
  if (!response.ok) throw await problemFromResponse(response);
  if (response.status !== 204 || (await response.text()).length !== 0)
    throw contractFailure();
}

async function problemFromResponse(response: Response) {
  if (
    !response.headers
      .get("content-type")
      ?.startsWith("application/problem+json")
  )
    return contractFailure();
  const parsed = problemSchema.safeParse(await response.json());
  return parsed.success ? mapProblemDto(parsed.data) : contractFailure();
}

function contractFailure() {
  return {
    kind: "contract_violation",
    code: "contract_violation",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  } as const;
}
