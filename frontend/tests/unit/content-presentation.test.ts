import { describe, expect, it } from "vitest";
import {
  ContentTypingScheduler,
  IncrementalParagraphProjection,
  presentationDirective,
  type FrameDriver,
} from "@presentation/generation/content-presentation";
import { paragraphTexts } from "@application/generation/draft-reducer";

class Frames implements FrameDriver {
  time = 0;
  next = 1;
  callbacks = new Map<number, (time: number) => void>();
  now = () => this.time;
  request = (callback: (time: number) => void) => {
    const id = this.next++;
    this.callbacks.set(id, callback);
    return id;
  };
  cancel = (id: number) => void this.callbacks.delete(id);
  frame(ms: number) {
    this.time += ms;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(this.time));
  }
}

const graphemes = (value: string) =>
  [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ].map((part) => part.segment);

describe("content presentation scheduler", () => {
  it("preserves control signals when parent Vue updates are coalesced", () => {
    expect(
      presentationDirective(
        "initial-draft",
        {
          draftId: "append-after-body",
          mode: "append",
          presentationIntent: "body",
        },
        false,
      ),
    ).toBe("flush");
    expect(
      presentationDirective(
        "old-generation-draft",
        {
          draftId: "new-generation-draft",
          mode: "initial",
          presentationIntent: "initial_append",
        },
        false,
      ),
    ).toBe("reset_type");
    expect(
      presentationDirective(
        "new-generation-draft",
        {
          draftId: "new-generation-draft",
          mode: "initial",
          presentationIntent: "body",
        },
        false,
      ),
    ).toBe("flush");
    expect(
      presentationDirective(
        "replacement",
        {
          draftId: null,
          mode: null,
          presentationIntent: "reset",
        },
        false,
      ),
    ).toBe("reset");
  });

  it("projects typing frames by scanning only appended tail text", () => {
    let fullSplits = 0;
    const projection = new IncrementalParagraphProjection((value) => {
      fullSplits++;
      return value
        .split("\n\n")
        .map((text, index, all) =>
          index < all.length - 1 ? `${text}\n\n` : text,
        );
    });
    for (const value of ["A", "A\n", "A\n\n", "A\n\nB", "A\n\nBC"])
      projection.update(value);
    expect(fullSplits).toBe(0);
    expect(projection.update("A\n\nBC")).toEqual(["A\n\n", "BC"]);
    expect(projection.update("Replacement")).toEqual(["Replacement"]);
    expect(fullSplits).toBe(1);
  });

  it("matches paragraph boundaries for leading whitespace and CRLF chunks", () => {
    const projection = new IncrementalParagraphProjection(paragraphTexts);
    const chunks = ["\r", "\r\n \t", "\r\nFirst", "\r\n", "\r\nSecond"];
    let source = "";
    for (const chunk of chunks) {
      source += chunk;
      expect(projection.update(source)).toEqual(paragraphTexts(source));
    }
  });

  it("shows the first grapheme immediately and allows zero-character frames", () => {
    const frames = new Frames();
    const patches: string[] = [];
    const scheduler = new ContentTypingScheduler(frames, graphemes, (value) =>
      patches.push(value.displayed),
    );
    scheduler.update("abcd");
    expect(patches).toEqual(["a"]);
    frames.frame(8);
    expect(patches).toEqual(["a"]);
    frames.frame(30);
    expect(patches.at(-1)?.length).toBeGreaterThan(1);
  });

  it("uses the 36 grapheme per second floor independent of 60Hz or 120Hz frames", () => {
    const run = (hz: 60 | 120) => {
      const frames = new Frames();
      const patches: string[] = [];
      const scheduler = new ContentTypingScheduler(frames, graphemes, (value) =>
        patches.push(value.displayed),
      );
      scheduler.update("abcdefghijklmnopqrst");
      for (let frame = 0; frame < hz / 10; frame++) frames.frame(1_000 / hz);
      return { displayed: scheduler.snapshot().displayed, patches };
    };
    const sixty = run(60);
    const oneTwenty = run(120);
    expect(sixty.displayed).toBe("abcd");
    expect(oneTwenty.displayed).toBe(sixty.displayed);
    expect(sixty.patches.length).toBeLessThanOrEqual(7);
    expect(oneTwenty.patches.length).toBeLessThanOrEqual(13);
  });

  it("keeps the original catch-up deadline when another chunk arrives", () => {
    const frames = new Frames();
    const scheduler = new ContentTypingScheduler(frames, graphemes, () => {});
    scheduler.update("abcdefghijklmnopqrst");
    frames.frame(400);
    scheduler.update("abcdefghijklmnopqrstuvwxyz");
    frames.frame(251);
    expect(scheduler.snapshot()).toMatchObject({
      displayed: "abcdefghijklmnopqrstuvwxyz",
      backlog: false,
    });
  });

  it("atomically repairs a combining tail and flushes on completion", () => {
    const frames = new Frames();
    const snapshots: string[] = [];
    const scheduler = new ContentTypingScheduler(frames, graphemes, (value) =>
      snapshots.push(value.displayed),
    );
    scheduler.update("e");
    scheduler.update("e\u0301x");
    expect(snapshots.at(-1)).toBe("e\u0301");
    scheduler.flush();
    expect(snapshots.at(-1)).toBe("e\u0301x");
  });

  it("atomically repairs a ZWJ tail without exposing a partial cluster", () => {
    const frames = new Frames();
    const snapshots: string[] = [];
    const scheduler = new ContentTypingScheduler(frames, graphemes, (value) =>
      snapshots.push(value.displayed),
    );
    scheduler.update("👩");
    scheduler.update("👩‍💻x");
    expect(snapshots).toEqual(["👩", "👩‍💻"]);
    expect(snapshots).not.toContain("👩‍");
    scheduler.flush();
    expect(snapshots.at(-1)).toBe("👩‍💻x");
  });

  it("falls back and respects reduced motion without scheduling frames", () => {
    const frames = new Frames();
    const direct = new ContentTypingScheduler(frames, null, () => {});
    direct.update("👩‍💻 text");
    expect(direct.snapshot().displayed).toBe("👩‍💻 text");
    expect(frames.callbacks.size).toBe(0);

    const reduced = new ContentTypingScheduler(frames, graphemes, () => {});
    reduced.update("complete", true);
    expect(reduced.snapshot().displayed).toBe("complete");
    expect(frames.callbacks.size).toBe(0);
  });

  it("cancels stale callbacks", () => {
    const frames = new Frames();
    const scheduler = new ContentTypingScheduler(frames, graphemes, () => {});
    scheduler.update("backlog");
    scheduler.cancel();
    frames.frame(1_000);
    expect(scheduler.snapshot()).toEqual({
      displayed: "",
      received: "",
      backlog: false,
    });
  });

  it("does not restart animation frames for chunks received while hidden", () => {
    const frames = new Frames();
    const scheduler = new ContentTypingScheduler(frames, graphemes, () => {});
    scheduler.update("first backlog");
    scheduler.pause();
    expect(frames.callbacks.size).toBe(0);
    scheduler.update("first backlog plus a hidden chunk");
    expect(frames.callbacks.size).toBe(0);
    frames.time = 651;
    scheduler.resume();
    expect(frames.callbacks.size).toBe(0);
    expect(scheduler.snapshot()).toMatchObject({
      displayed: "first backlog plus a hidden chunk",
      backlog: false,
    });
  });
});
