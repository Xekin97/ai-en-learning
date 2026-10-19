import type {
  ContentDraftEventModel,
  ContentDraftStateModel,
  GenerationEventModel,
} from "@application/shared/models";

type EditEvent = Extract<GenerationEventModel, { kind: "edit" }>;

export type DraftReduction =
  | { ok: true; state: ContentDraftStateModel }
  | { ok: false; state: ContentDraftStateModel };

const points = (value: string) => Array.from(value);
const length = (value: string) => points(value).length;

interface ParagraphRange {
  text: string;
  start: number;
  end: number;
}

function paragraphRanges(value: string): ParagraphRange[] {
  if (!value.trim()) return [];
  const characters = points(value);
  const newline = (at: number) =>
    characters[at] === "\r" && characters[at + 1] === "\n"
      ? 2
      : characters[at] === "\r" || characters[at] === "\n"
        ? 1
        : 0;
  const boundaries: number[] = [];
  for (let index = 0; index < characters.length; index += 1) {
    const first = newline(index);
    if (!first) continue;
    let cursor = index + first;
    while (characters[cursor] === " " || characters[cursor] === "\t") cursor++;
    const second = newline(cursor);
    if (!second) {
      index += first - 1;
      continue;
    }
    cursor += second;
    for (;;) {
      while (characters[cursor] === " " || characters[cursor] === "\t")
        cursor++;
      const extra = newline(cursor);
      if (!extra) break;
      cursor += extra;
    }
    boundaries.push(cursor);
    index = cursor - 1;
  }
  const result: ParagraphRange[] = [];
  let start = 0;
  for (const end of boundaries) {
    const part = characters.slice(start, end).join("");
    if (part.trim()) {
      result.push({ text: part, start, end });
      start = end;
    }
  }
  const tail = characters.slice(start).join("");
  if (tail.trim()) result.push({ text: tail, start, end: characters.length });
  return result;
}

export function paragraphTexts(value: string): string[] {
  return paragraphRanges(value).map((paragraph) => paragraph.text);
}

const paragraphModels = (value: string) =>
  paragraphTexts(value).map((text, index) => ({ index, text }));

export function applyDraftEvent(
  state: ContentDraftStateModel,
  event: ContentDraftEventModel,
): DraftReduction {
  if (event.baseRev !== state.revision) return { ok: false, state };
  if (event.action === "begin") return begin(state, event);
  if (
    event.draftId !== state.draftId ||
    event.contentVersion !== state.contentVersion ||
    state.mode === null
  )
    return { ok: false, state };

  if (event.action === "discard") {
    if (state.discarded) return { ok: false, state };
    return {
      ok: true,
      state: {
        ...state,
        working: state.published,
        workingCodePointLength: length(state.published),
        discarded: true,
        bodyComplete: false,
        presentationRevision: state.presentationRevision + 1,
        presentationIntent: "discard",
        changedParagraphs: [],
      },
    };
  }
  if (state.bodyComplete || state.discarded) return { ok: false, state };

  if (event.action === "paragraph_complete") {
    if (
      (state.mode !== "replace" && state.mode !== "append") ||
      event.paragraphIndex !== state.nextParagraphIndex
    )
      return { ok: false, state };
    const workingRanges = paragraphRanges(state.working);
    const working = workingRanges.map((paragraph) => paragraph.text);
    if (event.paragraphIndex >= working.length) return { ok: false, state };
    if (state.mode === "replace") {
      for (
        let i = event.paragraphIndex + 1;
        i < state.beginParagraphs.length;
        i++
      )
        if (working[i] !== state.beginParagraphs[i])
          return { ok: false, state };
    } else {
      const prefix = state.beginParagraphs.join("");
      if (!state.working.startsWith(prefix)) return { ok: false, state };
    }
    const changed =
      state.publishedParagraphs[event.paragraphIndex]?.text !==
      working[event.paragraphIndex];
    const text = state.working;
    const published = paragraphModels(text);
    const committed = workingRanges[event.paragraphIndex]!.end;
    const nextRange = workingRanges[event.paragraphIndex + 1];
    return {
      ok: true,
      state: {
        ...state,
        published: text,
        publishedParagraphs: published,
        nextParagraphIndex: state.nextParagraphIndex + 1,
        committedPrefixCodePoints: committed,
        committedPrefixUtf16: workingRanges
          .slice(0, event.paragraphIndex + 1)
          .reduce((total, paragraph) => total + paragraph.text.length, 0),
        editCursorCodePoints: committed,
        editCursorUtf16: workingRanges
          .slice(0, event.paragraphIndex + 1)
          .reduce((total, paragraph) => total + paragraph.text.length, 0),
        transactionEndCodePoints:
          nextRange?.end ?? state.workingCodePointLength,
        presentationRevision: state.presentationRevision + 1,
        presentationIntent: "paragraph",
        changedParagraphs: changed ? [event.paragraphIndex] : [],
      },
    };
  }

  if (event.action === "body_complete") {
    const paragraphs = paragraphTexts(state.working);
    if (
      event.bodyLength !== state.workingCodePointLength ||
      event.paragraphCount !== paragraphs.length ||
      (state.mode === "append" &&
        !state.working.startsWith(state.beginParagraphs.join("")))
    )
      return { ok: false, state };
    const changed =
      state.mode === "initial"
        ? []
        : paragraphs.flatMap((text, index) =>
            state.publishedParagraphs[index]?.text === text ? [] : [index],
          );
    return {
      ok: true,
      state: {
        ...state,
        published: state.working,
        publishedParagraphs: paragraphModels(state.working),
        bodyComplete: true,
        discarded: false,
        committedPrefixCodePoints: state.workingCodePointLength,
        committedPrefixUtf16: state.working.length,
        editCursorCodePoints: state.workingCodePointLength,
        editCursorUtf16: state.working.length,
        transactionEndCodePoints: state.workingCodePointLength,
        presentationRevision: state.presentationRevision + 1,
        presentationIntent: "body",
        changedParagraphs: changed,
      },
    };
  }

  return { ok: false, state };
}

