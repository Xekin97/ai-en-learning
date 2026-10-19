import type {
  AppFailure,
  GenerationEventModel,
  GenerationStateModel,
} from "../shared/models";
import { resetContentDraftState } from "../shared/models";
import {
  applyDraftEdit,
  applyDraftEvent,
  authoritativeDraftState,
  freezeDraftState,
} from "./draft-reducer";

export function reduceGeneration(
  state: GenerationStateModel,
  event: GenerationEventModel,
): GenerationStateModel {
  const frame = JSON.stringify(event);
  if (event.seq === state.lastSeq && frame === state.lastFrame) return state;
  if (event.seq !== state.lastSeq + 1) return protocolFailure(state);
  const sequenced = { ...state, lastSeq: event.seq, lastFrame: frame };
  switch (event.kind) {
    case "started":
      if (
        state.phase !== "streaming" ||
        state.runId !== null ||
        event.seq !== 1
      )
        return protocolFailure(state);
      return {
        ...sequenced,
        runId: event.runId,
        requestPhase: "accepted",
        acceptedContentService: event.snapshot.contentService,
        acceptedSnapshot: event.snapshot,
      };
    case "progress": {
      if (state.phase !== "streaming" || !state.runId)
        return protocolFailure(state);
      const allowed =
        (event.phase === "planning" && state.requestPhase === "accepted") ||
        (event.phase === "composing" && state.requestPhase === "planning") ||
        (event.phase === "finalizing" && state.requestPhase === "composing");
      return allowed
        ? {
            ...sequenced,
            requestPhase: event.phase,
            activity: event.phase === "finalizing" ? null : state.activity,
          }
        : protocolFailure(state);
    }
    case "plan_item": {
      if (state.phase !== "streaming" || state.requestPhase !== "planning")
        return protocolFailure(state);
      if (state.planId && state.planId !== event.planId)
        return protocolFailure(state);
      if (
        state.planMeaningLanguage &&
        state.planMeaningLanguage !== event.meaningLanguage
      )
        return protocolFailure(state);
      if (
        state.requestedMeaningLanguage &&
        state.requestedMeaningLanguage !== event.meaningLanguage
      )
        return protocolFailure(state);
      if (
        event.item.kind === "word_use" &&
        state.requestedEntries.length &&
        !state.requestedEntries.includes(event.item.entry)
      )
        return protocolFailure(state);
      const duplicateScene =
        event.item.kind === "scene" &&
        state.planItems.some((item) => item.kind === "scene");
      const entry = event.item.kind === "word_use" ? event.item.entry : null;
      const duplicateEntry =
        entry !== null &&
        state.planItems.some(
          (item) => item.kind === "word_use" && item.entry === entry,
        );
      if (duplicateScene || duplicateEntry) return protocolFailure(state);
      return {
        ...sequenced,
        planId: event.planId,
        planMeaningLanguage: event.meaningLanguage,
        planItems: [...state.planItems, event.item],
      };
    }
    case "activity":
      if (state.phase !== "streaming" || state.requestPhase !== "composing")
        return protocolFailure(state);
      return { ...sequenced, activity: event.activity };
    case "draft": {
      if (state.phase !== "streaming" || state.requestPhase !== "composing")
        return protocolFailure(state);
      const maximumVersion = state.acceptedContentService?.contentReviewEnabled
        ? state.acceptedContentService.contentRepairLimit + 2
        : 1;
      if (event.contentVersion > maximumVersion) return protocolFailure(state);
      const reduced = applyDraftEvent(state.draft, event);
      return reduced.ok
        ? syncDraft({ ...sequenced, activity: state.activity }, reduced.state)
        : protocolFailure(state);
    }
    case "edit": {
      if (state.phase !== "streaming" || state.requestPhase !== "composing")
        return protocolFailure(state);
      const reduced = applyDraftEdit(state.draft, event);
      return reduced.ok
        ? syncDraft(sequenced, reduced.state)
        : protocolFailure(state);
    }
    case "validated":
      if (
        state.phase !== "streaming" ||
        state.runId !== event.runId ||
        state.requestPhase !== "finalizing"
      )
        return protocolFailure(state);
      if (!validTerminal(state, event)) return protocolFailure(state);
      return {
        ...sequenced,
        phase: "valid",
        requestPhase: null,
        activity: null,
        streamedText: event.result.passage,
        draft: authoritativeDraftState(state.draft, event.result.passage),
        planId: null,
        planMeaningLanguage: null,
        planItems: [],
        draftId: null,
        retiredDraftIds: [],
        revision: 0,
        codePointLength: Array.from(event.result.passage).length,
        contentVersion: null,
        result: event.result,
        finalContentVersion: event.finalContentVersion,
        contentOutcome: event.contentOutcome,
        completionNotice: event.completionNotice,
        resultUnavailable: false,
        canSave: true,
        failure: null,
      };
    case "settlement_pending":
      if (state.phase !== "streaming") return protocolFailure(state);
      return {
        ...sequenced,
        phase: "pending",
        activity: null,
        draft: freezeDraftState(state.draft),
        streamedText: state.draft.published,
        canSave: false,
        failure: streamFailure(event.code, true, event.requestId),
      };
    case "failed":
      if (state.phase !== "streaming") return protocolFailure(state);
      return {
        ...sequenced,
        phase: "failed",
        requestPhase: null,
        activity: null,
        streamedText: "",
        draft: resetContentDraftState(state.draft),
        planId: null,
        planMeaningLanguage: null,
        planItems: [],
        draftId: null,
        retiredDraftIds: [],
        contentVersion: null,
        revision: 0,
        result: null,
        canSave: false,
        failure: streamFailure(event.code, event.retryable, event.requestId),
      };
    case "cancelled":
      if (state.phase !== "streaming") return protocolFailure(state);
      return {
        ...sequenced,
        phase: "cancelled",
        requestPhase: null,
        activity: null,
        streamedText: "",
        draft: resetContentDraftState(state.draft),
        planId: null,
        planMeaningLanguage: null,
        planItems: [],
        draftId: null,
        retiredDraftIds: [],
        contentVersion: null,
        revision: 0,
        result: null,
        canSave: false,
        failure: null,
      };
  }
}

