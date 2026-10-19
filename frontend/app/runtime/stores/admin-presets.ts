import type {
  AdminPresetModel,
  AdminPresetRecord,
  AdminPreviewOptions,
  PresetInputModel,
  PreviewStreamState,
} from "@application/admin/presets";
import type { AppFailure } from "@application/shared/models";
import { initialContentDraftState } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
import {
  applyDraftEdit,
  applyDraftEvent,
  authoritativeDraftState,
  freezeDraftState,
} from "@application/generation/draft-reducer";
const initialPreviewStream = (): PreviewStreamState => ({
  phase: "idle",
  runId: null,
  text: "",
  draft: initialContentDraftState(),
  activity: null,
  presetId: null,
  draftVersion: null,
  planId: null,
  planMeaningLanguage: null,
  planItems: [],
  lastSeq: 0,
  lastFrame: null,
  requestPhase: null,
  mode: null,
  acceptedContentService: null,
  result: null,
  finalContentVersion: null,
  contentOutcome: null,
  completionNotice: null,
  usage: null,
  resultUnavailable: false,
});
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
    retryAt: null as number | null,
  }));
  const failure = shallowRef<AppFailure | null>(null),
    busy = ref(false),
    stream = shallowRef<PreviewStreamState>(initialPreviewStream());
  let controller: AbortController | null = null,
    reconciliationController: AbortController | null = null,
    reconciliationPromise: Promise<void> | null = null,
    reconciliationRunId: string | null = null,
    cooldownTimer: ReturnType<typeof setTimeout> | null = null,
    streamSequence = 0;
  function clearFrame() {
    // The server already coalesces public edits; no client text queue survives an epoch.
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
  const contractFailure = (): AppFailure => ({
    kind: "contract_violation",
    code: "contract_violation",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  });
  function failContract() {
    stream.value = {
      ...stream.value,
      phase: "pending",
      activity: null,
      draft: freezeDraftState(stream.value.draft),
      text: stream.value.draft.published,
    };
    failure.value = contractFailure();
    controller?.abort();
  }
  function applyCooldown(seconds: number) {
    const retryAt = Date.now() + seconds * 1_000;
    state.value.retryAt = retryAt;
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(
      () => {
        cooldownTimer = null;
        if (state.value.retryAt === retryAt) state.value.retryAt = null;
      },
      Math.max(0, retryAt - Date.now()),
    );
  }
  function binding(id: string) {
    return state.value.items.find((item) => item.id === id) ?? null;
  }
  async function runReconciliation(
    id: string,
    version: string,
    mode: "basic" | "enhanced",
    current: () => boolean,
    automatic = true,
  ) {
    const runId = stream.value.runId;
    if (!runId || !current()) return;
    const deadline = Date.now() + 10_000;
    do {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return;
      const statusController = new AbortController();
      reconciliationController?.abort();
      reconciliationController = statusController;
      const timeout = setTimeout(() => statusController.abort(), remaining);
      try {
        const status = await api.getPresetPreviewStatus(
          runId,
          statusController.signal,
        );
        if (!current()) return;
        if (status.draftVersion !== version || status.mode !== mode) {
          failContract();
          return;
        }
        if (status.status === "active") {
          stream.value = {
            ...stream.value,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(stream.value.draft),
            text: stream.value.draft.published,
          };
        } else if (status.status === "valid") {
          const record = binding(id);
          if (
            status.result &&
            record &&
            JSON.stringify(
              status.result.targets.map((target) => target.entry),
            ) !== JSON.stringify(record.configuration.entries)
          ) {
            failContract();
            return;
          }
          stream.value = status.result
            ? {
                ...stream.value,
                phase: "validated",
                text: status.result.passage,
                activity: null,
                draft: authoritativeDraftState(
                  stream.value.draft,
                  status.result.passage,
                ),
                planItems: [],
                result: status.result,
                finalContentVersion: status.finalContentVersion,
                contentOutcome: status.contentOutcome,
                completionNotice: status.completionNotice,
                usage: status.usage,
                resultUnavailable: false,
              }
            : {
                ...stream.value,
                phase: "validated",
                activity: null,
                draft: freezeDraftState(stream.value.draft),
                result: null,
                finalContentVersion: status.finalContentVersion,
                contentOutcome: status.contentOutcome,
                completionNotice: status.completionNotice,
                usage: status.usage,
                resultUnavailable: true,
              };
          return;
        } else {
          stream.value = {
            ...initialPreviewStream(),
            phase: status.status,
            runId,
            presetId: id,
            draftVersion: version,
            mode,
            usage: status.usage,
          };
          return;
        }
      } catch (error) {
        if (!current()) return;
        if (statusController.signal.aborted && Date.now() >= deadline) return;
        const normalized = normalizeFailure(error);
        failure.value = normalized;
        stream.value = {
          ...stream.value,
          phase: "pending",
          activity: null,
          draft: freezeDraftState(stream.value.draft),
          text: stream.value.draft.published,
        };
        if (normalized.status === 404 || normalized.status === 410) return;
      } finally {
        clearTimeout(timeout);
        if (reconciliationController === statusController)
          reconciliationController = null;
      }
      if (!automatic || Date.now() + 2_000 >= deadline) return;
      const sleepController = new AbortController();
      reconciliationController = sleepController;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        sleepController.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
      if (reconciliationController === sleepController)
        reconciliationController = null;
    } while (current());
  }
  function reconcilePreview(
    id: string,
    version: string,
    mode: "basic" | "enhanced",
    current: () => boolean,
    automatic = true,
  ): Promise<void> {
    const runId = stream.value.runId;
    if (!runId || !current()) return Promise.resolve();
    if (reconciliationPromise && reconciliationRunId === runId)
      return reconciliationPromise;
    reconciliationController?.abort();
    const task = runReconciliation(id, version, mode, current, automatic);
    const shared = task.finally(() => {
      if (reconciliationPromise === shared) {
        reconciliationPromise = null;
        reconciliationRunId = null;
      }
    });
    reconciliationPromise = shared;
    reconciliationRunId = runId;
    return reconciliationPromise;
  }
  async function preview(
    id: string,
    version: string,
    mode: "basic" | "enhanced",
  ) {
    if (
      controller ||
      (state.value.retryAt !== null && state.value.retryAt > Date.now())
    )
      return;
    const epoch = session.epoch.value,
      sequence = ++streamSequence;
    controller = new AbortController();
    const active = controller;
    clearFrame();
    failure.value = null;
    stream.value = {
      ...initialPreviewStream(),
      phase: "starting",
      presetId: id,
      draftVersion: version,
      mode,
    };
    const current = () =>
      epoch === session.epoch.value && sequence === streamSequence;
    let postDispatched = false;
    try {
      await session.refreshSecurityContext();
      if (!current()) return;
      postDispatched = true;
      await api.streamPresetPreview(
        id,
        version,
        mode,
        (event) => {
          if (!current()) return;
          const frame = JSON.stringify(event);
          if (
            event.seq === stream.value.lastSeq &&
            frame === stream.value.lastFrame
          )
            return;
          if (event.seq !== stream.value.lastSeq + 1) return failContract();
          const next = {
            ...stream.value,
            lastSeq: event.seq,
            lastFrame: frame,
          };
          if (event.kind === "started") {
            if (
              stream.value.runId ||
              event.draftVersion !== version ||
              event.mode !== mode ||
              event.contentService.contentReviewEnabled !==
                (mode === "enhanced") ||
              event.contentService.contentRepairLimit !==
                (mode === "enhanced" ? 1 : 0)
            )
              return failContract();
            stream.value = {
              ...next,
              phase: "streaming",
              runId: event.runId,
              requestPhase: "accepted",
              acceptedContentService: event.contentService,
            };
          } else if (event.kind === "progress") {
            const allowed =
              (event.phase === "planning" &&
                stream.value.requestPhase === "accepted") ||
              (event.phase === "composing" &&
                stream.value.requestPhase === "planning") ||
              (event.phase === "finalizing" &&
                stream.value.requestPhase === "composing");
            if (!allowed) return failContract();
            stream.value = {
              ...next,
              requestPhase: event.phase,
              activity:
                event.phase === "finalizing" ? null : stream.value.activity,
            };
          } else if (event.kind === "plan_item") {
            const record = binding(id);
            const entry =
              event.item.kind === "word_use" ? event.item.entry : null;
            const duplicate =
              event.item.kind === "scene"
                ? stream.value.planItems.some((item) => item.kind === "scene")
                : stream.value.planItems.some(
                    (item) => item.kind === "word_use" && item.entry === entry,
                  );
            if (
              stream.value.requestPhase !== "planning" ||
              (stream.value.planId !== null &&
                stream.value.planId !== event.planId) ||
              (stream.value.planMeaningLanguage !== null &&
                stream.value.planMeaningLanguage !== event.meaningLanguage) ||
              event.meaningLanguage !== record?.configuration.meaningLanguage ||
              (event.item.kind === "word_use" &&
                !record.configuration.entries.includes(event.item.entry)) ||
              duplicate
            )
              return failContract();
            stream.value = {
              ...next,
              planId: event.planId,
              planMeaningLanguage: event.meaningLanguage,
              planItems: [...stream.value.planItems, event.item],
            };
          } else if (event.kind === "activity") {
            if (stream.value.requestPhase !== "composing")
              return failContract();
            stream.value = { ...next, activity: event.activity };
          } else if (event.kind === "draft") {
            const maxVersion = mode === "basic" ? 1 : 3;
            if (
              stream.value.requestPhase !== "composing" ||
              event.contentVersion > maxVersion
            )
              return failContract();
            const reduced = applyDraftEvent(stream.value.draft, event);
            if (!reduced.ok) return failContract();
            stream.value = {
              ...next,
              draft: reduced.state,
              text: reduced.state.published,
            };
          } else if (event.kind === "edit") {
            if (stream.value.requestPhase !== "composing")
              return failContract();
            const reduced = applyDraftEdit(stream.value.draft, event);
            if (!reduced.ok) return failContract();
            stream.value = {
              ...next,
              draft: reduced.state,
              text: reduced.state.published,
            };
          } else if (event.kind === "validated") {
            const record = binding(id);
            if (
              stream.value.requestPhase !== "finalizing" ||
              event.runId !== stream.value.runId ||
              event.draftVersion !== version ||
              event.mode !== mode ||
              (mode === "basic"
                ? event.finalContentVersion !== 1 ||
                  event.contentOutcome !== "basic"
                : event.finalContentVersion > 3 ||
                  event.contentOutcome === "basic") ||
              !record ||
              JSON.stringify(
                event.result.targets.map((target) => target.entry),
              ) !== JSON.stringify(record.configuration.entries)
            )
              return failContract();
            clearFrame();
            stream.value = {
              ...next,
              phase: "validated",
              text: event.result.passage,
              draft: authoritativeDraftState(
                stream.value.draft,
                event.result.passage,
              ),
              activity: null,
              planItems: [],
              result: event.result,
              finalContentVersion: event.finalContentVersion,
              contentOutcome: event.contentOutcome,
              completionNotice: event.completionNotice,
              usage: event.usage,
              resultUnavailable: false,
            };
          } else if (event.kind === "cancelled") {
            clearFrame();
            stream.value = {
              ...initialPreviewStream(),
              phase: "cancelled",
              runId: stream.value.runId,
              presetId: id,
              draftVersion: version,
              mode,
              lastSeq: event.seq,
              lastFrame: frame,
            };
          } else if (event.kind === "settlement_pending") {
            stream.value = {
              ...next,
              phase: "pending",
              activity: null,
              draft: freezeDraftState(stream.value.draft),
              text: stream.value.draft.published,
            };
            failure.value = normalizeFailure({
              kind: "server",
              code: "settlement_unconfirmed",
              status: null,
              fields: {},
              requestId: event.requestId,
              retryable: true,
            });
            active.abort();
          } else {
            clearFrame();
            stream.value = {
              ...initialPreviewStream(),
              phase: "failed",
              runId: stream.value.runId,
              presetId: id,
              draftVersion: version,
              mode,
              lastSeq: event.seq,
              lastFrame: frame,
            };
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
      if (current() && stream.value.phase === "streaming") {
        stream.value = {
          ...stream.value,
          phase: "pending",
          activity: null,
          draft: freezeDraftState(stream.value.draft),
          text: stream.value.draft.published,
        };
        await reconcilePreview(id, version, mode, current);
      } else if (current() && stream.value.phase === "pending") {
        await reconcilePreview(id, version, mode, current);
      }
    } catch (error) {
      if (current() && stream.value.phase === "pending") {
        await reconcilePreview(id, version, mode, current);
      } else if (current() && !active.signal.aborted) {
        const normalized = normalizeFailure(error);
        failure.value = normalized;
        if (
          normalized.code === "generation_busy" &&
          normalized.accepted === false
        ) {
          applyCooldown(normalized.retryAfterSeconds ?? 1);
          stream.value = initialPreviewStream();
        } else if (stream.value.runId) {
          stream.value = {
            ...stream.value,
            phase: "pending",
            activity: null,
            draft: freezeDraftState(stream.value.draft),
            text: stream.value.draft.published,
          };
          await reconcilePreview(id, version, mode, current);
        } else {
          stream.value = postDispatched
            ? {
                ...stream.value,
                phase: "pending",
                activity: null,
                draft: freezeDraftState(stream.value.draft),
                text: stream.value.draft.published,
              }
            : { ...initialPreviewStream(), phase: "failed" };
        }
      }
    } finally {
      if (current()) {
        controller = null;
        try {
          const record = await read(id);
          if (
            current() &&
            stream.value.phase === "validated" &&
            !stream.value.resultUnavailable &&
            record?.preset.preview?.runId === stream.value.runId &&
            record.preset.draftVersion === version &&
            record.preset.preview.previewContentMode === mode
          )
            feedback.show("previewed");
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
      await api.cancelPresetPreview(id);
      if (epoch !== session.epoch.value || sequence !== streamSequence) return;
      const presetId = stream.value.presetId,
        version = stream.value.draftVersion,
        mode = stream.value.mode;
      if (!presetId || !version || !mode) return failContract();
      controller?.abort();
      stream.value = {
        ...stream.value,
        phase: "pending",
        activity: null,
        draft: freezeDraftState(stream.value.draft),
        text: stream.value.draft.published,
      };
      await reconcilePreview(
        presetId,
        version,
        mode,
        () => epoch === session.epoch.value && sequence === streamSequence,
      );
    } catch (error) {
      if (epoch === session.epoch.value)
        failure.value = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value) busy.value = false;
    }
  }
  async function recheck() {
    const id = stream.value.presetId,
      version = stream.value.draftVersion,
      mode = stream.value.mode,
      epoch = session.epoch.value,
      sequence = streamSequence;
    if (!id || !version || !mode || !stream.value.runId || controller) return;
    await reconcilePreview(
      id,
      version,
      mode,
      () => epoch === session.epoch.value && sequence === streamSequence,
      false,
    );
  }
  function dispose() {
    streamSequence++;
    controller?.abort();
    reconciliationController?.abort();
    controller = null;
    reconciliationController = null;
    reconciliationPromise = null;
    reconciliationRunId = null;
    clearFrame();
    if (stream.value.runId) api.clearPresetPreview(stream.value.runId);
    stream.value = initialPreviewStream();
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
    recheck,
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
