import type {
  PronunciationAccent,
  PronunciationOption,
  PronunciationRegistration,
  PronunciationState,
  PronunciationVoice,
} from "./models";
import type {
  BrowserSpeechPort,
  PronunciationClock,
  PronunciationSpeechHandle,
} from "./ports";

type Listener = (state: PronunciationState) => void;

type Control = {
  registration: PronunciationRegistration;
  state: PronunciationState;
  listeners: Set<Listener>;
  selected: PronunciationOption | null;
};

const idleState = (
  entry: string,
  surfaceId: string,
  supported: boolean,
): PronunciationState => ({
  phase: "idle",
  supported,
  entry,
  surfaceId,
  options: [],
  selectedOptionId: null,
  selectionExplicit: false,
  failedSelection: null,
  actualSource: null,
  reason: null,
});

function englishVoices(voices: readonly PronunciationVoice[]) {
  return voices.filter(
    (voice) => voice.locale.toLowerCase().split("-")[0] === "en",
  );
}

function accentFor(locale: string): PronunciationAccent {
  const canonical = locale.toLowerCase();
  if (canonical === "en-gb" || canonical.startsWith("en-gb-")) return "uk";
  if (canonical === "en-us" || canonical.startsWith("en-us-")) return "us";
  return "neutral";
}

function stableVoices(voices: readonly PronunciationVoice[]) {
  return [...voices].sort((left, right) => {
    if (left.default !== right.default) return left.default ? -1 : 1;
    const locale = left.locale.localeCompare(right.locale);
    return locale || left.id.localeCompare(right.id);
  });
}

export function pronunciationOptions(
  voices: readonly PronunciationVoice[],
): readonly PronunciationOption[] {
  const representatives = new Map<PronunciationAccent, PronunciationVoice>();
  for (const voice of stableVoices(englishVoices(voices))) {
    const accent = accentFor(voice.locale);
    if (!representatives.has(accent)) representatives.set(accent, voice);
  }
  return [...representatives.entries()].map(([accent, voice]) => ({
    id: voice.id,
    locale: voice.locale,
    accent,
  }));
}

export class PronunciationCoordinator {
  private readonly controls = new Map<number, Control>();
  private nextRegistrationId = 1;
  private nextAttemptId = 1;
  private active:
    | {
        attemptId: number;
        controlId: number;
        handle: PronunciationSpeechHandle | null;
        preparationTimer: unknown | null;
        startTimer: unknown | null;
        endTimer: unknown | null;
      }
    | undefined;
  private removeVoicesListener: (() => void) | undefined;

  constructor(
    private readonly speech: BrowserSpeechPort,
    private readonly clock: PronunciationClock,
  ) {}

  start() {
    if (this.removeVoicesListener) return;
    this.removeVoicesListener = this.speech.onVoicesChanged(() => {
      const activeControlId = this.active?.controlId;
      this.refreshControls();
      const activeControl = activeControlId
        ? this.controls.get(activeControlId)
        : undefined;
      if (activeControl?.state.failedSelection) this.cancelActive();
      const active = this.active;
      if (active?.preparationTimer) this.tryPreparedSpeak(active.attemptId);
    });
  }

  dispose() {
    this.cancelAll();
    this.removeVoicesListener?.();
    this.removeVoicesListener = undefined;
    this.controls.clear();
  }

  register(entry: string, surfaceId: string): PronunciationRegistration {
    const registration = {
      id: this.nextRegistrationId++,
      entry,
      surfaceId,
    };
    const control: Control = {
      registration,
      state: idleState(entry, surfaceId, this.speech.supported()),
      listeners: new Set(),
      selected: null,
    };
    this.controls.set(registration.id, control);
    this.refresh(control);
    return registration;
  }

  release(registration: PronunciationRegistration) {
    const control = this.controls.get(registration.id);
    if (!control || control.registration !== registration) return;
    if (this.active?.controlId === registration.id) this.cancelActive("idle");
    this.controls.delete(registration.id);
  }

