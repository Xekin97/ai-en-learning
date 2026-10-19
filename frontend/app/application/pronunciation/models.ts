export type PronunciationPhase =
  | "idle"
  | "preparing"
  | "playing"
  | "complete"
  | "error"
  | "gesture"
  | "accent";

export type PronunciationAccent = "uk" | "us" | "neutral";

export type PronunciationVoice = Readonly<{
  id: string;
  locale: string;
  default: boolean;
  localService: boolean;
}>;

export type PronunciationOption = Readonly<{
  id: string;
  locale: string;
  accent: PronunciationAccent;
}>;

export type FailedPronunciationSelection = Readonly<{
  id: string;
  locale: string;
  accent: PronunciationAccent;
}>;

export type PronunciationState = Readonly<{
  phase: PronunciationPhase;
  supported: boolean;
  entry: string;
  surfaceId: string;
  options: readonly PronunciationOption[];
  selectedOptionId: string | null;
  selectionExplicit: boolean;
  failedSelection: FailedPronunciationSelection | null;
  actualSource: "browser" | null;
  reason: "not_allowed" | "failed" | "timeout" | null;
}>;

export type PronunciationRegistration = Readonly<{
  id: number;
  entry: string;
  surfaceId: string;
}>;
