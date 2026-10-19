import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { initialContentDraftState } from "@application/shared/models";
import {
  applyDraftEdit,
  applyDraftEvent,
} from "@application/generation/draft-reducer";

interface WireFrame {
  event: string;
  data: Record<string, unknown> & { seq: number };
}

interface Checkpoint {
  after_seq: number;
  published: string;
  working: string;
  rev: number;
}

interface Fixture {
  wire: WireFrame[];
  checkpoints: Checkpoint[];
}

const fixtureDirectory = resolve(
  process.cwd(),
  "../.planning/milestones/M002-legacy-M003/technical/fixtures/cr311-312",
);

const names = [
  "shorter",
  "longer-unchanged",
  "continuation",
  "q02-after-body",
  "unicode-crlf",
  "large-paragraph",
] as const;

describe("BE08 CR312 draft fixtures", () => {
  for (const name of names) {
    it(`replays ${name} without widening the wire contract`, () => {
      const fixture = JSON.parse(
        readFileSync(resolve(fixtureDirectory, `${name}.json`), "utf8"),
      ) as Fixture;
      const checkpoints = new Map(
        fixture.checkpoints.map((checkpoint) => [
          checkpoint.after_seq,
          checkpoint,
        ]),
      );
      let state = initialContentDraftState();

      for (const frame of fixture.wire) {
        if (frame.event === "generation.draft") {
          const data = frame.data;
          const reduced = applyDraftEvent(state, {
            kind: "draft",
            seq: data.seq,
            action: data.action,
            draftId: data.draft_id,
            contentVersion: data.content_version,
            mode: data.mode,
            baseRev: data.base_rev,
            paragraphIndex: data.paragraph_index,
            bodyLength: data.body_length,
            paragraphCount: data.paragraph_count,
          } as never);
          expect(reduced.ok, `${name} draft seq ${data.seq}`).toBe(true);
          state = reduced.state;
        } else if (frame.event === "generation.edit") {
          const data = frame.data;
          const reduced = applyDraftEdit(state, {
            kind: "edit",
            seq: data.seq,
            draftId: data.draft_id,
            contentVersion: data.content_version,
            baseRev: data.base_rev,
            rev: data.rev,
            at: data.at,
            deleteCount: data.delete_count,
            insert: data.insert,
            source: data.source,
          } as never);
          expect(reduced.ok, `${name} edit seq ${data.seq}`).toBe(true);
          state = reduced.state;
        }

        const checkpoint = checkpoints.get(frame.data.seq);
        if (checkpoint)
          expect(state, `${name} checkpoint ${frame.data.seq}`).toMatchObject({
            published: checkpoint.published,
            working: checkpoint.working,
            revision: checkpoint.rev,
          });
      }
    });
  }
});
