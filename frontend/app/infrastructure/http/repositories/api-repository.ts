import { mapAdminProviderDto } from "../mappers/admin-provider-mapper";
import { createAdminPresetsRepository } from "./admin-presets-repository";
import { createAdminItemsRepository } from "./admin-items-repository";
import { createAdminGrowthRepository } from "./admin-growth-repository";
import { createAnalyticsRepository } from "./analytics-repository";
import { createAdminNoticesRepository } from "./admin-notices-repository";
import { createAdminUserBenefitsRepository } from "./admin-user-benefits-repository";
import { createAdminConfigurationRepository } from "./admin-configuration-repository";
import { createBenefitsRepository } from "./benefits-repository";
import { createGrowthRepository } from "./growth-repository";
import { createReviewRepository } from "./review-repository";
import { createParser, type EventSourceMessage } from "eventsource-parser";
import { normalizeFailure } from "@application/shared/failure";
import type { ApiPort } from "@application/shared/ports";
import type {
  GenerationEventModel,
  ModelConfigurationInput,
} from "@application/shared/models";
import type { TokenVault } from "@runtime/session/token-vault";
import type { RawHttpTransport } from "../transports/transport";
import {
  accountEnvelopeSchema,
  authEnvelopeSchema,
  loginEnvelopeSchema,
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
  randomEntryEnvelopeSchema,
} from "../schemas/generation";
import {
  batchDetailEnvelopeSchema,
  batchTitleEnvelopeSchema,
  batchListEnvelopeSchema,
  learningSummaryEnvelopeSchema,
  participationEnvelopeSchema,
} from "../schemas/learning";