  subscribe(registration: PronunciationRegistration, listener: Listener) {
    const control = this.controls.get(registration.id);
    if (!control) return () => undefined;
    control.listeners.add(listener);
    listener(control.state);
    return () => control.listeners.delete(listener);
  }

  snapshot(registration: PronunciationRegistration) {
    return this.controls.get(registration.id)?.state;
  }

  play(registration: PronunciationRegistration) {
    const control = this.controls.get(registration.id);
    if (!control) return;
    if (!control.state.supported) {
      this.update(control, { phase: "error", reason: "failed" });
      return;
    }
    this.cancelActive("idle");
    this.refresh(control);
    const selected = this.resolveSelection(control);
    if (selected) {
      this.beginSpeak(control, selected);
      return;
    }
    if (control.state.selectionExplicit) return;
    this.update(control, { phase: "preparing", reason: null });
    const attemptId = this.nextAttemptId++;
    this.active = {
      attemptId,
      controlId: registration.id,
      handle: null,
      preparationTimer: this.clock.setTimeout(() => {
        if (!this.isCurrent(attemptId, registration.id)) return;
        this.fail(control, "timeout");
      }, 1500),
      startTimer: null,
      endTimer: null,
    };
  }

  choose(registration: PronunciationRegistration, optionId: string) {
    const control = this.controls.get(registration.id);
    if (!control || !control.state.supported) return;
    this.cancelActive("idle");
    this.refresh(control);
    const option = control.state.options.find(
      (candidate) => candidate.id === optionId,
    );
    if (!option) {
      this.update(control, {
        phase: control.state.options.length ? "accent" : "error",
        selectionExplicit: true,
        reason: "failed",
      });
      return;
    }
    control.selected = option;
    this.update(control, {
      selectedOptionId: option.id,
      selectionExplicit: true,
      failedSelection: null,
      reason: null,
    });
    // Keep this direct: callers invoke choose from the user gesture callback.
    this.beginSpeak(control, option);
  }

  cancelSurface(surfaceId: string) {
    const active = this.active;
    if (!active) return;
    const control = this.controls.get(active.controlId);
    if (control?.registration.surfaceId === surfaceId)
      this.cancelActive("idle");
  }

  cancelAll() {
    this.cancelActive("idle");
  }

  private refreshControls() {
    this.controls.forEach((control) => this.refresh(control));
  }

  private refresh(control: Control) {
    const supported = this.speech.supported();
    const options = supported ? pronunciationOptions(this.speech.voices()) : [];
    let selected = control.selected;
    let failedSelection = control.state.failedSelection;
    let phase = control.state.phase;

    if (selected && !options.some((option) => option.id === selected?.id)) {
      failedSelection = control.state.selectionExplicit ? selected : null;
      selected = null;
      phase = control.state.selectionExplicit
        ? options.length
          ? "accent"
          : "error"
        : phase;
    }
    if (!selected && !control.state.selectionExplicit && options.length) {
      selected = options[0] ?? null;
    }
    control.selected = selected;
    this.update(control, {
      supported,
      options,
      selectedOptionId: selected?.id ?? null,
      failedSelection,
      phase,
    });
  }

  private resolveSelection(control: Control) {
    const selectedId = control.selected?.id;
    if (selectedId) {
      const current = control.state.options.find(
        (option) => option.id === selectedId,
      );
      if (current) return current;
    }
    if (!control.state.options.length) return null;
    if (control.state.selectionExplicit || control.state.failedSelection) {
      this.update(control, {
        phase: "accent",
        reason: null,
        selectedOptionId: null,
      });
      return null;
    }
    const fallback = control.state.options[0] ?? null;
    control.selected = fallback;
    return fallback;
  }

  private tryPreparedSpeak(attemptId: number) {
    const active = this.active;
    if (!active || active.attemptId !== attemptId) return;
    const control = this.controls.get(active.controlId);
    if (!control) return;
    this.refresh(control);
    const selected = this.resolveSelection(control);
    if (!selected) return;
    this.clearAttemptTimers(active);
    this.active = undefined;
    this.beginSpeak(control, selected);
  }

