export interface FrameDriver {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export interface TypingSnapshot {
  displayed: string;
  received: string;
  backlog: boolean;
}

export type PresentationDirective = "reset" | "reset_type" | "type" | "flush";

export function presentationDirective(
  previousDraftId: string | null,
  current: {
    draftId: string | null;
    mode: "initial" | "replace" | "append" | "restore" | null;
    presentationIntent:
      "reset" | "initial_append" | "paragraph" | "body" | "discard";
  },
  terminal: boolean,
): PresentationDirective {
  if (current.draftId === null) return "reset";
  if (terminal || current.presentationIntent !== "initial_append")
    return "flush";
  if (current.mode === "initial" && current.draftId !== previousDraftId)
    return "reset_type";
  return "type";
}

export class IncrementalParagraphProjection {
  private source = "";
  private values: string[] = [];
  private breaks = 0;
  private lastWasCarriageReturn = false;
  private hasContent = false;

  constructor(private readonly split: (value: string) => string[]) {}

  update(value: string): string[] {
    if (!value.startsWith(this.source)) return this.replace(value);
    const suffix = value.slice(this.source.length);
    for (const character of suffix) this.append(character);
    this.source = value;
    return this.snapshot();
  }

  reset(value = ""): string[] {
    this.source = "";
    this.values = [];
    this.breaks = 0;
    this.lastWasCarriageReturn = false;
    this.hasContent = false;
    return this.update(value);
  }

  private replace(value: string): string[] {
    this.source = value;
    this.values = this.split(value);
    this.hasContent = this.values.length > 0;
    this.breaks = 0;
    this.lastWasCarriageReturn = false;
    for (const character of this.values.at(-1) ?? "") this.trackTail(character);
    return this.snapshot();
  }

  private append(character: string): void {
    const isBreak = character === "\r" || character === "\n";
    const isHorizontalSpace = character === " " || character === "\t";
    if (this.hasContent && !isBreak && !isHorizontalSpace && this.breaks >= 2) {
      this.values.push(character);
      this.hasContent = true;
      this.breaks = 0;
      this.lastWasCarriageReturn = false;
      return;
    }
    if (this.values.length === 0) this.values.push("");
    this.values[this.values.length - 1] += character;
    if (!isBreak && !isHorizontalSpace) this.hasContent = true;
    this.trackTail(character);
  }

  private trackTail(character: string): void {
    if (character === "\r") {
      this.breaks++;
      this.lastWasCarriageReturn = true;
    } else if (character === "\n") {
      if (!this.lastWasCarriageReturn) this.breaks++;
      this.lastWasCarriageReturn = false;
    } else if (character === " " || character === "\t") {
      this.lastWasCarriageReturn = false;
    } else {
      this.breaks = 0;
      this.lastWasCarriageReturn = false;
    }
  }

  private snapshot(): string[] {
    return this.hasContent ? [...this.values] : [];
  }
}

export class ContentTypingScheduler {
  private received = "";
  private parts: string[] = [];
  private shown = 0;
  private last = 0;
  private carry = 0;
  private deadline = 0;
  private handle: number | null = null;
  private epoch = 0;
  private suspended = false;

  constructor(
    private readonly driver: FrameDriver,
    private readonly segment: ((value: string) => string[]) | null,
    private readonly patch: (snapshot: TypingSnapshot) => void,
  ) {}

  update(received: string, reducedMotion = false): void {
    if (!this.segment || reducedMotion) {
      this.stopFrame();
      this.received = received;
      this.parts = [received];
      this.shown = this.parts.length;
      this.emit(false);
      return;
    }
    const now = this.driver.now();
    const previousDisplayed = this.parts.slice(0, this.shown).join("");
    const next = this.segment(received);
    const wasBacklogged = this.shown < this.parts.length;
    this.received = received;
    this.parts = next;
    this.shown = Math.min(this.shown, next.length);

    if (this.shown === 0 && next.length > 0) this.shown = 1;
    const rebuilt = next.slice(0, this.shown).join("");
    if (
      rebuilt !== previousDisplayed ||
      (this.shown === 1 && next.length === 1)
    )
      this.emit(this.shown < next.length);

    if (this.shown >= next.length) {
      this.stopFrame();
      return;
    }
    if (!wasBacklogged || this.deadline <= 0) this.deadline = now + 650;
    if (this.handle === null && !this.suspended) {
      this.last = now;
      const epoch = ++this.epoch;
      this.handle = this.driver.request((time) => this.tick(time, epoch));
    }
  }

  flush(): void {
    this.stopFrame();
    this.shown = this.parts.length;
    this.emit(false);
  }

  cancel(): void {
    this.stopFrame();
    this.received = "";
    this.parts = [];
    this.shown = 0;
    this.carry = 0;
    this.deadline = 0;
  }

  resume(reducedMotion = false): void {
    this.suspended = false;
    if (!this.received || this.shown >= this.parts.length) return;
    if (reducedMotion || this.driver.now() >= this.deadline) {
      this.flush();
      return;
    }
    if (this.handle === null) {
      this.last = this.driver.now();
      const epoch = ++this.epoch;
      this.handle = this.driver.request((time) => this.tick(time, epoch));
    }
  }

  pause(): void {
    this.suspended = true;
    this.stopFrame();
  }

  snapshot(): TypingSnapshot {
    return {
      displayed: this.parts.slice(0, this.shown).join(""),
      received: this.received,
      backlog: this.shown < this.parts.length,
    };
  }

  private tick(time: number, epoch: number): void {
    if (epoch !== this.epoch) return;
    this.handle = null;
    const elapsed = Math.max(0, time - this.last);
    this.last = time;
    const backlog = this.parts.length - this.shown;
    const remaining = Math.max(0, this.deadline - time);
    const rate = Math.max(
      36,
      remaining > 0 ? backlog / (remaining / 1_000) : Infinity,
    );
    const budget = this.carry + (elapsed / 1_000) * rate;
    const take = Number.isFinite(rate)
      ? Math.min(backlog, Math.floor(budget))
      : backlog;
    this.carry = Number.isFinite(rate) ? Math.max(0, budget - take) : 0;
    if (take > 0) {
      this.shown += take;
      this.emit(this.shown < this.parts.length);
    }
    if (this.shown < this.parts.length) {
      this.handle = this.driver.request((next) => this.tick(next, epoch));
    } else {
      this.deadline = 0;
      this.carry = 0;
    }
  }

  private emit(backlog: boolean): void {
    this.patch({
      displayed: this.parts.slice(0, this.shown).join(""),
      received: this.received,
      backlog,
    });
  }

  private stopFrame(): void {
    this.epoch++;
    if (this.handle !== null) this.driver.cancel(this.handle);
    this.handle = null;
  }
}

export const browserFrameDriver: FrameDriver = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};