import {
  adminBatchDetailEnvelopeSchema,
  adminBatchListEnvelopeSchema,
  adminGroupEnvelopeSchema,
  adminGroupsEnvelopeSchema,
  adminModelEnvelopeSchema,
  adminModelBatchEnvelopeSchema,
  adminProviderEnvelopeSchema,
  adminProviderListEnvelopeSchema,
  adminModelListEnvelopeSchema,
  adminUserEnvelopeSchema,
  adminUsersEnvelopeSchema,
  modelConnectionsEnvelopeSchema,
  modelConnectionTestEnvelopeSchema,
  userGroupChangeEnvelopeSchema,
} from "../schemas/admin";
import {
  mapAccountDto,
  mapAdminModelDto,
  mapAdminUserDetailDto,
  mapAdminUserSummaryDto,
  mapAuthDto,
  mapBatchDetailDto,
  mapBatchPageDto,
  mapBootstrapDto,
  mapModelConnectionDto,
  mapGenerationOptionsDto,
  mapGenerationValidatedDto,
  mapGroupDto,
  mapLearningSummaryDto,
  mapUserGroupChangeDto,
  mapVocabularyDto,
} from "../mappers";
import {
  json,
  noContent,
  problemFromResponse,
  contractFailure,
} from "./repository-support";
import { createPresetsRepository } from "./presets-repository";
import { createNoticesRepository } from "./notices-repository";

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
    ...createAdminItemsRepository(transport, vault),
    ...createAdminPresetsRepository(transport, vault),
    ...createAdminGrowthRepository(transport, vault),
    ...createAnalyticsRepository(transport, vault),
    ...createAdminNoticesRepository(transport, vault),
    ...createAdminUserBenefitsRepository(transport, vault),
    ...createAdminConfigurationRepository(transport, vault),
    ...createNoticesRepository(transport),
    ...createPresetsRepository(transport),
    ...createReviewRepository(transport, vault),
    ...createGrowthRepository(transport, vault),
    ...createBenefitsRepository(transport, vault),
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
        loginEnvelopeSchema,
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
    async updateAccount(input) {
      const envelope = await json(
        transport,
        "/api/v1/me/account",
        accountEnvelopeSchema,
        {
          method: "PATCH",
          headers: mutation(),
          body: JSON.stringify({
            nickname: input.nickname,
            gender: input.gender,
          }),
        },
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
    async randomEntry(entries) {
      return (
        await json(
          transport,
          "/api/v1/vocabulary/random",
          randomEntryEnvelopeSchema,
          {
            method: "POST",
            headers: mutation(),
            body: JSON.stringify({ selected_entries: entries }),
          },
        )
      ).data;
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
    async updateBatchTitle(batchId, input) {
      const { data } = await json(
        transport,
        `/api/v1/me/batches/${encodeURIComponent(batchId)}`,
        batchTitleEnvelopeSchema,
        {
          method: "PATCH",
          headers: mutation(),
          body: JSON.stringify({
            title: input.title,
            expected_title_revision: input.expectedTitleRevision,
          }),
        },
      );
      return {
        batchId: data.batch_id,
        title: data.title,
        titleRevision: data.title_revision,
      };
    },
    async deleteBatch(batchId) {
      await noContent(
        transport,
        `/api/v1/me/batches/${encodeURIComponent(batchId)}`,
        { method: "DELETE", headers: mutation(), body: "{}" },
      );
    },

    async listModelProviders() {
      const envelope = await json(
        transport,
        "/api/v1/admin/model-providers",
        adminProviderListEnvelopeSchema,
      );
      return {
        items: envelope.data.items.map((p) =>
          mapAdminProviderDto(p, envelope.data.revision),
        ),
        revision: envelope.data.revision,
      };
    },
    async saveModelProvider(providerId, input) {
      const envelope = await json(
        transport,
        "/api/v1/admin/model-providers" +
          (providerId ? "/" + encodeURIComponent(providerId) : ""),
        adminProviderEnvelopeSchema,
        {
          method: providerId ? "PATCH" : "POST",
          headers: mutation(),
          body: JSON.stringify({
            connection: {
              name: input.connection.name,
              protocol: input.connection.protocol,
              base_url: input.connection.baseUrl,
              api_key: input.connection.apiKey,
            },
            expected_revision: input.expectedRevision,
            models: input.models.map((m) => ({
              id: m.id,
              display_name: m.displayName,
              description: m.description,
              provider_model_id: m.providerModelId,
              max_output_tokens: m.maxOutputTokens,
              output_mode: m.outputMode,
              enabled: m.enabled,
            })),
          }),
        },
      );
      return {
        provider: mapAdminProviderDto(
          envelope.data.provider,
          envelope.data.revision,
        ),
        revision: envelope.data.revision,
      };
    },
    async listModelConnections() {
      const envelope = await json(
        transport,
        "/api/v1/admin/model-connections",
        modelConnectionsEnvelopeSchema,
      );
      return envelope.data.items.map(mapModelConnectionDto);
    },
    async testModelConnection(input) {
      await json(
        transport,
        "/api/v1/admin/model-connection-test",
        modelConnectionTestEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify(modelBody(input)),
        },
      );
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
        revision: envelope.data.revision,
        items: envelope.data.items.map((item) =>
          mapAdminModelDto(item, envelope.data.revision),
        ),
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
          body: JSON.stringify(modelBody(input)),
        },
      );
      return mapAdminModelDto(envelope.data.model, envelope.data.revision);
    },
    async createModels(input) {
      const shared = modelBody({
        ...input,
        displayName: "",
        description: null,
        providerModelId: "",
        maxOutputTokens: null,
        outputMode: "prompt",
        enabled: false,
      });
      const envelope = await json(
        transport,
        "/api/v1/admin/models/batch",
        adminModelBatchEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify({
            connection_id: shared.connection_id,
            connection: shared.connection,
            expected_revision: input.expectedRevision,
            models: input.models.map((model) => ({
              display_name: model.displayName,
              description: model.description,
              provider_model_id: model.providerModelId,
              max_output_tokens: model.maxOutputTokens,
              output_mode: model.outputMode,
              enabled: model.enabled,
            })),
          }),
        },
      );
      return {
        items: envelope.data.items.map((model) =>
          mapAdminModelDto(model, envelope.data.revision),
        ),
        revision: envelope.data.revision,
      };
    },
    async updateModel(modelId, input, expectedRevision) {
      const body = modelBody({ ...input, expectedRevision });
      const envelope = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(modelId)}`,
        adminModelEnvelopeSchema,
        { method: "PATCH", headers: mutation(), body: JSON.stringify(body) },
      );
      return mapAdminModelDto(envelope.data.model, envelope.data.revision);
    },
    async setModelEnabled(modelId, enabled, expectedRevision) {
      const action = enabled ? "enable" : "disable";
      const envelope = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(modelId)}/${action}`,
        adminModelEnvelopeSchema,
        {
          method: "POST",
          headers: mutation(),
          body: JSON.stringify({ expected_revision: expectedRevision }),
        },
      );
      return mapAdminModelDto(envelope.data.model, envelope.data.revision);
    },
    async listGroups() {
      const envelope = await json(
        transport,
        "/api/v1/admin/groups",
        adminGroupsEnvelopeSchema,
      );
      return envelope.data.items.map((item) =>
        mapGroupDto(item, envelope.data.revision),
      );
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
            expected_revision: input.expectedRevision,
            priority: input.priority,
            rolling_24h_limit: input.rolling24hLimit,
            max_entries: input.maxEntries,
            allowed_lengths: input.allowedLengths,
            model_ids: input.modelIds,
          }),
        },
      );
      return mapGroupDto(envelope.data.group, envelope.data.revision);
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
    async changeUserGroup(userId, groupCode, expectedBaseRevision) {
      const envelope = await json(
        transport,
        `/api/v1/admin/users/${encodeURIComponent(userId)}/group`,
        userGroupChangeEnvelopeSchema,
        {
          method: "PUT",
          headers: mutation(),
          body: JSON.stringify({
            group_code: groupCode,
            confirmed: true,
            expected_base_revision: expectedBaseRevision,
          }),
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

async function streamGeneration(
  transport: RawHttpTransport,
  vault: TokenVault,
  input: Parameters<ApiPort["streamGeneration"]>[0],
  onEvent: (event: GenerationEventModel) => void,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const preset = "presetId" in input;
  const response = await transport.send(
    preset
      ? `/api/v1/presets/${encodeURIComponent(input.presetId)}/generations/stream`
      : "/api/v1/generations/stream",
    {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": vault.csrf(),
      },
      body: JSON.stringify(
        preset
          ? { published_version: input.publishedVersion }
          : {
              model_id: input.modelId,
              meaning_language: input.meaningLanguage,
              scenario: input.scenario,
              length: input.length,
              entries: input.entries,
            },
      ),
    },
  );
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

function modelBody(input: ModelConfigurationInput) {
  return {
    display_name: input.displayName,
    description: input.description,
    provider_model_id: input.providerModelId,
    connection_id: input.connectionId,
    connection: input.connection
      ? {
          name: input.connection.name,
          protocol: input.connection.protocol,
          base_url: input.connection.baseUrl,
          api_key: input.connection.apiKey,
        }
      : null,
    max_output_tokens: input.maxOutputTokens,
    output_mode: input.outputMode,
    enabled: input.enabled,
    expected_revision: input.expectedRevision,
  };
}
