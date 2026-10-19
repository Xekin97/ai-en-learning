import type { PronunciationVoice } from "@application/pronunciation/models";
import type {
  BrowserSpeechPort,
  PronunciationSpeakRequest,
  PronunciationSpeechHandle,
} from "@application/pronunciation/ports";

type VoiceRecord = Readonly<{
  voice: SpeechSynthesisVoice;
  model: PronunciationVoice;
}>;

function voiceKey(voice: SpeechSynthesisVoice) {
  return [
    voice.voiceURI,
    voice.name,
    voice.lang,
    voice.localService ? "local" : "remote",
    voice.default ? "default" : "other",
  ].join("\u001f");
}

export class NativeBrowserSpeech implements BrowserSpeechPort {
  private nextHandleId = 1;
  private voiceRecords: readonly VoiceRecord[] = [];
  private readonly utterances = new Map<number, SpeechSynthesisUtterance>();

  constructor(private readonly synth: SpeechSynthesis | undefined) {}

  supported() {
    return Boolean(
      this.synth && typeof SpeechSynthesisUtterance !== "undefined",
    );
  }

  voices() {
    this.voiceRecords = this.readVoices();
    return this.voiceRecords.map((record) => record.model);
  }

  onVoicesChanged(listener: () => void) {
    const synth = this.synth;
    if (!synth) return () => undefined;
    synth.addEventListener("voiceschanged", listener);
    return () => synth.removeEventListener("voiceschanged", listener);
  }

  speak(request: PronunciationSpeakRequest): PronunciationSpeechHandle {
    const synth = this.synth;
    if (!synth) throw new Error("Speech synthesis is unavailable");
    this.voiceRecords = this.readVoices();
    const record = this.voiceRecords.find(
      ({ model }) => model.id === request.voiceId,
    );
    if (!record) throw new Error("The selected speech voice is unavailable");

    const handle = { id: this.nextHandleId++ };
    const utterance = new SpeechSynthesisUtterance(request.entry);
    utterance.voice = record.voice;
    utterance.lang = record.model.locale;
    utterance.addEventListener("start", request.onStart, { once: true });
    utterance.addEventListener(
      "end",
      () => {
        this.utterances.delete(handle.id);
        request.onEnd();
      },
      { once: true },
    );
    utterance.addEventListener(
      "error",
      (event) => {
        this.utterances.delete(handle.id);
        request.onError(
          event.error === "not-allowed" ? "not_allowed" : "failed",
        );
      },
      { once: true },
    );
    this.utterances.set(handle.id, utterance);
    synth.speak(utterance);
    return handle;
  }

  cancel(handle: PronunciationSpeechHandle) {
    this.utterances.delete(handle.id);
    this.synth?.cancel();
  }

  private readVoices(): readonly VoiceRecord[] {
    const occurrences = new Map<string, number>();
    return (this.synth?.getVoices() ?? []).map((voice) => {
      const key = voiceKey(voice);
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      return {
        voice,
        model: {
          id: `${key}\u001f${occurrence}`,
          locale: voice.lang,
          default: voice.default,
          localService: voice.localService,
        },
      };
    });
  }
}

export function createNativeBrowserSpeech() {
  return new NativeBrowserSpeech(
    typeof window === "undefined" ? undefined : window.speechSynthesis,
  );
}
