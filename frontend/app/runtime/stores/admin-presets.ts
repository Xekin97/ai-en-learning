import type {
  AdminPresetModel,
  AdminPresetRecord,
  AdminPreviewOptions,
  PresetInputModel,
} from "@application/admin/presets";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useAdminPresetsStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState("admin-presets", () => ({
    items: [] as AdminPresetModel[],
    revision: null as string | null,
    options: null as AdminPreviewOptions | null,
    listFailure: null as AppFailure | null,
    optionsFailure: null as AppFailure | null,
    pending: false,
    request: 0,
    optionsRequest: 0,
  }));
  const failure = shallowRef<AppFailure | null>(null),
    busy = ref(false),
    stream = shallowRef({
      phase: "idle" as
        | "idle"
        | "starting"
        | "streaming"
        | "validated"
        | "failed"
        | "cancelled",
      runId: null as string | null,
      text: "",
      presetId: null as string | null,
    });
  let controller: AbortController | null = null,
    streamSequence = 0,
    frame: number | null = null,
    buffer = "";
  function clearFrame() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    buffer = "";
  }
  function flush() {
    if (buffer)
      stream.value = { ...stream.value, text: stream.value.text + buffer };
    buffer = "";
    frame = null;
  }
  function delta(text: string) {
    buffer += text;
    if (frame === null) frame = requestAnimationFrame(flush);
  }
  function keep(record: AdminPresetRecord) {
    state.value.revision = record.revision;
    const index = state.value.items.findIndex((p) => p.id === record.preset.id);
    if (index < 0) state.value.items.unshift(record.preset);
    else state.value.items[index] = record.preset;
  }
  async function readOptions() {
    const epoch = session.epoch.value,
      request = ++state.value.optionsRequest;
    state.value.optionsFailure = null;
    try {
      const value = await api.getAdminGenerationOptions();
      if (
        epoch === session.epoch.value &&
        request === state.value.optionsRequest
      )
        state.value.options = value;
    } catch (error) {
      if (
        epoch === session.epoch.value &&
        request === state.value.optionsRequest
      )
        state.value.optionsFailure = normalizeFailure(error);
    }
  }
  async function load() {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.listFailure = null;
    try {
      let cursor: string | undefined,
        revision: string | null = null;
      const items = new Map<string, AdminPresetModel>(),
        seen = new Set<string>();
      do {
        const page = await api.listAdminPresets(cursor);
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        if (revision !== null && revision !== page.revision)
          throw new Error("Preset configuration changed during pagination");
        revision = page.revision;
        page.items.forEach((p) => items.set(p.id, p));
        cursor = page.nextCursor ?? undefined;
        if (cursor && seen.has(cursor))
          throw new Error("Repeated preset cursor");
        if (cursor) seen.add(cursor);
      } while (cursor);
      state.value.items = [...items.values()];
      state.value.revision = revision;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.listFailure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function read(id: string) {
    const epoch = session.epoch.value;
    const value = await api.getAdminPreset(id);
    if (epoch !== session.epoch.value) return null;
    keep(value);
    return value;
  }
  async function command(
    operation: () => Promise<AdminPresetRecord>,
    message: string,
  ) {
    if (busy.value) return null;
    const epoch = session.epoch.value;
    busy.value = true;
    failure.value = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return null;
      const value = await operation();
      if (epoch !== session.epoch.value) return null;
      keep(value);
      feedback.show(message);
      return value;
    } catch (error) {
      if (epoch !== session.epoch.value) return null;
      const normalized = normalizeFailure(error);
      if (normalized.status === 401) session.invalidate();
      else failure.value = normalized;
      feedback.show("failed");
      throw normalized;
    } finally {
      if (epoch === session.epoch.value) busy.value = false;
    }
  }
  async function preview(id: string, version: string) {
    if (controller) return;
    const epoch = session.epoch.value,
      sequence = ++streamSequence;
    controller = new AbortController();
    const active = controller;
    clearFrame();
    failure.value = null;
    stream.value = { phase: "starting", runId: null, text: "", presetId: id };
    const current = () =>
      epoch === session.epoch.value && sequence === streamSequence;
    try {
      await session.refreshSecurityContext();
      if (!current()) return;
      await api.streamPresetPreview(
        id,
        version,
        (event) => {
          if (!current()) return;
          if (event.kind === "started")
            stream.value = {
              ...stream.value,
              phase: "streaming",
              runId: event.runId,
            };
          else if (event.kind === "delta") delta(event.text);
          else if (event.kind === "validated") {
            clearFrame();
            stream.value = {
              ...stream.value,
              phase: "validated",
              text: event.result.passage,
            };
          } else if (event.kind === "cancelled") {
            clearFrame();
            stream.value = { ...stream.value, phase: "cancelled" };
          } else {
            clearFrame();
            stream.value = { ...stream.value, phase: "failed" };
            failure.value = normalizeFailure({
              kind: "server",
              code: event.code,
              status: null,
              fields: {},
              requestId: event.requestId,
              retryable: event.retryable,
            });
          }
        },
        active.signal,
      );
    } catch (error) {
      if (current() && !active.signal.aborted) {
        flush();
        stream.value = { ...stream.value, phase: "failed" };
        failure.value = normalizeFailure(error);
      }
    } finally {
      if (current()) {
        controller = null;
        const phase = stream.value.phase;
        try {
          await read(id);
          if (current() && phase === "validated") feedback.show("previewed");
        } catch (error) {
          if (current()) failure.value = normalizeFailure(error);
        }
        await readOptions();
      }
    }
  }
  async function cancel() {
    const id = stream.value.runId;
    if (!id || busy.value) return;
    const epoch = session.epoch.value,
      sequence = streamSequence;
    busy.value = true;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const status = await api.cancelPresetPreview(id);
      if (epoch !== session.epoch.value || sequence !== streamSequence) return;
      if (status !== "valid") {
        controller?.abort();
        clearFrame();
        stream.value = {
          ...stream.value,
          phase: status === "failed" ? "failed" : "cancelled",
        };
      } else if (stream.value.presetId) {
        const record = await read(stream.value.presetId);
        if (epoch === session.epoch.value && record) {
          controller?.abort();
          clearFrame();
          stream.value = {
            ...stream.value,
            phase: "validated",
            text: record.preset.preview?.result.passage ?? "",
          };
        }
      }
    } catch (error) {
      if (epoch === session.epoch.value)
        failure.value = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value) busy.value = false;
    }
  }
  function dispose() {
    streamSequence++;
    controller?.abort();
    controller = null;
    clearFrame();
    if (stream.value.runId) api.clearPresetPreview(stream.value.runId);
    stream.value = { phase: "idle", runId: null, text: "", presetId: null };
    failure.value = null;
  }
  watch(session.epoch, dispose);
  return {
    state: readonly(state),
    failure: readonly(failure),
    busy: readonly(busy),
    stream: readonly(stream),
    load,
    readOptions,
    read,
    preview,
    cancel,
    dispose,
    save: (input: PresetInputModel, id?: string, revision?: string) =>
      command(() => api.saveAdminPreset(input, id, revision), "saved"),
    publish: (id: string, version: string, revision: string) =>
      command(
        () => api.publishAdminPreset(id, version, revision),
        "publish.ok",
      ),
    unpublish: (id: string, revision: string) =>
      command(() => api.unpublishAdminPreset(id, revision), "saved"),
  };
}