function begin(
  state: ContentDraftStateModel,
  event: Extract<ContentDraftEventModel, { action: "begin" }>,
): DraftReduction {
  if (
    state.retiredDraftIds.includes(event.draftId) ||
    state.draftId === event.draftId ||
    (state.draftId !== null && !state.bodyComplete && !state.discarded)
  )
    return { ok: false, state };
  if (
    event.mode === "initial" &&
    (state.everStarted || state.published !== "" || event.contentVersion !== 1)
  )
    return { ok: false, state };
  if (state.discarded && event.mode !== "restore") return { ok: false, state };
  if (event.mode !== "initial" && !state.bodyComplete && !state.discarded)
    return { ok: false, state };
  if (
    event.mode === "replace" &&
    state.latestProviderVersion !== null &&
    event.contentVersion <= state.latestProviderVersion
  )
    return { ok: false, state };
  if (event.mode === "append" && event.contentVersion !== state.contentVersion)
    return { ok: false, state };
  if (event.mode === "restore" && !state.discarded) return { ok: false, state };
  const retired = state.draftId
    ? [...state.retiredDraftIds, state.draftId]
    : state.retiredDraftIds;
  const base = paragraphTexts(state.published);
  return {
    ok: true,
    state: {
      ...state,
      working: state.published,
      workingCodePointLength: length(state.published),
      draftId: event.draftId,
      mode: event.mode,
      contentVersion: event.contentVersion,
      latestProviderVersion:
        event.mode === "restore"
          ? state.latestProviderVersion
          : event.contentVersion,
      retiredDraftIds: retired,
      beginParagraphs: base,
      nextParagraphIndex: event.mode === "append" ? base.length : 0,
      bodyComplete: false,
      discarded: false,
      everStarted: true,
      beginCodePointLength: length(state.published),
      committedPrefixCodePoints:
        event.mode === "append" ? length(state.published) : 0,
      committedPrefixUtf16:
        event.mode === "append" ? state.published.length : 0,
      editCursorCodePoints:
        event.mode === "append" ? length(state.published) : 0,
      editCursorUtf16: event.mode === "append" ? state.published.length : 0,
      transactionEndCodePoints:
        event.mode === "replace"
          ? length(base[0] ?? "")
          : length(state.published),
      presentationRevision: state.presentationRevision + 1,
      presentationIntent: event.mode === "initial" ? "reset" : "body",
      changedParagraphs: [],
    },
  };
}

