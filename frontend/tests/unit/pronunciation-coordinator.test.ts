import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PronunciationCoordinator,
  pronunciationOptions,
} from "@application/pronunciation/coordinator";
import type { PronunciationVoice } from "@application/pronunciation/models";
import type {
  BrowserSpeechPort,
  PronunciationSpeakRequest,
  PronunciationSpeechHandle,
} from "@application/pronunciation/ports";

const uk: PronunciationVoice = {
  id: "uk",
  locale: "en-GB",
  default: false,
  localService: true,
};
const us: PronunciationVoice = {
  id: "us",
  locale: "en-US",
  default: true,
  localService: true,
};

class FakeSpeech implements BrowserSpeechPort {
  available: PronunciationVoice[] = [uk, us];
  calls: PronunciationSpeakRequest[] = [];
  canceled: PronunciationSpeechHandle[] = [];
  listener: (() => void) | undefined;
  supported() {
    return true;
  }
  voices() {
    return this.available;
  }
  onVoicesChanged(listener: () => void) {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  speak(request: PronunciationSpeakRequest) {
    this.calls.push(request);
    return { id: this.calls.length };
  }
  cancel(handle: PronunciationSpeechHandle) {
    this.canceled.push(handle);
  }
}

function setup() {
  const speech = new FakeSpeech();
  const coordinator = new PronunciationCoordinator(speech, {
    now: () => Date.now(),
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  coordinator.start();
  const registration = coordinator.register("harbor", "plan:one");
  return { speech, coordinator, registration };
}

describe("PronunciationCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());

  it("groups one stable representative per actual English accent", () => {
    expect(
      pronunciationOptions([
        { ...us, id: "us-b", default: false },
        us,
        uk,
        { id: "au", locale: "en-AU", default: false, localService: true },
        { id: "fr", locale: "fr-FR", default: false, localService: true },
      ]),
    ).toEqual([
      { id: "us", locale: "en-US", accent: "us" },
      { id: "au", locale: "en-AU", accent: "neutral" },
      { id: "uk", locale: "en-GB", accent: "uk" },
    ]);
  });

  it("speaks synchronously inside a ready click and tracks start/end", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.play(registration);
    expect(speech.calls).toHaveLength(1);
    expect(coordinator.snapshot(registration)?.phase).toBe("preparing");
    speech.calls[0]?.onStart();
    expect(coordinator.snapshot(registration)?.phase).toBe("playing");
    speech.calls[0]?.onEnd();
    expect(coordinator.snapshot(registration)?.phase).toBe("complete");
  });

  it("waits at most 1.5 seconds for voices and reacts to voiceschanged", () => {
    const { speech, coordinator, registration } = setup();
    speech.available = [];
    const delayed = coordinator.register("thread", "plan:one");
    coordinator.play(delayed);
    expect(speech.calls).toHaveLength(0);
    vi.advanceTimersByTime(1499);
    speech.available = [uk];
    speech.listener?.();
    expect(speech.calls.at(-1)?.entry).toBe("thread");

    speech.available = [];
    const timeout = coordinator.register("shore", "plan:one");
    coordinator.play(timeout);
    vi.advanceTimersByTime(1500);
    expect(coordinator.snapshot(timeout)?.reason).toBe("timeout");
    expect(coordinator.snapshot(timeout)?.phase).toBe("error");
    coordinator.release(registration);
  });

  it("enforces 2 second start and 12 second end bounds", () => {
    const first = setup();
    first.coordinator.play(first.registration);
    vi.advanceTimersByTime(2000);
    expect(first.coordinator.snapshot(first.registration)?.reason).toBe(
      "timeout",
    );
    expect(first.speech.canceled).toHaveLength(1);

    const second = setup();
    second.coordinator.play(second.registration);
    second.speech.calls[0]?.onStart();
    vi.advanceTimersByTime(12000);
    expect(second.coordinator.snapshot(second.registration)?.reason).toBe(
      "timeout",
    );
    expect(second.speech.canceled).toHaveLength(1);
  });

  it("offers a direct gesture retry after not-allowed", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.play(registration);
    speech.calls[0]?.onError("not_allowed");
    expect(coordinator.snapshot(registration)?.phase).toBe("gesture");
    coordinator.play(registration);
    expect(speech.calls).toHaveLength(2);
  });

  it("invalidates before cancel and ignores all late events", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.play(registration);
    const oldCall = speech.calls[0];
    const second = coordinator.register("current", "result:one");
    coordinator.play(second);
    expect(speech.canceled).toHaveLength(1);
    oldCall?.onStart();
    oldCall?.onEnd();
    oldCall?.onError("failed");
    expect(coordinator.snapshot(second)?.phase).toBe("preparing");
  });

  it("keeps a disappeared explicit selection failed until an explicit choice", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.choose(registration, "us");
    speech.calls[0]?.onEnd();
    speech.available = [uk];
    speech.listener?.();
    const state = coordinator.snapshot(registration);
    expect(state?.phase).toBe("accent");
    expect(state?.failedSelection).toEqual({
      id: "us",
      locale: "en-US",
      accent: "us",
    });
    expect(state?.options).toHaveLength(1);

    const before = speech.calls.length;
    coordinator.play(registration);
    expect(speech.calls).toHaveLength(before);
    coordinator.choose(registration, "uk");
    expect(speech.calls).toHaveLength(before + 1);
  });

  it("stops an active explicitly selected voice when that voice disappears", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.choose(registration, "us");
    speech.calls[0]?.onStart();
    speech.available = [uk];
    speech.listener?.();
    expect(speech.canceled).toHaveLength(1);
    expect(coordinator.snapshot(registration)?.phase).toBe("accent");
    speech.calls[0]?.onEnd();
    expect(coordinator.snapshot(registration)?.phase).toBe("accent");
  });

  it("turns unsupported synthesis into a bounded local retry state", () => {
    const speech = new FakeSpeech();
    speech.supported = () => false;
    const coordinator = new PronunciationCoordinator(speech, {
      now: () => Date.now(),
      setTimeout: (callback, delay) => setTimeout(callback, delay),
      clearTimeout: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    const registration = coordinator.register("harbor", "library:one");
    coordinator.play(registration);
    expect(coordinator.snapshot(registration)?.phase).toBe("error");
    expect(speech.calls).toHaveLength(0);
  });

  it("revalidates a menu choice and does not silently substitute it", () => {
    const { speech, coordinator, registration } = setup();
    speech.available = [uk];
    coordinator.choose(registration, "us");
    expect(speech.calls).toHaveLength(0);
    expect(coordinator.snapshot(registration)?.phase).toBe("accent");
  });

  it("cancels by surface, session-wide, and release", () => {
    const { speech, coordinator, registration } = setup();
    coordinator.play(registration);
    coordinator.cancelSurface("other");
    expect(speech.canceled).toHaveLength(0);
    coordinator.cancelSurface("plan:one");
    expect(speech.canceled).toHaveLength(1);
    coordinator.play(registration);
    coordinator.cancelAll();
    expect(speech.canceled).toHaveLength(2);
    coordinator.play(registration);
    coordinator.release(registration);
    expect(speech.canceled).toHaveLength(3);
  });
});
