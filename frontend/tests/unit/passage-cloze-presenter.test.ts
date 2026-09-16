import { describe, expect, it } from "vitest";
import type {
  ClozeGroupRef,
  SafePassageSegmentModel,
} from "@application/shared/models";
import {
  anonymousName,
  ClozeGroupStyleRegistry,
  type RandomSource,
} from "@presentation/review/cloze-group-style-registry";
import {
  buildPassageAnswer,
  passageGroupRefs,
  presentPassageCloze,
} from "@presentation/review/passage-cloze-presenter";
import { hasStablePassageTopology } from "@application/review/topology";

const fixedRandom: RandomSource = { nextInt: () => 0 };

describe("passage cloze presentation", () => {
  it("allocates distinct first-round colors and unique first 24 pairs", () => {
    const groups = Array.from(
      { length: 27 },
      (_, index) => `group-${index}` as ClozeGroupRef,
    );
    const registry = new ClozeGroupStyleRegistry(
      "attempt:item",
      groups,
      fixedRandom,
    );
    const styles = groups.map((group) => registry.styleFor(group));
    expect(
      new Set(styles.slice(0, 6).map((style) => style.toneToken)).size,
    ).toBe(6);
    expect(
      new Set(
        styles
          .slice(0, 24)
          .map((style) => `${style.toneToken}:${style.patternToken}`),
      ).size,
    ).toBe(24);
    expect(styles[24]?.toneToken).toBe(styles[0]?.toneToken);
    expect(anonymousName(0)).toBe("A");
    expect(anonymousName(25)).toBe("Z");
    expect(anonymousName(26)).toBe("AA");
  });

  it("keeps same-source blanks aligned while errors remain independent", () => {
    const item = passageItem();
    const registry = new ClozeGroupStyleRegistry(
      "attempt:item",
      passageGroupRefs(item),
      fixedRandom,
    );
    const model = presentPassageCloze({
      item,
      registry,
      answers: { "blank-1": "one" },
      incorrectBlankIds: ["blank-3"],
      activeBlankId: "blank-1",
    });
    const blanks = model.segments.filter((segment) => segment.kind === "blank");
    expect(blanks[0]?.toneClass).toBe(blanks[2]?.toneClass);
    expect(blanks[0]?.patternClass).toBe(blanks[2]?.patternClass);
    expect(blanks[0]?.anonymousGroupName).toBe(blanks[2]?.anonymousGroupName);
    expect(blanks[0]?.active).toBe(true);
    expect(blanks[2]?.active).toBe(true);
    expect(blanks[1]?.muted).toBe(true);
    expect(blanks[0]?.incorrect).toBe(false);
    expect(blanks[2]?.incorrect).toBe(true);
  });

  it("assembles actions with blank ids and answers only", () => {
    const action = buildPassageAnswer(
      passageItem(),
      { "blank-1": "adapt", "blank-2": "weave", "blank-3": "adapted" },
      "action-1",
    );
    expect(JSON.stringify(action)).not.toContain("group");
    expect(action).toMatchObject({ action: "answer", itemId: "item-1" });
  });

  it("detects a changed retry equivalence topology", () => {
    const first = passageItem();
    const stable = passageItem();
    const changed = passageItem();
    const segment = changed.passageSegments[5];
    if (segment?.kind === "blank")
      segment.groupRef = "group-other" as ClozeGroupRef;
    expect(hasStablePassageTopology(first, stable)).toBe(true);
    expect(hasStablePassageTopology(first, changed)).toBe(false);
  });
});

function passageItem() {
  const first = "group-first" as ClozeGroupRef;
  const second = "group-second" as ClozeGroupRef;
  const passageSegments: SafePassageSegmentModel[] = [
    { kind: "text", text: "They " },
    { kind: "blank", blankId: "blank-1", groupRef: first },
    { kind: "text", text: " and " },
    { kind: "blank", blankId: "blank-2", groupRef: second },
    { kind: "text", text: ", then " },
    { kind: "blank", blankId: "blank-3", groupRef: first },
    { kind: "text", text: " again." },
  ];
  return { stage: "passage_cloze" as const, itemId: "item-1", passageSegments };
}
