import { describe, expect, it } from "vitest";
import { initialContentDraftState } from "@application/shared/models";
import {
  applyDraftEdit,
  applyDraftEvent,
  paragraphTexts,
} from "@application/generation/draft-reducer";

const draft = (
  action: "begin" | "paragraph_complete" | "body_complete" | "discard",
  extra: Record<string, unknown> = {},
) =>
  ({
    kind: "draft",
    seq: 1,
    action,
    draftId: "draft-1",
    contentVersion: 1,
    baseRev: 0,
    ...extra,
  }) as never;

describe("content draft reducer", () => {
  it("preserves CRLF and assigns a maximal blank-line separator left", () => {
    expect(paragraphTexts("  First\r\n \t\r\n\r\nSecond\n\nThird")).toEqual([
      "  First\r\n \t\r\n\r\n",
      "Second\n\n",
      "Third",
    ]);
  });

  it("publishes initial codepoint appends immediately", () => {
    const begun = applyDraftEvent(
      initialContentDraftState(),
      draft("begin", { mode: "initial" }),
    );
    expect(begun.ok).toBe(true);
    const edited = applyDraftEdit(begun.state, {
      kind: "edit",
      seq: 2,
      draftId: "draft-1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "A😀",
      source: "provider",
    });
    expect(edited).toMatchObject({
      ok: true,
      state: {
        working: "A😀",
        published: "A😀",
        workingCodePointLength: 2,
        presentationIntent: "initial_append",
      },
    });
  });

  it("keeps replacement fragments hidden until paragraph_complete", () => {
    let state = initialContentDraftState();
    state = applyDraftEvent(state, draft("begin", { mode: "initial" })).state;
    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 2,
      draftId: "draft-1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "Old one.\n\nOld two.",
      source: "provider",
    }).state;
    state = applyDraftEvent(
      state,
      draft("body_complete", {
        baseRev: 1,
        bodyLength: 18,
        paragraphCount: 2,
      }),
    ).state;
    state = applyDraftEvent(
      state,
      draft("begin", {
        draftId: "draft-2",
        contentVersion: 2,
        baseRev: 1,
        mode: "replace",
      }),
    ).state;
    const hidden = applyDraftEdit(state, {
      kind: "edit",
      seq: 5,
      draftId: "draft-2",
      contentVersion: 2,
      baseRev: 1,
      rev: 2,
      at: 0,
      deleteCount: 10,
      insert: "New one.\n\n",
      source: "provider",
    });
    expect(hidden.ok).toBe(true);
    expect(hidden.state.published).toBe("Old one.\n\nOld two.");
    const committed = applyDraftEvent(
      hidden.state,
      draft("paragraph_complete", {
        draftId: "draft-2",
        contentVersion: 2,
        baseRev: 2,
        paragraphIndex: 0,
      }),
    );
    expect(committed.ok).toBe(true);
    expect(committed.state.published).toBe("New one.\n\nOld two.");
    expect(committed.state.changedParagraphs).toEqual([0]);
  });

  it("rejects invalid revision, identity, and empty edits", () => {
    const begun = applyDraftEvent(
      initialContentDraftState(),
      draft("begin", { mode: "initial" }),
    ).state;
    for (const change of [{ baseRev: 1 }, { draftId: "old" }, { insert: "" }]) {
      expect(
        applyDraftEdit(begun, {
          kind: "edit",
          seq: 2,
          draftId: "draft-1",
          contentVersion: 1,
          baseRev: 0,
          rev: 1,
          at: 0,
          deleteCount: 0,
          insert: "ok",
          source: "provider",
          ...change,
        }).ok,
      ).toBe(false);
    }
  });

  it("allows post-body discard only once and then only restore", () => {
    let state = applyDraftEvent(
      initialContentDraftState(),
      draft("begin", { mode: "initial" }),
    ).state;
    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 2,
      draftId: "draft-1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "valid",
      source: "provider",
    }).state;
    state = applyDraftEvent(
      state,
      draft("body_complete", {
        baseRev: 1,
        bodyLength: 5,
        paragraphCount: 1,
      }),
    ).state;
    const discarded = applyDraftEvent(state, draft("discard", { baseRev: 1 }));
    expect(discarded.ok).toBe(true);
    expect(
      applyDraftEvent(discarded.state, draft("discard", { baseRev: 1 })).ok,
    ).toBe(false);
    expect(
      applyDraftEvent(
        discarded.state,
        draft("begin", {
          draftId: "wrong-next",
          contentVersion: 2,
          baseRev: 1,
          mode: "replace",
        }),
      ).ok,
    ).toBe(false);
    expect(
      applyDraftEvent(
        discarded.state,
        draft("begin", {
          draftId: "restore",
          contentVersion: 1,
          baseRev: 1,
          mode: "restore",
        }),
      ).ok,
    ).toBe(true);
  });

  it("publishes an appended paragraph with its separating blank line", () => {
    let state = applyDraftEvent(
      initialContentDraftState(),
      draft("begin", { mode: "initial" }),
    ).state;
    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 2,
      draftId: "draft-1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "First.",
      source: "provider",
    }).state;
    state = applyDraftEvent(
      state,
      draft("body_complete", {
        baseRev: 1,
        bodyLength: 6,
        paragraphCount: 1,
      }),
    ).state;
    state = applyDraftEvent(
      state,
      draft("begin", {
        draftId: "append",
        baseRev: 1,
        mode: "append",
      }),
    ).state;
    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 5,
      draftId: "append",
      contentVersion: 1,
      baseRev: 1,
      rev: 2,
      at: 6,
      deleteCount: 0,
      insert: "\n\nSecond.",
      source: "provider",
    }).state;
    const committed = applyDraftEvent(
      state,
      draft("paragraph_complete", {
        draftId: "append",
        baseRev: 2,
        paragraphIndex: 1,
      }),
    );
    expect(committed.ok).toBe(true);
    expect(committed.state.published).toBe("First.\n\nSecond.");
  });

  it("protects a committed paragraph but permits an atomic shorter tail", () => {
    let state = initialContentDraftState();
    state = applyDraftEvent(state, draft("begin", { mode: "initial" })).state;
    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 2,
      draftId: "draft-1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "One.\n\nTwo.",
      source: "provider",
    }).state;
    state = applyDraftEvent(
      state,
      draft("body_complete", {
        baseRev: 1,
        bodyLength: 10,
        paragraphCount: 2,
      }),
    ).state;
    state = applyDraftEvent(
      state,
      draft("begin", {
        draftId: "replace",
        contentVersion: 2,
        baseRev: 1,
        mode: "replace",
      }),
    ).state;
    const shorter = applyDraftEdit(state, {
      kind: "edit",
      seq: 5,
      draftId: "replace",
      contentVersion: 2,
      baseRev: 1,
      rev: 2,
      at: 0,
      deleteCount: 10,
      insert: "Short.",
      source: "provider",
    });
    expect(shorter.ok).toBe(true);
    expect(
      applyDraftEvent(
        shorter.state,
        draft("body_complete", {
          draftId: "replace",
          contentVersion: 2,
          baseRev: 2,
          bodyLength: 6,
          paragraphCount: 1,
        }),
      ).state.published,
    ).toBe("Short.");

    state = applyDraftEdit(state, {
      kind: "edit",
      seq: 5,
      draftId: "replace",
      contentVersion: 2,
      baseRev: 1,
      rev: 2,
      at: 0,
      deleteCount: 6,
      insert: "First.\n\n",
      source: "provider",
    }).state;
    state = applyDraftEvent(
      state,
      draft("paragraph_complete", {
        draftId: "replace",
        contentVersion: 2,
        baseRev: 2,
        paragraphIndex: 0,
      }),
    ).state;
    expect(
      applyDraftEdit(state, {
        kind: "edit",
        seq: 7,
        draftId: "replace",
        contentVersion: 2,
        baseRev: 2,
        rev: 3,
        at: 0,
        deleteCount: 7,
        insert: "stolen",
        source: "provider",
      }).ok,
    ).toBe(false);
  });
});
