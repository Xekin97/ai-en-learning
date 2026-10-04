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
} from "../schemas/admin-presets";
import { passageDeltaEventSchema } from "../schemas/generation";
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
          confirmed: true,
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
    clearPresetPreview: (id) => vault.setConfirmation(key(id), null),
    streamPresetPreview: (id, version, onEvent, signal) =>
      streamPreview(transport, vault, id, version, onEvent, signal),
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
    body: JSON.stringify({ draft_version: version }),
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
    parseError: ReturnType<typeof normalizeFailure> | null = null;
  const parser = createParser({
    maxBufferSize: 1_048_576,
    onError() {
      if (!terminal) parseError = invalid();
    },
    onEvent(message) {
      if (terminal || parseError) return;
      try {
        if (
          (runId === null && message.event !== "preview.started") ||
          (runId !== null && message.event === "preview.started")
        )
          throw invalid();
        const raw: unknown = JSON.parse(message.data);
        let event: PreviewEventModel;
        switch (message.event) {
          case "preview.started": {
            const d = previewStartedSchema.parse(raw);
            runId = d.preview_run_id;
            vault.setConfirmation(key(runId), d.preview_token);
            event = { kind: "started", runId };
            break;
          }
          case "passage.delta":
            event = {
              kind: "delta",
              text: passageDeltaEventSchema.parse(raw).text,
            };
            break;
          case "preview.validated": {
            const d = previewValidatedSchema.parse(raw);
            if (d.preview_run_id !== runId || d.draft_version !== version)
              throw invalid();
            event = {
              kind: "validated",
              runId: d.preview_run_id,
              draftVersion: d.draft_version,
              result: mapGenerationResultDto(d.result),
              usage: mapUsage(d.usage),
            };
            terminal = true;
            break;
          }
          case "preview.failed": {
            const d = previewFailedSchema.parse(raw);
            event = {
              kind: "failed",
              code: d.code,
              retryable: d.retryable,
              requestId: d.request_id,
            };
            terminal = true;
            break;
          }
          case "preview.cancelled":
            previewCancelledSchema.parse(raw);
            event = { kind: "cancelled" };
            terminal = true;
            break;
          default:
            throw invalid();
        }
        onEvent(event);
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
    if (runId) vault.setConfirmation(key(runId), null);
  }
}
