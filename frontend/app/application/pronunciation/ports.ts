import type { PronunciationVoice } from "./models";

export type PronunciationSpeechError = "not_allowed" | "failed";

export type PronunciationSpeechHandle = Readonly<{ id: number }>;

export type PronunciationSpeakRequest = Readonly<{
  entry: string;
  voiceId: string;
  onStart: () => void;
  onEnd: () => void;
  onError: (reason: PronunciationSpeechError) => void;
}>;

export interface BrowserSpeechPort {
  supported(): boolean;
  voices(): readonly PronunciationVoice[];
  onVoicesChanged(listener: () => void): () => void;
  speak(request: PronunciationSpeakRequest): PronunciationSpeechHandle;
  cancel(handle: PronunciationSpeechHandle): void;
}

export interface PronunciationClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
