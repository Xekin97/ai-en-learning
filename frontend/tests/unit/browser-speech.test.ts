import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeBrowserSpeech } from "@infrastructure/pronunciation/browser-speech";

class FakeUtterance extends EventTarget {
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  constructor(readonly text: string) {
    super();
  }
}

const voice = (overrides: Partial<SpeechSynthesisVoice> = {}) =>
  ({
    default: false,
    lang: "en-GB",
    localService: true,
    name: "English",
    voiceURI: "voice:english",
    ...overrides,
  }) as SpeechSynthesisVoice;

afterEach(() => vi.unstubAllGlobals());

describe("NativeBrowserSpeech", () => {
  it("maps exact browser metadata and speaks with the selected native voice", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    const nativeVoice = voice();
    let utterance: FakeUtterance | undefined;
    const synth = {
      getVoices: () => [nativeVoice],
      speak: vi.fn((value: FakeUtterance) => {
        utterance = value;
      }),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as SpeechSynthesis;
    const port = new NativeBrowserSpeech(synth);
    const mapped = port.voices()[0]!;
    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onError = vi.fn();

    const handle = port.speak({
      entry: "harbor",
      voiceId: mapped.id,
      onStart,
      onEnd,
      onError,
    });
    expect(utterance?.text).toBe("harbor");
    expect(utterance?.voice).toBe(nativeVoice);
    expect(utterance?.lang).toBe("en-GB");
    utterance?.dispatchEvent(new Event("start"));
    utterance?.dispatchEvent(new Event("end"));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
    port.cancel(handle);
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it("maps the browser not-allowed error without treating it as success", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    let utterance: FakeUtterance | undefined;
    const synth = {
      getVoices: () => [voice()],
      speak: (value: FakeUtterance) => (utterance = value),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as SpeechSynthesis;
    const port = new NativeBrowserSpeech(synth);
    const selected = port.voices()[0]!;
    const onError = vi.fn();
    port.speak({
      entry: "harbor",
      voiceId: selected.id,
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onError,
    });
    const event = new Event("error") as Event & { error: string };
    Object.defineProperty(event, "error", { value: "not-allowed" });
    utterance?.dispatchEvent(event);
    expect(onError).toHaveBeenCalledWith("not_allowed");
  });
});
