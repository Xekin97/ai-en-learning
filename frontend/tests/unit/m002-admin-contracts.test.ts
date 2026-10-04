import { describe, it, expect } from "vitest";
import { adminGenerationOptionsSchema } from "@infrastructure/http/schemas/admin-presets";
import { mapAdminGenerationOptions } from "@infrastructure/http/mappers/admin-presets-mapper";
import {
  achievementFieldsSchema,
  growthSettingsSchema,
} from "@infrastructure/http/schemas/admin-growth";
import { achievementBody } from "@infrastructure/http/mappers/admin-growth-mapper";
import {
  canonicalAmount,
  issueKeys,
  mergeEdited,
  validateLevels,
} from "@application/admin/growth-drafts";
import { createAdminGrowthRepository } from "@infrastructure/http/repositories/admin-growth-repository";
import { createAdminPresetsRepository } from "@infrastructure/http/repositories/admin-presets-repository";
import { TokenVault } from "@runtime/session/token-vault";
const options = () => ({
  models: [{ id: "model", name: "Model", description: null }],
  meaning_languages: ["zh", "en", "ja"],
  scenarios: ["discussion", "story", "business", "news"],
  lengths: ["short", "medium", "long", "xlong"],
  vocabulary_version: "vocabulary",
  revision: "revision",
  availability: { can_preview: true, reason: null },
});
const achievement = () => ({
  threshold: 7,
  enabled: true,
  name: { zh_CN: null, en_US: "Reader" },
  title: { zh_CN: null, en_US: "Explorer" },
  description: { zh_CN: null, en_US: " <b>plain text</b> " },
  reward: {
    points: "9223372036854775807",
    experience: "0",
    item_definition_id: null,
    item_count: 0,
  },
});
const reply = (data: unknown) =>
  new Response(JSON.stringify({ data, meta: { request_id: "test" } }), {
    headers: { "content-type": "application/json" },
  });
