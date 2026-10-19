import type {
  ConfigPortabilityCategory,
  PortabilityFailure,
  PortabilityPreview,
  PortabilityResult,
  SafeCurrentConfiguration,
} from "@application/admin/config-portability";
import {
  isPortabilityFailure,
  validPortabilityPassphrase,
} from "@application/admin/config-portability";
import { registerPrivateState } from "@runtime/session/private-state";
import {
  clearPortabilityRecovery,
  readPortabilityRecovery,
  recoveryFromPreview,
  savePortabilityRecovery,
  type PortabilityRecoveryRecord,
} from "@runtime/session/config-portability-recovery";

export type PortabilityPhase =
  | "closed"
  | "file"
  | "reading"
  | "preview"
  | "blocked"
  | "confirm"
  | "submitting"
  | "unknown"
  | "resolving"
  | "success"
  | "notApplied"
  | "resultExpired"
  | "tokenInvalid"
  | "error";

interface PortabilityState {
  open: boolean;
  mode: "import" | "export";
  category: ConfigPortabilityCategory | null;
  fileCategory: ConfigPortabilityCategory | null;
  phase: PortabilityPhase;
  fileName: string | null;
  encrypted: boolean;
  formatVersion: number | null;
  includeCredentials: boolean;
  preview: PortabilityPreview | null;
  result: PortabilityResult | null;
  current: SafeCurrentConfiguration | null;
  failure: PortabilityFailure | { kind: "local"; code: string } | null;
  acknowledged: boolean;
  downloadName: string | null;
  refreshFailed: boolean;
  retryAfterUntil: number | null;
}

interface PrivateContext {
  file: File | null;
  passphrase: string;
  passphraseConfirmation: string;
  controller: AbortController | null;
  recovery: PortabilityRecoveryRecord | null;
  sequence: number;
}

const contexts = new WeakMap<object, PrivateContext>();
const initialized = new WeakSet<object>();
const initialState = (): PortabilityState => ({
  open: false,
  mode: "import",
  category: null,
  fileCategory: null,
  phase: "closed",
  fileName: null,
  encrypted: false,
  formatVersion: null,
  includeCredentials: false,
  preview: null,
  result: null,
  current: null,
  failure: null,
  acknowledged: false,
  downloadName: null,
  refreshFailed: false,
  retryAfterUntil: null,
});
const freshPrivate = (): PrivateContext => ({
  file: null,
  passphrase: "",
  passphraseConfirmation: "",
  controller: null,
  recovery: null,
  sequence: 0,
});
const actorId = (session: ReturnType<typeof useSessionStore>) => {
  const actor = session.actor.value;
  return actor?.kind === "account" && actor.role === "admin" ? actor.id : null;
};
const bytesToBase64 = (bytes: Uint8Array) => {
  let result = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(result);
};

