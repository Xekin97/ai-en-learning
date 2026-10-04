import { useAnalyticsEvents } from "@runtime/stores/analytics-events";
import { normalizeFailure } from "@application/shared/failure";
import type { AppFailure } from "@application/shared/models";
import type {
  SessionModel,
  DraftAttemptModel,
  ReceiptModel,
  ComparisonModel,
  LocalDraft,
  DraftKey,
  DraftNavigation,
} from "@application/review/models";
import {
  reviewDrafts,
  DraftConflict,
  InvalidDraft,
} from "@infrastructure/storage/review-drafts";
export function useReviewStore() {
  const analytics = useAnalyticsEvents();
  const app = useNuxtApp(),
    api = app.$api,
    identity = useSessionStore();
  const session = shallowRef<SessionModel | null>(null),
    attempt = shallowRef<DraftAttemptModel | null>(null),
    draft = shallowRef<LocalDraft | null>(null),
    comparison = shallowRef<ComparisonModel | null>(null),
    receipt = shallowRef<ReceiptModel | null>(null);
  const failure = shallowRef<AppFailure | null>(null),
    storageFailed = ref(false),
    restoreOpen = ref(false),
    phase = ref<
      | "loading"
      | "entry"
      | "editing"
      | "submitting"
      | "comparison"
      | "receipt"
      | "unavailable"
    >("loading");
  let key: DraftKey | null = null,
    stored: LocalDraft | null = null,
    localReadPending = false,
    localRevision = 0,
    dirty = 0,
    saved = 0,
    request = 0,
    flushing: Promise<void> | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    channel: BroadcastChannel | null = null;
  let newMasteries = 0,
    disposed = false;
  const accountId = () =>
    identity.actor.value?.kind === "account" ? identity.actor.value.id : null;
  const owns = (epoch: number, version: number) =>
    !disposed && epoch === identity.epoch.value && version === request;
  function clear() {
    ++request;
    clearTimeout(timer);
    session.value = null;
    attempt.value = null;
    draft.value = null;
    comparison.value = null;
    receipt.value = null;
    key = null;
    stored = null;
    localReadPending = false;
    localRevision = dirty = saved = 0;
    restoreOpen.value = false;
    phase.value = "entry";
    failure.value = null;
    storageFailed.value = false;
    newMasteries = 0;
  }
  watch(identity.epoch, clear, { flush: "sync" });
  function blank(value: DraftAttemptModel): LocalDraft {
    return {
      schemaVersion: 1,
      serverRevision: value.revision,
      localRevision: 0,
      wordInputs: Object.fromEntries(
        value.words.map((w) => [
          w.questionId,
          Array(
            w.slots.reduce(
              (n, s) => n + (s.kind === "letters" ? s.count : 0),
              0,
            ),
          ).fill("") as string[],
        ]),
      ),
      passageInputs: Object.fromEntries(
        value.passage.flatMap((s) =>
          s.kind === "blank" ? [[s.blankId, ""]] : [],
        ),
      ),
      navigation: {
        step: 0,
        stage: "editing",
        returnToOverview: false,
        focus: null,
      },
    };
  }
  function matches(value: LocalDraft, question: DraftAttemptModel) {
    const empty = blank(question);
    return (
      value.serverRevision === question.revision &&
      Object.keys(value.wordInputs).sort().join("|") ===
        Object.keys(empty.wordInputs).sort().join("|") &&
      Object.keys(value.passageInputs).sort().join("|") ===
        Object.keys(empty.passageInputs).sort().join("|") &&
      Object.entries(empty.wordInputs).every(
        ([id, slots]) => value.wordInputs[id]?.length === slots.length,
      ) &&
      value.navigation.step >= 0 &&
      value.navigation.step <= question.words.length
    );
  }
  async function readMatchingDraft(
    readingKey: DraftKey,
    question: DraftAttemptModel,
  ) {
    const found = await reviewDrafts.read(readingKey);
    if (found && !matches(found, question)) throw new InvalidDraft();
    return found;
  }
  async function accept(value: DraftAttemptModel, restore = true) {
    const epoch = identity.epoch.value,
      version = request;
    const owner = accountId();
    if (!owner) return;
    attempt.value = value;
    comparison.value = null;
    receipt.value = null;
    key = [owner, value.sessionId, value.attemptId];
    stored = null;
    localReadPending = true;
    restoreOpen.value = false;
    draft.value = blank(value);
    localRevision = dirty = saved = 0;
    storageFailed.value = false;
    phase.value = "editing";
    try {
      const found = await readMatchingDraft(key, value);
      if (!owns(epoch, version)) return;
      localReadPending = false;
      stored = found;
      if (stored) {
        localRevision = stored.localRevision;
        if (restore) {
          restoreOpen.value = true;
          phase.value = "entry";
        } else {
          draft.value = stored;
        }
      }
    } catch (error) {
      if (!owns(epoch, version)) return;
      storageFailed.value = true;
      // Storage availability must not gate learning. Unknown persisted data is
      // checked again before any later write; corrupt records still need restart.
      phase.value = error instanceof InvalidDraft ? "entry" : "editing";
    }
  }
  async function removeDraft() {
    if (!key) return;
    const removing = key,
      epoch = identity.epoch.value;
    try {
      await reviewDrafts.remove(removing);
      channel?.postMessage({ key: [...removing], invalid: true });
      if (epoch !== identity.epoch.value || key !== removing) return;
      localRevision = dirty = saved = 0;
      localReadPending = false;
      storageFailed.value = false;
    } catch {
      if (epoch === identity.epoch.value && key === removing)
        storageFailed.value = true;
    }
  }
  async function load(id: string, start = false) {
    const epoch = identity.epoch.value,
      version = ++request;
    phase.value = "loading";
    failure.value = null;
    comparison.value = null;
    try {
      const value = await api.getReviewSession(id);
      if (!owns(epoch, version)) return;
      session.value = value;
      // The server decides which local attempt is still resumable. Only keys are
      // examined here; answers never leave IndexedDB during reconciliation.
      const owner = accountId();
      if (owner && import.meta.client) {
        try {
          for (const localKey of await reviewDrafts.keys(owner)) {
            if (!owns(epoch, version)) return;
            if (
              localKey[1] === id &&
              localKey[2] !== value.currentAttempt?.attemptId
            )
              await reviewDrafts.remove(localKey);
          }
        } catch {
          if (owns(epoch, version)) storageFailed.value = true;
        }
      }
      if (!owns(epoch, version)) return;
      attempt.value = null;
      draft.value = null;
      receipt.value = null;
      restoreOpen.value = false;
      if (value.currentAttempt) {
        const read = await api.getReviewAttempt(value.currentAttempt.attemptId);
        if (!owns(epoch, version)) return;
        if (read.state === "draft") await accept(read.attempt);
        else {
          await reviewDrafts
            .remove([owner!, id, value.currentAttempt.attemptId])
            .catch(() => {
              storageFailed.value = true;
            });
          if (!owns(epoch, version)) return;
          session.value = read.session;
          phase.value = "receipt";
          if (read.state === "submitted") receipt.value = read.receipt;
        }
      } else if (value.status === "active" && start) {
        await begin();
      } else
        phase.value =
          value.status === "abandoned"
            ? "unavailable"
            : value.status === "completed"
              ? "receipt"
              : "entry";
    } catch (error) {
      if (owns(epoch, version)) {
        failure.value = normalizeFailure(error);
        if (failure.value.status === 401) {
          identity.invalidate();
          return;
        }
        phase.value = "unavailable";
      }
    }
  }
  async function begin() {
    const value = session.value;
    if (!value || value.status !== "active" || phase.value === "submitting")
      return;
    const epoch = identity.epoch.value,
      version = ++request;
    phase.value = "loading";
    comparison.value = null;
    try {
      await identity.refreshSecurityContext();
      if (!owns(epoch, version)) return;
      analytics.action("start_review");
      const result = await api.startReviewAttempt(value.sessionId);
      if (owns(epoch, version)) await accept(result);
    } catch (error) {
      if (owns(epoch, version)) {
        failure.value = normalizeFailure(error);
        if (failure.value.status === 401) {
          identity.invalidate();
          return;
        }
        phase.value = "entry";
      }
    }
  }
  function restore() {
    if (stored && attempt.value && matches(stored, attempt.value)) {
      draft.value = structuredClone(stored);
      localRevision = stored.localRevision;
      localReadPending = false;
      dirty = saved = 0;
      restoreOpen.value = false;
      storageFailed.value = false;
      phase.value = "editing";
    }
  }
  function closeRestore() {
    restoreOpen.value = false;
    phase.value = "entry";
  }
  async function checkLocal() {
    if (
      !key ||
      !attempt.value ||
      phase.value === "submitting" ||
      comparison.value
    )
      return;
    const checking = key,
      epoch = identity.epoch.value,
      version = request;
    try {
      const current = await readMatchingDraft(checking, attempt.value);
      if (!owns(epoch, version) || key !== checking) return;
      const wasPending = localReadPending;
      localReadPending = false;
      if (wasPending || (current?.localRevision ?? 0) !== localRevision) {
        stored = current;
        if (current) {
          storageFailed.value = true;
          restoreOpen.value = true;
        } else if (wasPending) {
          if (dirty === saved) storageFailed.value = false;
        } else if (session.value) await load(session.value.sessionId);
      }
    } catch (error) {
      if (owns(epoch, version) && key === checking) {
        storageFailed.value = true;
        if (error instanceof InvalidDraft) {
          localReadPending = true;
          phase.value = "entry";
        }
      }
    }
  }

  async function flush() {
    clearTimeout(timer);
    if (flushing) return flushing;
    if (receipt.value && storageFailed.value) {
      await removeDraft();
      return;
    }
    if (!key || !draft.value || !attempt.value || restoreOpen.value) return;
    const writingKey = key,
      question = attempt.value,
      epoch = identity.epoch.value;
    flushing = (async () => {
      if (localReadPending) {
        try {
          const found = await readMatchingDraft(writingKey, question);
          if (key !== writingKey || epoch !== identity.epoch.value) return;
          localReadPending = false;
          if (found) {
            stored = found;
            restoreOpen.value = true;
            storageFailed.value = true;
            return;
          }
          if (phase.value === "entry") phase.value = "editing";
          if (dirty === saved) storageFailed.value = false;
        } catch (error) {
          if (key !== writingKey || epoch !== identity.epoch.value) return;
          storageFailed.value = true;
          if (error instanceof InvalidDraft) phase.value = "entry";
          return;
        }
      }
      while (
        key === writingKey &&
        epoch === identity.epoch.value &&
        dirty !== saved &&
        !restoreOpen.value &&
        (phase.value === "editing" || phase.value === "submitting")
      ) {
        const snapshot = structuredClone(draft.value!),
          version = dirty;
        try {
          const writtenRevision = await reviewDrafts.write(
            writingKey,
            snapshot,
            localRevision,
          );
          if (key !== writingKey || epoch !== identity.epoch.value) return;
          localRevision = writtenRevision;
          saved = version;
          draft.value = { ...draft.value!, localRevision };
          storageFailed.value = false;
          channel?.postMessage({
            key: [...writingKey],
            revision: localRevision,
          });
        } catch (error) {
          if (key !== writingKey || epoch !== identity.epoch.value) return;
          storageFailed.value = true;
          if (error instanceof InvalidDraft) {
            localReadPending = true;
            phase.value = "entry";
          }
          if (error instanceof DraftConflict) {
            localReadPending = true;
            const other = await readMatchingDraft(writingKey, question).catch(
              () => null,
            );
            if (key !== writingKey || epoch !== identity.epoch.value) return;
            stored = other;
            restoreOpen.value = stored !== null;
            if (stored) localReadPending = false;
            else phase.value = "entry";
          }
          break;
        }
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }
  function change(update: (value: LocalDraft) => void) {
    if (!draft.value || phase.value !== "editing" || restoreOpen.value) return;
    const next = structuredClone(draft.value);
    update(next);
    draft.value = next;
    dirty++;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 0);
  }
  function word(id: string, values: string[]) {
    change((value) => {
      value.wordInputs[id] = values;
    });
  }
  function passage(id: string, value: string) {
    change((d) => {
      d.passageInputs[id] = value;
    });
  }
  function navigate(navigation: DraftNavigation) {
    change((value) => {
      value.navigation = navigation;
    });
    void flush();
  }
  function answerFor(question: DraftAttemptModel["words"][number]): string {
    const values = draft.value?.wordInputs[question.questionId] ?? [];
    if (!values.some((v) => v.trim())) return "";
    let index = 0;
    return question.slots
      .map((s) =>
        s.kind === "separator"
          ? s.text
          : Array.from({ length: s.count }, () => values[index++] || " ").join(
              "",
            ),
      )
      .join("")
      .trimEnd();
  }
  async function reconcile() {
    const active = attempt.value,
      epoch = identity.epoch.value,
      version = request;
    if (!active) return;
    const value = await api.getReviewAttempt(active.attemptId);
    if (!owns(epoch, version) || attempt.value !== active) return;
    if (value.state === "draft") {
      attempt.value = value.attempt;
      phase.value = "editing";
      return;
    }
    await removeDraft();
    if (!owns(epoch, version)) return;
    comparison.value = null;
    attempt.value = null;
    draft.value = null;
    session.value = value.session;
    if (value.state === "submitted") {
      receipt.value = value.receipt;
      phase.value = "receipt";
    } else await load(value.session.sessionId);
  }

  async function submit() {
    const active = attempt.value;
    if (
      !active ||
      !draft.value ||
      phase.value !== "editing" ||
      restoreOpen.value
    )
      return;
    const epoch = identity.epoch.value,
      version = ++request;
    phase.value = "submitting";
    await flush();
    if (!owns(epoch, version) || !draft.value) return;
    if (restoreOpen.value || phase.value !== "submitting") {
      if (phase.value === "submitting") phase.value = "editing";
      return;
    }
    failure.value = null;
    const input = {
      expectedRevision: active.revision,
      words: active.words.map((w) => ({
        questionId: w.questionId,
        answer: answerFor(w),
      })),
      passage: Object.entries(draft.value.passageInputs).map(
        ([blankId, answer]) => ({ blankId, answer }),
      ),
    };
    try {
      await identity.refreshSecurityContext();
      if (!owns(epoch, version)) return;
      if (Date.now() >= Date.parse(active.tokenExpiresAt)) {
        const renewed = await api.getReviewAttempt(active.attemptId);
        if (!owns(epoch, version)) return;
        if (renewed.state !== "draft") {
          await reconcile();
          return;
        }
      }
      const result = await api.submitReviewAttempt(active.attemptId, input);
      if (!owns(epoch, version)) return;
      await removeDraft();
      if (!owns(epoch, version)) return;
      session.value = result.session;
      receipt.value = result.receipt;
      draft.value = null;
      if (result.outcome === "submitted") {
        comparison.value = result.comparison;
        newMasteries = result.growth.newMasteries;
        phase.value = "comparison";
      } else {
        comparison.value = null;
        phase.value = "receipt";
      }
    } catch (error) {
      if (!owns(epoch, version)) return;
      failure.value = normalizeFailure(error);
      if (failure.value.status === 401) {
        identity.invalidate();
        return;
      }
      try {
        await reconcile();
      } catch {
        if (owns(epoch, version)) phase.value = "unavailable";
      }
    }
  }
  async function restart() {
    const active = attempt.value,
      settled = receipt.value,
      id = settled?.attemptId ?? active?.attemptId,
      revision = settled?.revision ?? active?.revision;
    if (!id || !revision || phase.value === "submitting") return;
    const epoch = identity.epoch.value,
      version = ++request;
    phase.value = "submitting";
    try {
      await identity.refreshSecurityContext();
      if (!owns(epoch, version)) return;
      const result = await api.restartReviewAttempt(id, revision);
      if (!owns(epoch, version)) return;
      await removeDraft();
      if (!owns(epoch, version)) return;
      session.value = result.session;
      restoreOpen.value = false;
      await accept(result.attempt);
    } catch (error) {
      if (owns(epoch, version)) {
        failure.value = normalizeFailure(error);
        if (failure.value.status === 401) {
          identity.invalidate();
          return;
        }
        phase.value = comparison.value
          ? "comparison"
          : draft.value
            ? "editing"
            : "entry";
      }
    }
  }
  function pageHide() {
    void flush();
    comparison.value = null;
    if (phase.value === "comparison") phase.value = "receipt";
  }
  function pageShow(event: PageTransitionEvent) {
    if (event.persisted && session.value) {
      comparison.value = null;
      void load(session.value.sessionId);
    }
  }
  function visible() {
    if (document.visibilityState === "hidden") void flush();
    else void checkLocal();
  }
  onMounted(() => {
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("wordweave-review-drafts");
    if (channel)
      channel.onmessage = (event) => {
        const data = event.data;
        if (key && JSON.stringify(data?.key) === JSON.stringify(key))
          void checkLocal();
      };
    window.addEventListener("focus", checkLocal);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", visible);
  });
  onScopeDispose(() => {
    void flush();
    disposed = true;
    ++request;
    comparison.value = null;
    channel?.close();
    channel = null;
    if (import.meta.server) return;
    window.removeEventListener("focus", checkLocal);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
    document.removeEventListener("visibilitychange", visible);
  });
  return {
    session: readonly(session),
    attempt: readonly(attempt),
    draft: readonly(draft),
    comparison: readonly(comparison),
    receipt: readonly(receipt),
    phase: readonly(phase),
    failure: readonly(failure),
    storageFailed: readonly(storageFailed),
    restoreOpen: readonly(restoreOpen),
    newMasteries: () => newMasteries,
    load,
    begin,
    restore,
    closeRestore,
    word,
    passage,
    navigate,
    answerFor,
    submit,
    restart,
    flush,
    checkLocal,
  };
}