  private beginSpeak(control: Control, option: PronunciationOption) {
    const attemptId = this.nextAttemptId++;
    const controlId = control.registration.id;
    this.update(control, {
      phase: "preparing",
      actualSource: "browser",
      reason: null,
    });
    const attempt = {
      attemptId,
      controlId,
      handle: null as PronunciationSpeechHandle | null,
      preparationTimer: null as unknown | null,
      startTimer: null as unknown | null,
      endTimer: null as unknown | null,
    };
    this.active = attempt;
    try {
      attempt.handle = this.speech.speak({
        entry: control.registration.entry,
        voiceId: option.id,
        onStart: () => this.onStart(attemptId, controlId),
        onEnd: () => this.onEnd(attemptId, controlId),
        onError: (reason) => this.onError(attemptId, controlId, reason),
      });
      if (
        this.isCurrent(attemptId, controlId) &&
        control.state.phase === "preparing"
      ) {
        attempt.startTimer = this.clock.setTimeout(() => {
          if (this.isCurrent(attemptId, controlId))
            this.fail(control, "timeout");
        }, 2000);
      }
    } catch {
      if (this.isCurrent(attemptId, controlId)) this.fail(control, "failed");
    }
  }

  private onStart(attemptId: number, controlId: number) {
    const active = this.active;
    if (!this.isCurrent(attemptId, controlId) || !active) return;
    if (active.startTimer) this.clock.clearTimeout(active.startTimer);
    active.startTimer = null;
    const control = this.controls.get(controlId);
    if (!control) return;
    this.update(control, { phase: "playing", reason: null });
    active.endTimer = this.clock.setTimeout(() => {
      if (this.isCurrent(attemptId, controlId)) this.fail(control, "timeout");
    }, 12000);
  }

  private onEnd(attemptId: number, controlId: number) {
    if (!this.isCurrent(attemptId, controlId)) return;
    const control = this.controls.get(controlId);
    if (!control) return;
    const active = this.active;
    if (active) this.clearAttemptTimers(active);
    this.active = undefined;
    this.update(control, { phase: "complete", reason: null });
  }

  private onError(
    attemptId: number,
    controlId: number,
    reason: "not_allowed" | "failed",
  ) {
    if (!this.isCurrent(attemptId, controlId)) return;
    const control = this.controls.get(controlId);
    if (!control) return;
    if (reason === "not_allowed") {
      const active = this.active;
      if (active) this.clearAttemptTimers(active);
      this.active = undefined;
      this.update(control, { phase: "gesture", reason: "not_allowed" });
      return;
    }
    this.fail(control, "failed");
  }

  private fail(control: Control, reason: "failed" | "timeout") {
    const active = this.active;
    if (active) {
      this.active = undefined;
      this.clearAttemptTimers(active);
      if (active.handle) this.speech.cancel(active.handle);
    }
    this.update(control, { phase: "error", reason });
  }

  private cancelActive(nextPhase?: "idle") {
    const active = this.active;
    if (!active) return;
    // Invalidate before calling the platform, whose cancel may emit synchronously.
    this.active = undefined;
    this.clearAttemptTimers(active);
    if (active.handle) this.speech.cancel(active.handle);
    const control = this.controls.get(active.controlId);
    if (control && nextPhase)
      this.update(control, { phase: nextPhase, reason: null });
  }

  private clearAttemptTimers(
    active: NonNullable<PronunciationCoordinator["active"]>,
  ) {
    for (const timer of [
      active.preparationTimer,
      active.startTimer,
      active.endTimer,
    ]) {
      if (timer) this.clock.clearTimeout(timer);
    }
    active.preparationTimer = null;
    active.startTimer = null;
    active.endTimer = null;
  }

  private isCurrent(attemptId: number, controlId: number) {
    return (
      this.active?.attemptId === attemptId &&
      this.active.controlId === controlId &&
      this.controls.has(controlId)
    );
  }

  private update(control: Control, patch: Partial<PronunciationState>) {
    control.state = { ...control.state, ...patch };
    control.listeners.forEach((listener) => listener(control.state));
  }
}

export function createBrowserPronunciationClock(): PronunciationClock {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}