export function useConfigPortabilityStore() {
  const app = useNuxtApp(),
    api = app.$api,
    session = useSessionStore();
  const state = useState<PortabilityState>("config-portability", initialState);
  let secret = contexts.get(app);
  if (!secret) {
    secret = freshPrivate();
    contexts.set(app, secret);
    const reset = ref(0);
    registerPrivateState(app, "config-portability-secrets", reset, () => {
      const current = contexts.get(app);
      current?.controller?.abort();
      contexts.set(app, freshPrivate());
      state.value = initialState();
      return 0;
    });
  }
  const currentSecret = () => contexts.get(app)!;
  const ticket = computed(() =>
    state.value.preview?.operationId
      ? recoveryFromPreview(state.value.preview)
      : currentSecret().recovery,
  );

  function invalidateRequests() {
    const value = currentSecret();
    value.sequence++;
    value.controller?.abort();
    value.controller = null;
  }
  function clearSecrets(clearFile = true) {
    const value = currentSecret();
    value.passphrase = "";
    value.passphraseConfirmation = "";
    if (clearFile) value.file = null;
  }
  function clearOperation() {
    invalidateRequests();
    clearSecrets();
    const id = actorId(session);
    if (id) clearPortabilityRecovery(id);
    currentSecret().recovery = null;
  }
  function open(
    category: ConfigPortabilityCategory,
    mode: "import" | "export" = "import",
  ) {
    const id = actorId(session);
    if (!id) return;
    const recovery = readPortabilityRecovery(id);
    if (recovery) {
      currentSecret().recovery = recovery;
      state.value = {
        ...initialState(),
        open: true,
        mode: "import",
        category: recovery.category,
        phase: "unknown",
      };
      return;
    }
    clearOperation();
    state.value = {
      ...initialState(),
      open: true,
      mode,
      category,
      phase: "file",
    };
  }
  function close() {
    if (["reading", "submitting", "resolving"].includes(state.value.phase))
      return;
    if (state.value.phase === "unknown") {
      state.value.open = false;
      return;
    }
    clearOperation();
    state.value = initialState();
  }
  function prepareRouteLeave() {
    if (["submitting", "resolving"].includes(state.value.phase)) return false;
    if (state.value.phase === "unknown") {
      state.value.open = false;
      return true;
    }
    clearOperation();
    state.value = initialState();
    return true;
  }
  function setPassphrase(value: string, confirmation?: string) {
    currentSecret().passphrase = value;
    if (confirmation !== undefined)
      currentSecret().passphraseConfirmation = confirmation;
    state.value.failure = null;
  }
  function setIncludeCredentials(value: boolean) {
    state.value.includeCredentials = value;
    setPassphrase("", "");
  }
  async function selectFile(file: File) {
    invalidateRequests();
    clearSecrets();
    state.value.preview = null;
    state.value.result = null;
    state.value.current = null;
    state.value.acknowledged = false;
    state.value.failure = null;
    if (file.size === 0 || file.size > 8 * 1024 * 1024) {
      state.value.phase = "error";
      state.value.failure = { kind: "local", code: "file_size" };
      return;
    }
    try {
      const outer = JSON.parse(await file.text()) as Record<string, unknown>;
      if (!outer || typeof outer !== "object" || Array.isArray(outer))
        throw new Error();
      const category = outer.category;
      const fileCategory =
        typeof category === "string" &&
        ["models", "plans", "items", "growth"].includes(category)
          ? (category as ConfigPortabilityCategory)
          : null;
      state.value.fileCategory = fileCategory;
      if (fileCategory && fileCategory !== state.value.category) {
        state.value.phase = "error";
        state.value.failure = { kind: "local", code: "category_mismatch" };
        return;
      }
      const encrypted =
        outer.format === "wordweave-config-encrypted" &&
        outer.credential_mode === "encrypted";
      if (encrypted && state.value.category !== "models") throw new Error();
      currentSecret().file = file;
      state.value.fileName = file.name || null;
      state.value.encrypted = encrypted;
      state.value.formatVersion =
        typeof outer.version === "number" ? outer.version : null;
      state.value.phase = "file";
    } catch {
      state.value.phase = "error";
      state.value.failure = { kind: "local", code: "unsupported_format" };
    }
  }
  async function preview() {
    const value = currentSecret(),
      file = value.file,
      category = state.value.category;
    if (!file || !category || state.value.phase === "reading") return;
    if (
      state.value.encrypted &&
      !validPortabilityPassphrase(value.passphrase)
    ) {
      state.value.failure = { kind: "local", code: "password_invalid" };
      return;
    }
    const request = ++value.sequence,
      epoch = session.epoch.value;
    value.controller = new AbortController();
    state.value.phase = "reading";
    state.value.failure = null;
    try {
      await session.refreshSecurityContext();
      if (
        request !== value.sequence ||
        epoch !== session.epoch.value ||
        category !== state.value.category
      )
        return;
      const fileBase64 = bytesToBase64(
        new Uint8Array(await file.arrayBuffer()),
      );
      const result = await api.previewConfiguration({
        category,
        fileBase64,
        ...(state.value.encrypted ? { passphrase: value.passphrase } : {}),
        signal: value.controller.signal,
      });
      if (
        request !== value.sequence ||
        epoch !== session.epoch.value ||
        category !== state.value.category
      )
        return;
      state.value.preview = result;
      state.value.phase = result.canCommit ? "preview" : "blocked";
    } catch (error) {
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      state.value.failure = isPortabilityFailure(error)
        ? error
        : { kind: "local", code: "contract_or_network" };
      state.value.phase = "error";
    } finally {
      if (request === value.sequence) value.controller = null;
    }
  }
  function beginConfirm() {
    const preview = state.value.preview;
    if (
      !preview?.canCommit ||
      !preview.commitNotAfter ||
      Date.now() >= Date.parse(preview.commitNotAfter)
    )
      return;
    state.value.acknowledged = false;
    state.value.phase = "confirm";
  }
  function setAcknowledged(value: boolean) {
    state.value.acknowledged = value;
  }
  async function submit() {
    const value = currentSecret(),
      preview = state.value.preview,
      category = state.value.category,
      id = actorId(session),
      file = value.file;
    if (
      !preview?.operationId ||
      !preview.previewToken ||
      !preview.commitNotAfter ||
      !id ||
      !category ||
      !file ||
      state.value.phase !== "confirm" ||
      !state.value.acknowledged ||
      Date.now() >= Date.parse(preview.commitNotAfter)
    )
      return;
    const request = ++value.sequence,
      epoch = session.epoch.value;
    state.value.phase = "submitting";
    state.value.failure = null;
    try {
      await session.refreshSecurityContext();
    } catch (error) {
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      state.value.failure = isPortabilityFailure(error)
        ? error
        : { kind: "local", code: "contract_or_network" };
      state.value.phase = "error";
      return;
    }
    if (
      request !== value.sequence ||
      epoch !== session.epoch.value ||
      category !== state.value.category
    )
      return;
    let recovery: PortabilityRecoveryRecord;
    try {
      recovery = recoveryFromPreview(preview);
      savePortabilityRecovery(id, recovery);
    } catch {
      state.value.failure = { kind: "local", code: "recovery_unavailable" };
      state.value.phase = "error";
      return;
    }
    value.recovery = recovery;
    const passphrase = state.value.encrypted ? value.passphrase : undefined;
    try {
      const fileBase64 = bytesToBase64(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      const pending = api.importConfiguration({
        category,
        fileBase64,
        operationId: preview.operationId,
        previewToken: preview.previewToken,
        ...(passphrase !== undefined ? { passphrase } : {}),
      });
      clearSecrets();
      const result = await pending;
      if (
        request !== value.sequence ||
        epoch !== session.epoch.value ||
        category !== state.value.category
      )
        return;
      state.value.result = result;
      state.value.phase =
        result.status === "applied" ? "success" : "notApplied";
    } catch (error) {
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      clearSecrets();
      state.value.failure = isPortabilityFailure(error)
        ? error
        : { kind: "local", code: "outcome_unknown" };
      state.value.phase = "unknown";
    }
  }
  async function resolve() {
    const value = currentSecret(),
      recovery = value.recovery ?? ticket.value,
      id = actorId(session);
    if (
      !recovery ||
      !id ||
      state.value.phase === "resolving" ||
      (state.value.retryAfterUntil ?? 0) > Date.now()
    )
      return;
    const request = ++value.sequence,
      epoch = session.epoch.value;
    state.value.phase = "resolving";
    try {
      await session.refreshSecurityContext();
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      const result = await api.resolveConfigurationOperation({
        category: recovery.category,
        operationId: recovery.operation_id,
        previewToken: recovery.preview_token,
      });
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      state.value.result = result;
      state.value.phase =
        result.status === "applied" ? "success" : "notApplied";
    } catch (error) {
      if (request !== value.sequence || epoch !== session.epoch.value) return;
      const failure = isPortabilityFailure(error) ? error : null;
      state.value.failure = failure ?? {
        kind: "local",
        code: "outcome_unknown",
      };
      if (failure?.code === "result_expired")
        state.value.phase = "resultExpired";
      else if (failure?.code === "recovery_token_invalid")
        state.value.phase = "tokenInvalid";
      else {
        state.value.phase = "unknown";
        state.value.retryAfterUntil = failure?.retryAfterSeconds
          ? Date.now() + failure.retryAfterSeconds * 1000
          : null;
      }
    }
  }
  async function readCurrent() {
    const category = state.value.category;
    if (!category) return;
    try {
      state.value.current = await api.getCurrentConfiguration(category);
    } catch (error) {
      state.value.failure = isPortabilityFailure(error)
        ? error
        : { kind: "local", code: "current_failed" };
    }
  }
  async function exportFile() {
    const category = state.value.category,
      value = currentSecret();
    if (!category) return;
    if (
      state.value.includeCredentials &&
      (!validPortabilityPassphrase(value.passphrase) ||
        value.passphrase !== value.passphraseConfirmation)
    ) {
      state.value.failure = { kind: "local", code: "password_invalid" };
      return;
    }
    try {
      await session.refreshSecurityContext();
      const result = await api.exportConfiguration({
        category,
        includeCredentials: state.value.includeCredentials,
        ...(state.value.includeCredentials
          ? {
              passphrase: value.passphrase,
              passphraseConfirmation: value.passphraseConfirmation,
            }
          : {}),
      });
      const url = URL.createObjectURL(result.blob),
        link = document.createElement("a");
      link.href = url;
      link.download = result.safeFilename;
      link.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
      state.value.downloadName = result.safeFilename;
      setPassphrase("", "");
    } catch (error) {
      state.value.failure = isPortabilityFailure(error)
        ? error
        : { kind: "local", code: "export_failed" };
    }
  }
  function startNewPreview() {
    clearOperation();
    const category = state.value.category;
    state.value = {
      ...initialState(),
      open: true,
      mode: "import",
      category,
      phase: "file",
    };
  }
  function markRefreshFailed(value: boolean) {
    state.value.refreshFailed = value;
  }

  if (import.meta.client && !initialized.has(app)) {
    initialized.add(app);
    const id = actorId(session);
    const recovery = id ? readPortabilityRecovery(id) : null;
    if (recovery) {
      currentSecret().recovery = recovery;
      state.value = {
        ...initialState(),
        open: true,
        mode: "import",
        category: recovery.category,
        phase: "unknown",
      };
    }
  }

  return {
    state: readonly(state),
    passphrase: computed(() => currentSecret().passphrase),
    passphraseConfirmation: computed(
      () => currentSecret().passphraseConfirmation,
    ),
    ticket,
    open,
    close,
    prepareRouteLeave,
    selectFile,
    setPassphrase,
    setIncludeCredentials,
    preview,
    beginConfirm,
    setAcknowledged,
    submit,
    resolve,
    readCurrent,
    exportFile,
    startNewPreview,
    markRefreshFailed,
  };
}
