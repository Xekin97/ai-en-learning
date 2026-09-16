import type {
  AppFailure,
  GenerationEventModel,
  GenerationStateModel,
} from "../shared/models";

export function reduceGeneration(
  state: GenerationStateModel,
  event: GenerationEventModel,
): GenerationStateModel {
  switch (event.kind) {
    case "started":
      if (
        state.phase !== "streaming" ||
        (state.runId !== null && state.runId !== event.runId)
      )
        return state;
      return { ...state, runId: event.runId };
    case "delta":
      if (state.phase !== "streaming") return state;
      return { ...state, streamedText: state.streamedText + event.text };
    case "validated":
      if (state.phase !== "streaming" || state.runId !== event.runId)
        return state;
      return {
        phase: "valid",
        runId: event.runId,
        streamedText: event.result.passage,
        result: event.result,
        failure: null,
      };
    case "failed":
      if (state.phase !== "streaming") return state;
      return {
        ...state,
        phase: "failed",
        result: null,
        failure: streamFailure(event.code, event.retryable, event.requestId),
      };
    case "cancelled":
      if (state.phase !== "streaming") return state;
      return {
        ...state,
        phase: "cancelled",
        streamedText: "",
        result: null,
        failure: null,
      };
  }
}

function streamFailure(
  code: string,
  retryable: boolean,
  requestId: string,
): AppFailure {
  return {
    kind:
      code === "content_validation_failed"
        ? "contract_violation"
        : "generation_unavailable",
    code,
    status: null,
    requestId,
    fields: {},
    retryable,
  };
}
