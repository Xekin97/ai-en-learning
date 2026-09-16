import type {
  ReviewAnswerModel,
  SafePassageSegmentModel,
} from "@application/shared/models";
import type { ClozeGroupStyleRegistry } from "./cloze-group-style-registry";

type PassageItem = {
  readonly stage: "passage_cloze";
  readonly itemId: string;
  readonly passageSegments: readonly SafePassageSegmentModel[];
};

export type PassageClozeSegmentViewModel =
  | { kind: "text"; text: string }
  | {
      kind: "blank";
      blankId: string;
      inputId: string;
      value: string;
      toneClass: string;
      patternClass: string;
      anonymousGroupName: string;
      active: boolean;
      muted: boolean;
      incorrect: boolean;
    };

export interface PassageClozeViewModel {
  guideId: string;
  segments: PassageClozeSegmentViewModel[];
}

export function passageGroupRefs(item: PassageItem) {
  return item.passageSegments.flatMap((segment) =>
    segment.kind === "blank" ? [segment.groupRef] : [],
  );
}

export function presentPassageCloze(input: {
  item: PassageItem;
  registry: ClozeGroupStyleRegistry;
  answers: Readonly<Record<string, string>>;
  incorrectBlankIds: readonly string[];
  activeBlankId: string | null;
}): PassageClozeViewModel {
  const activeGroup = input.item.passageSegments.find(
    (segment) =>
      segment.kind === "blank" && segment.blankId === input.activeBlankId,
  );
  let blankIndex = 0;
  return {
    guideId: "cloze-group-guide",
    segments: input.item.passageSegments.map((segment) => {
      if (segment.kind === "text") return { kind: "text", text: segment.text };
      const style = input.registry.styleFor(segment.groupRef);
      const currentIndex = blankIndex++;
      const active =
        activeGroup?.kind === "blank" &&
        activeGroup.groupRef === segment.groupRef;
      return {
        kind: "blank",
        blankId: segment.blankId,
        inputId: `${style.domHandle}-${currentIndex + 1}`,
        value: input.answers[segment.blankId] ?? "",
        toneClass: `cloze-tone-${style.toneToken}`,
        patternClass: `cloze-pattern-${style.patternToken}`,
        anonymousGroupName: style.anonymousName,
        active,
        muted: activeGroup?.kind === "blank" && !active,
        incorrect: input.incorrectBlankIds.includes(segment.blankId),
      };
    }),
  };
}

export function buildPassageAnswer(
  item: PassageItem,
  answers: Readonly<Record<string, string>>,
  actionId: string,
): ReviewAnswerModel {
  return {
    actionId,
    itemId: item.itemId,
    action: "answer",
    answers: item.passageSegments.flatMap((segment) =>
      segment.kind === "blank"
        ? [{ blankId: segment.blankId, answer: answers[segment.blankId] ?? "" }]
        : [],
    ),
  };
}
