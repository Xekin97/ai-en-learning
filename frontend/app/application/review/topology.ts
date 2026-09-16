import type { ReviewItemModel } from "../shared/models";

export function hasStablePassageTopology(
  previous: ReviewItemModel,
  next: ReviewItemModel,
): boolean {
  if (
    previous.stage !== "passage_cloze" ||
    next.stage !== "passage_cloze" ||
    previous.itemId !== next.itemId ||
    previous.passageSegments.length !== next.passageSegments.length
  )
    return false;

  return previous.passageSegments.every((segment, index) => {
    const candidate = next.passageSegments[index];
    if (!candidate || segment.kind !== candidate.kind) return false;
    if (segment.kind === "text")
      return candidate.kind === "text" && segment.text === candidate.text;
    return (
      candidate.kind === "blank" &&
      segment.blankId === candidate.blankId &&
      segment.groupRef === candidate.groupRef
    );
  });
}

export function passageTopologyError(): Error {
  const error = new Error("Passage cloze topology changed during retry");
  error.name = "ContractMappingError";
  return error;
}