function syncDraft(
  state: GenerationStateModel,
  draft: GenerationStateModel["draft"],
): GenerationStateModel {
  return {
    ...state,
    draft,
    streamedText: draft.published,
    draftId: draft.draftId,
    retiredDraftIds: draft.retiredDraftIds,
    contentVersion: draft.contentVersion,
    revision: draft.revision,
    codePointLength: draft.workingCodePointLength,
    result: null,
    finalContentVersion: null,
    contentOutcome: null,
    completionNotice: null,
    resultUnavailable: false,
    canSave: false,
  };
}

function validTerminal(
  state: GenerationStateModel,
  event: Extract<GenerationEventModel, { kind: "validated" }>,
): boolean {
  const service = state.acceptedContentService;
  if (!service) return false;
  const maxVersion = service.contentReviewEnabled
    ? service.contentRepairLimit + 2
    : 1;
  if (event.finalContentVersion > maxVersion) return false;
  if (!service.contentReviewEnabled && event.contentOutcome !== "basic")
    return false;
  if (service.contentReviewEnabled && event.contentOutcome === "basic")
    return false;
  if (state.requestedEntries.length) {
    const targets = event.result.targets.map((target) => target.entry);
    if (JSON.stringify(targets) !== JSON.stringify(state.requestedEntries))
      return false;
  }
  return true;
}

function protocolFailure(state: GenerationStateModel): GenerationStateModel {
  return {
    ...state,
    phase: "pending",
    activity: null,
    draft: freezeDraftState(state.draft),
    streamedText: state.draft.published,
    canSave: false,
    failure: streamFailure("contract_violation", true, null),
  };
}

function streamFailure(
  code: string,
  retryable: boolean,
  requestId: string | null,
): AppFailure {
  return {
    kind:
      code === "contract_violation"
        ? "contract_violation"
        : "generation_unavailable",
    code,
    status: null,
    requestId,
    fields: {},
    retryable,
  };
}
