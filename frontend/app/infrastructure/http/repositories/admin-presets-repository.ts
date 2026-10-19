import { createParser } from "eventsource-parser";
import type {
  AdminPresetsPort,
  PresetInputModel,
  PreviewEventModel,
} from "@application/admin/presets";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import { normalizeFailure } from "@application/shared/failure";
import {
  json,
  contractFailure,
  problemFromResponse,
} from "./repository-support";
import {
  adminGenerationOptionsEnvelopeSchema,
  adminPresetsEnvelopeSchema,
  adminPresetEnvelopeSchema,
  previewUsageEnvelopeSchema,
  previewCancelEnvelopeSchema,
  previewStartedSchema,
  previewValidatedSchema,
  previewFailedSchema,
  previewCancelledSchema,
  previewProgressSchema,
  previewPlanItemSchema,
  previewActivitySchema,
  previewDraftSchema,
  previewEditSchema,
  previewSettlementPendingSchema,
  previewStatusEnvelopeSchema,
} from "../schemas/admin-presets";
import {
  mapAdminGenerationOptions,
  mapAdminPreset,
} from "../mappers/admin-presets-mapper";
import { mapGenerationResultDto } from "../mappers/index";
import { mapUsage } from "../mappers/analytics-mapper";
const key = (id: string) => "preset-preview:" + id;
const path = (id: string) => "/api/v1/admin/presets/" + encodeURIComponent(id);
const encode = (input: PresetInputModel) => ({
  title: input.title,
  preview_content_mode: input.previewContentMode,
  configuration: {
    model_id: input.configuration.modelId,
    entries: [...input.configuration.entries],
    meaning_language: input.configuration.meaningLanguage,
    scenario: input.configuration.scenario,
    length: input.configuration.length,
  },
});
export function createAdminPresetsRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminPresetsPort {
  const init = (method: string, body: unknown): RequestInit => ({
    method,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
    },
    body: JSON.stringify(body),
  });
  const record = async (url: string, request?: RequestInit, id?: string) => {
    const d = (await json(transport, url, adminPresetEnvelopeSchema, request))
      .data;
    if (id && d.preset.id !== id) throw contractFailure();
    return { preset: mapAdminPreset(d.preset), revision: d.revision };
  };
  return {
    async getAdminGenerationOptions() {
      return mapAdminGenerationOptions(
        (
          await json(
            transport,
            "/api/v1/admin/generation-options",
            adminGenerationOptionsEnvelopeSchema,
          )
        ).data,
      );
    },
    async listAdminPresets(cursor) {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const d = await json(
        transport,
        "/api/v1/admin/presets?" + params,
        adminPresetsEnvelopeSchema,
      );
      return {
        items: d.data.items.map(mapAdminPreset),
        revision: d.data.revision,
        nextCursor: d.meta.next_cursor ?? null,
        hasMore: d.meta.has_more,
      };
    },
    getAdminPreset: (id) => record(path(id), undefined, id),
    saveAdminPreset: (input, id, expectedRevision) =>
      record(
        id ? path(id) : "/api/v1/admin/presets",
        init(id ? "PUT" : "POST", {
          ...encode(input),
          ...(id ? { expected_revision: expectedRevision } : {}),
        }),
        id,
      ),
    publishAdminPreset: (id, draftVersion, expectedRevision) =>
      record(
        path(id) + "/publish",
        init("POST", {
          draft_version: draftVersion,
          expected_revision: expectedRevision,
        }),
        id,
      ),
    unpublishAdminPreset: (id, expectedRevision) =>
      record(
        path(id) + "/unpublish",
        init("POST", { expected_revision: expectedRevision, confirmed: true }),
        id,
      ),
    async cancelPresetPreview(id) {
      const request = init("POST", {});
      request.headers = {
        ...request.headers,
        "x-preview-token": vault.confirmation(key(id)),
      };
      return (
        await json(
          transport,
          "/api/v1/admin/preset-previews/" + encodeURIComponent(id) + "/cancel",
          previewCancelEnvelopeSchema,
          request,
        )
      ).data.status;
    },
    async getPresetPreviewStatus(id, signal) {
      const headers = new Headers({
        "x-preview-token": vault.confirmation(key(id)),
      });
      const data = (
        await json(
          transport,
          "/api/v1/admin/preset-previews/" + encodeURIComponent(id) + "/status",
          previewStatusEnvelopeSchema,
          signal ? { headers, signal } : { headers },
        )
      ).data;
      if (data.preview_run_id !== id) throw contractFailure();
      const common = {
        runId: data.preview_run_id,
        draftVersion: data.draft_version,
        mode: data.preview_content_mode,
        usage: mapUsage(data.usage),
      };
      if (data.status === "active") return { ...common, status: "active" };
      if (data.status === "failed" || data.status === "cancelled")
        return { ...common, status: data.status };
      return {
        ...common,
        status: "valid",
        finalContentVersion: data.final_content_version!,
        result: data.result ? mapGenerationResultDto(data.result) : null,
        contentOutcome: data.content_outcome as Exclude<
          typeof data.content_outcome,
          null | "failed" | "cancelled"
        >,
        completionNotice: data.completion_notice,
      };
    },
    clearPresetPreview: (id) => vault.setConfirmation(key(id), null),
    streamPresetPreview: (id, version, mode, onEvent, signal) =>
      streamPreview(transport, vault, id, version, mode, onEvent, signal),
    async listPresetPreviewUsage(startDate, endDate, cursor) {
      const query = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        limit: "100",
      });
      if (cursor) query.set("cursor", cursor);
      const d = await json(
        transport,
        "/api/v1/admin/preset-preview-usage?" + query,
        previewUsageEnvelopeSchema,
      );
      return {
        summary: mapUsage(d.data.summary),
        nextCursor: d.meta.next_cursor ?? null,
        hasMore: d.meta.has_more,
        items: d.data.items.map((r) => ({
          runId: r.preview_run_id,
          presetId: r.preset_id,
          draftVersion: r.draft_version,
          status: r.status,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          usage: mapUsage(r.usage),
        })),
      };
    },
  };
}
async function streamPreview(
  transport: RawHttpTransport,
  vault: TokenVault,
  id: string,
  version: string,
  mode: "basic" | "enhanced",
  onEvent: (event: PreviewEventModel) => void,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const response = await transport.send(path(id) + "/previews/stream", {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
    },
    body: JSON.stringify({
      draft_version: version,
      preview_content_mode: mode,
    }),
  });
  if (!response.ok) throw await problemFromResponse(response);
  const requestId = response.headers.get("x-request-id"),
    invalid = () => ({ ...contractFailure(), requestId });
  if (
    !response.headers.get("content-type")?.startsWith("text/event-stream") ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw invalid();
  }
  let runId: string | null = null,
    terminal = false,
    parseError: ReturnType<typeof normalizeFailure> | null = null,
    previousEvent: string | null = null,
    previousWire: string | null = null;
  const parser = createParser({
    maxBufferSize: 32 * 1_048_576,
    onError() {
      if (!terminal) parseError = invalid();
    },
    onEvent(message) {
      if (terminal || parseError) return;
      try {
        const eventName = message.event ?? "";
        const raw: unknown = JSON.parse(message.data);
        const wire = `${eventName}\n${JSON.stringify(raw)}`;
        if (
          runId !== null &&
          eventName === "preview.started" &&
          previousEvent === "preview.started" &&
          previousWire === wire
        )
          return;
        if (
          (runId === null && eventName !== "preview.started") ||
          (runId !== null && eventName === "preview.started")
        )
          throw invalid();
        let event: PreviewEventModel;
        switch (eventName) {
          case "preview.started": {
            const d = previewStartedSchema.parse(raw);
            if (d.draft_version !== version || d.preview_content_mode !== mode)
              throw invalid();
            runId = d.preview_run_id;
            vault.setConfirmation(key(runId), d.preview_token);
            event = {
              kind: "started",
              seq: d.seq,
              runId,
              streamId: d.stream_id,
              draftVersion: d.draft_version,
              mode: d.preview_content_mode,
              contentService: {
                nativeValidation: true,
                contentReviewEnabled: d.content_service.content_review_enabled,
                contentRepairLimit: d.content_service.content_repair_limit,
              } as Extract<
                PreviewEventModel,
                { kind: "started" }
              >["contentService"],
              nativeCorrectionPolicy: {
                version: d.native_correction_policy.version,
                scope: d.native_correction_policy.scope,
                maxCalls: d.native_correction_policy.max_calls,
                editable: d.native_correction_policy.editable,
              },
            };
            break;
          }
          case "preview.progress": {
            const d = previewProgressSchema.parse(raw);
            event = { kind: "progress", seq: d.seq, phase: d.phase };
            break;
          }
          case "preview.plan_item": {
            const d = previewPlanItemSchema.parse(raw);
            event = {
              kind: "plan_item",
              seq: d.seq,
              planId: d.plan_id,
              meaningLanguage: d.meaning_language,
              item: d.item,
            };
            break;
          }
          case "preview.activity": {
            const d = previewActivitySchema.parse(raw);
            event = { kind: "activity", seq: d.seq, activity: d.activity };
            break;
          }
          case "preview.draft": {
            const d = previewDraftSchema.parse(raw);
            const common = {
              kind: "draft" as const,
              seq: d.seq,
              draftId: d.draft_id,
              contentVersion: d.content_version,
              baseRev: d.base_rev,
            };
            if (d.action === "begin")
              event = { ...common, action: "begin", mode: d.mode };
            else if (d.action === "paragraph_complete")
              event = {
                ...common,
                action: "paragraph_complete",
                paragraphIndex: d.paragraph_index,
              };
            else if (d.action === "body_complete")
              event = {
                ...common,
                action: "body_complete",
                bodyLength: d.body_length,
                paragraphCount: d.paragraph_count,
              };
            else event = { ...common, action: "discard" };
            break;
          }
          case "preview.edit": {
            const d = previewEditSchema.parse(raw);
            event = {
              kind: "edit",
              seq: d.seq,
              draftId: d.draft_id,
              contentVersion: d.content_version,
              baseRev: d.base_rev,
              rev: d.rev,
              at: d.at,
              deleteCount: d.delete_count,
              insert: d.insert,
              source: d.source,
            };
            break;
          }
          case "preview.validated": {
            const d = previewValidatedSchema.parse(raw);
            if (
              d.preview_run_id !== runId ||
              d.draft_version !== version ||
              d.preview_content_mode !== mode
            )
              throw invalid();
            event = {
              kind: "validated",
              seq: d.seq,
              runId: d.preview_run_id,
              draftVersion: d.draft_version,
              result: mapGenerationResultDto(d.result),
              usage: mapUsage(d.usage),
              mode: d.preview_content_mode,
              finalContentVersion: d.final_content_version,
              contentOutcome: d.content_outcome,
              completionNotice: d.completion_notice,
            };
            terminal = true;
            break;
          }
          case "preview.failed": {
            const d = previewFailedSchema.parse(raw);
            event = {
              kind: "failed",
              seq: d.seq,
              code: d.code,
              retryable: d.retryable,
              requestId: d.request_id,
            };
            terminal = true;
            break;
          }
          case "preview.cancelled":
            event = {
              kind: "cancelled",
              seq: previewCancelledSchema.parse(raw).seq,
            };
            terminal = true;
            break;
          case "preview.settlement_pending": {
            const d = previewSettlementPendingSchema.parse(raw);
            event = {
              kind: "settlement_pending",
              seq: d.seq,
              requestId: d.request_id,
            };
            terminal = true;
            break;
          }
          default:
            throw invalid();
        }
        onEvent(event);
        previousEvent = eventName;
        previousWire = wire;
      } catch (error) {
        parseError = { ...normalizeFailure(error), requestId };
      }
    },
  });
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true }),
    abort = () => {
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
      if (item.done && !terminal)
        throw {
          ...normalizeFailure(new Error("Incomplete preview stream")),
          requestId,
        };
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    if (runId && terminal) {
      // Keep valid/pending capabilities for the required status/readback path.
    }
  }
}