describe("M002 admin contract boundaries", () => {
  it.each(["max_entries", "quota", "access", "provider_model_id", "api_key"])(
    "rejects user-plan/provider field %s in preview options",
    (key) =>
      expect(
        adminGenerationOptionsSchema.safeParse({
          ...options(),
          [key]: "forbidden",
        }).success,
      ).toBe(false),
  );
  it.each([
    null,
    [],
    ["zh", "en"],
    ["zh", "en", "ja", "fr"],
    ["en", "zh", "ja"],
  ])("requires complete ordered language options %j", (value) =>
    expect(
      adminGenerationOptionsSchema.safeParse({
        ...options(),
        meaning_languages: value,
      }).success,
    ).toBe(false),
  );
  it("maps a missing credential while retaining editable models and strict blocked reason", () => {
    const raw = {
      ...options(),
      availability: { can_preview: false, reason: "credential_missing" },
    };
    const view = mapAdminGenerationOptions(
      adminGenerationOptionsSchema.parse(raw),
    );
    expect(view.availability).toEqual({
      kind: "blocked",
      reason: "credentialMissing",
    });
    expect(view.models[0]?.id).toBe("model");
    expect(view).not.toHaveProperty("quota");
    expect(
      adminGenerationOptionsSchema.safeParse({
        ...raw,
        availability: { can_preview: true, reason: "credential_missing" },
      }).success,
    ).toBe(false);
  });
  it.each([
    undefined,
    null,
    {},
    { en_US: null },
    { zh_CN: null, en_US: "𠮷".repeat(2001) },
  ])("rejects malformed description slots %j", (description) =>
    expect(
      achievementFieldsSchema.safeParse({ ...achievement(), description })
        .success,
    ).toBe(false),
  );
  it("preserves empty language slots, plain description text and exact 64-bit amounts", () => {
    expect(achievementFieldsSchema.parse(achievement()).description.en_US).toBe(
      " <b>plain text</b> ",
    );
    const body = achievementBody({
      threshold: 1,
      enabled: true,
      nameText: { zh: " ", en: "Reader" },
      honorText: { zh: null, en: "Explorer" },
      descriptionText: { zh: null, en: " <b>plain text</b> " },
      reward: {
        points: "9223372036854775807",
        experience: "0",
        itemDefinitionId: null,
        itemCount: 0,
      },
    });
    expect(body.name.zh_CN).toBeNull();
    expect(body.description).toEqual({
      zh_CN: null,
      en_US: " <b>plain text</b> ",
    });
    expect(canonicalAmount("9223372036854775807")).toBe(true);
    expect(canonicalAmount("9223372036854775808")).toBe(false);
  });
  it("does not seed initial unconfigured check-in rules", () => {
    const parsed = growthSettingsSchema.parse({
      learning_day: "2026-09-20",
      mastery_experience: "0",
      growth_started_at: null,
      current: null,
      pending: null,
      revision: "r",
    });
    expect(parsed.current).toBeNull();
    expect(parsed.pending).toBeNull();
  });
  it("validates arbitrarily many ordered levels and maps errors to submitted client keys", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: "row-" + i,
      clientKey: crypto.randomUUID(),
      value: {
        levelNumber: i + 1,
        minExperience: String(i * 100),
        rewardEnabled: i > 0,
        reward: { points: "0", itemDefinitionId: null, itemCount: 0 },
      },
    }));
    expect(validateLevels(rows)).toBe(true);
    expect(
      issueKeys({ "/changes/0/value/min_experience": "invalid" }, [rows[10]!]),
    ).toEqual({ [rows[10]!.clientKey]: ["/value/min_experience:invalid"] });
    rows[5]!.value.minExperience = "0";
    expect(validateLevels(rows)).toBe(false);
  });
  it("adopts remote unedited fields without replacing explicit local edits", () => {
    expect(
      mergeEdited(
        { name: { zh: null as string | null, en: "Old" }, price: "5" },
        { name: { zh: null, en: "Mine" }, price: "5" },
        { name: { zh: "新", en: "Theirs" }, price: "7" },
      ),
    ).toEqual({ name: { zh: "新", en: "Mine" }, price: "7" });
  });
  it.each(["wrong-key", "wrong-id", "missing", "duplicate"])(
    "rejects invalid saved-row correspondence %s",
    async (kind) => {
      const vault = new TokenVault();
      vault.setCsrf("csrf");
      vault.setConfirmation("growth-levels", "capability");
      const key = crypto.randomUUID(),
        input = {
          expectedRevision: "revision",
          changes: [
            {
              clientKey: key,
              id: "level-2",
              value: {
                levelNumber: 2,
                minExperience: "10",
                rewardEnabled: true,
                reward: { points: "0", itemDefinitionId: null, itemCount: 0 },
              },
            },
          ],
        };
      let rows = [{ client_key: key, id: "level-2" }];
      if (kind === "wrong-key") rows[0]!.client_key = crypto.randomUUID();
      if (kind === "wrong-id") rows[0]!.id = "other";
      if (kind === "missing") rows = [];
      if (kind === "duplicate") rows.push({ ...rows[0]! });
      const repo = createAdminGrowthRepository(
        {
          send: async () =>
            reply({
              configuration: {
                items: [
                  {
                    id: "level-2",
                    level_number: 2,
                    min_experience: "10",
                    reward_enabled: true,
                    reward: {
                      points: "0",
                      item_definition_id: null,
                      item_count: 0,
                    },
                  },
                ],
                revision: "new",
              },
              saved_rows: rows,
            }),
        },
        vault,
      );
      await expect(repo.saveLevelChanges(input)).rejects.toMatchObject({
        kind: "contract_violation",
      });
    },
  );
  it("preview and PUT carry the same frozen changes, with capability kept outside safe response", async () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    const sent: {
      method?: string;
      headers: Headers;
      body: Record<string, unknown>;
    }[] = [];
    const key = crypto.randomUUID(),
      value = {
        levelNumber: 1,
        minExperience: "0",
        rewardEnabled: false,
        reward: { points: "0", itemDefinitionId: null, itemCount: 0 },
      },
      input = {
        expectedRevision: "r",
        changes: [{ clientKey: key, id: null, value }],
      };
    const repo = createAdminGrowthRepository(
      {
        async send(path, init) {
          sent.push({
            method: init?.method,
            headers: new Headers(init?.headers),
            body: JSON.parse(String(init?.body)),
          });
          return path.endsWith("impact-preview")
            ? reply({
                may_downgrade: false,
                affected_users: 0,
                rewards_use_latest_config: true,
                confirmation_token: "private-preview",
                expires_at: "2099-01-01T00:00:00Z",
                revision: "r",
              })
            : reply({
                configuration: {
                  items: [
                    {
                      id: "level-1",
                      level_number: 1,
                      min_experience: "0",
                      reward_enabled: false,
                      reward: {
                        points: "0",
                        item_definition_id: null,
                        item_count: 0,
                      },
                    },
                  ],
                  revision: "next",
                },
                saved_rows: [{ client_key: key, id: "level-1" }],
              });
        },
      },
      vault,
    );
    expect(JSON.stringify(await repo.previewLevelChanges(input))).not.toContain(
      "private-preview",
    );
    await repo.saveLevelChanges(input);
    expect(sent[1]?.body.changes).toEqual(sent[0]?.body.changes);
    expect(sent[1]?.headers.has("idempotency-key")).toBe(false);
    expect(sent[1]?.body.confirmation_token).toBe("private-preview");
    expect(() => vault.confirmation("growth-levels")).toThrow();
  });
  it.each(["passage.delta", "preview.validated"])(
    "rejects preview %s before started without exposing credentials",
    async (event) => {
      const vault = new TokenVault();
      vault.setCsrf("csrf");
      const repo = createAdminPresetsRepository(
        {
          send: async () =>
            new Response(`event: ${event}\ndata: {}\n\n`, {
              headers: { "content-type": "text/event-stream" },
            }),
        },
        vault,
      );
      await expect(
        repo.streamPresetPreview(
          "id",
          "version",
          () => {},
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: "contract_violation" });
    },
  );
  it("does not treat EOF after partial preview text as success", async () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    const events: string[] = [];
    const repo = createAdminPresetsRepository(
      {
        send: async () =>
          new Response(
            'event: preview.started\ndata: {"preview_run_id":"run","preview_token":"secret"}\n\nevent: passage.delta\ndata: {"text":"Partial"}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          ),
      },
      vault,
    );
    await expect(
      repo.streamPresetPreview(
        "id",
        "version",
        (event) => events.push(event.kind),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "network" });
    expect(events).toEqual(["started", "delta"]);
    expect(() => vault.confirmation("preset-preview:run")).toThrow();
  });
});