export function applyDraftEdit(
  state: ContentDraftStateModel,
  event: EditEvent,
): DraftReduction {
  if (
    state.draftId !== event.draftId ||
    state.contentVersion !== event.contentVersion ||
    state.mode === null ||
    state.bodyComplete ||
    state.discarded ||
    event.baseRev !== state.revision ||
    event.rev !== state.revision + 1 ||
    event.at > state.workingCodePointLength ||
    event.at + event.deleteCount > state.workingCodePointLength ||
    (event.deleteCount === 0 && event.insert === "") ||
    (state.mode === "restore"
      ? event.source !== "retained"
      : event.source !== "provider") ||
    (state.mode === "initial" &&
      (event.at !== state.workingCodePointLength || event.deleteCount !== 0))
  )
    return { ok: false, state };
  const initial = state.mode === "initial";
  if (
    state.mode === "append" &&
    (event.at < state.beginCodePointLength ||
      event.at + event.deleteCount > state.workingCodePointLength)
  )
    return { ok: false, state };
  if (state.mode === "replace" && event.at < state.committedPrefixCodePoints)
    return { ok: false, state };
  const delta = length(event.insert) - event.deleteCount;
  const spliced = initial
    ? {
        value: state.working + event.insert,
        cursorCodePoints: state.workingCodePointLength + length(event.insert),
        cursorUtf16: state.working.length + event.insert.length,
      }
    : spliceCodePoints(
        state.working,
        event.at,
        event.deleteCount,
        event.insert,
        event.at >= state.editCursorCodePoints
          ? {
              codePoints: state.editCursorCodePoints,
              utf16: state.editCursorUtf16,
            }
          : {
              codePoints: state.committedPrefixCodePoints,
              utf16: state.committedPrefixUtf16,
            },
      );
  const working = spliced.value;
  return {
    ok: true,
    state: {
      ...state,
      working,
      workingCodePointLength: state.workingCodePointLength + delta,
      revision: event.rev,
      editCursorCodePoints: spliced.cursorCodePoints,
      editCursorUtf16: spliced.cursorUtf16,
      published: initial ? working : state.published,
      publishedParagraphs: state.publishedParagraphs,
      transactionEndCodePoints:
        state.mode === "replace"
          ? state.transactionEndCodePoints + delta
          : state.transactionEndCodePoints,
      presentationRevision: initial
        ? state.presentationRevision + 1
        : state.presentationRevision,
      presentationIntent: initial ? "initial_append" : state.presentationIntent,
      changedParagraphs: [],
    },
  };
}

export function freezeDraftState(
  state: ContentDraftStateModel,
): ContentDraftStateModel {
  return {
    ...state,
    working: state.published,
    workingCodePointLength: length(state.published),
    editCursorCodePoints: length(state.published),
    editCursorUtf16: state.published.length,
    presentationRevision: state.presentationRevision + 1,
    presentationIntent: "body",
    changedParagraphs: [],
  };
}

export function authoritativeDraftState(
  state: ContentDraftStateModel,
  passage: string,
): ContentDraftStateModel {
  return {
    ...state,
    working: passage,
    published: passage,
    workingCodePointLength: length(passage),
    committedPrefixCodePoints: length(passage),
    committedPrefixUtf16: passage.length,
    editCursorCodePoints: length(passage),
    editCursorUtf16: passage.length,
    publishedParagraphs: paragraphModels(passage),
    bodyComplete: true,
    discarded: false,
    presentationRevision: state.presentationRevision + 1,
    presentationIntent: "body",
    changedParagraphs: [],
  };
}

function spliceCodePoints(
  value: string,
  at: number,
  deleteCount: number,
  insert: string,
  cursor: { codePoints: number; utf16: number },
): { value: string; cursorCodePoints: number; cursorUtf16: number } {
  let codePoint = cursor.codePoints;
  let offset = cursor.utf16;
  while (offset < value.length && codePoint < at) {
    const width = value.codePointAt(offset)! > 0xffff ? 2 : 1;
    offset += width;
    codePoint++;
  }
  const start = offset;
  while (offset < value.length && codePoint < at + deleteCount) {
    const width = value.codePointAt(offset)! > 0xffff ? 2 : 1;
    offset += width;
    codePoint++;
  }
  const insertedCodePoints = length(insert);
  return {
    value: value.slice(0, start) + insert + value.slice(offset),
    cursorCodePoints: at + insertedCodePoints,
    cursorUtf16: start + insert.length,
  };
}
