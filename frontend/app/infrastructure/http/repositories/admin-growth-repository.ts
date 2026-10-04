import type {
  AdminGrowthPort,
  LevelChangesModel,
  AchievementChangesModel,
} from "@application/admin/growth";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import * as schema from "../schemas/admin-growth";
import {
  mapGrowthSettings,
  mapLevel,
  mapAchievementConfig,
  levelBody,
  achievementBody,
} from "../mappers/admin-growth-mapper";
import { json, contractFailure } from "./repository-support";
function validateSavedRows(
  changes: { clientKey: string; id: string | null }[],
  rows: { client_key: string; id: string }[],
  items: { id: string }[],
) {
  if (
    rows.length !== changes.length ||
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    rows.some(
      (r, i) =>
        r.client_key !== changes[i]?.clientKey ||
        (changes[i]?.id !== null && changes[i]?.id !== r.id) ||
        !items.some((item) => item.id === r.id),
    )
  )
    throw contractFailure();
  return rows.map((r) => ({ clientKey: r.client_key, id: r.id }));
}
const levelsBody = (input: LevelChangesModel) =>
  schema.levelChangesSchema.parse({
    expected_revision: input.expectedRevision,
    changes: input.changes.map((c) => ({
      client_key: c.clientKey,
      id: c.id,
      value: levelBody(c.value),
    })),
  });
const achievementsBody = (input: AchievementChangesModel) =>
  schema.achievementChangesSchema.parse({
    kind: input.kind,
    expected_revision: input.expectedRevision,
    changes: input.changes.map((c) => ({
      client_key: c.clientKey,
      id: c.id,
      value: achievementBody(c.value),
    })),
  });
export function createAdminGrowthRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminGrowthPort {
  const root = "/api/v1/admin/growth",
    command = (method: string, body: unknown): RequestInit => ({
      method,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": vault.csrf(),
      },
      body: JSON.stringify(body),
    });
  return {
    async getGrowthSettings() {
      return mapGrowthSettings(
        (
          await json(
            transport,
            root + "/settings",
            schema.growthSettingsEnvelopeSchema,
          )
        ).data,
      );
    },
    async saveGrowthSettings(input) {
      return mapGrowthSettings(
        (
          await json(
            transport,
            root + "/settings",
            schema.growthSettingsEnvelopeSchema,
            command("PUT", {
              expected_revision: input.expectedRevision,
              mastery_experience: input.masteryExperience,
              base_points: input.basePoints,
              step_points: input.stepPoints,
              cap_points: input.capPoints,
              normal_experience: input.normalExperience,
            }),
          )
        ).data,
      );
    },
    async getLevelConfiguration() {
      const { data } = await json(
        transport,
        root + "/levels",
        schema.levelConfigurationEnvelopeSchema,
      );
      return { items: data.items.map(mapLevel), revision: data.revision };
    },
    async previewLevelChanges(input) {
      const { data } = await json(
        transport,
        root + "/levels/impact-preview",
        schema.levelImpactEnvelopeSchema,
        command("POST", levelsBody(input)),
      );
      vault.setConfirmation("growth-levels", data.confirmation_token);
      return {
        mayDowngrade: data.may_downgrade,
        affectedUsers: data.affected_users,
        rewardsUseLatestConfig: data.rewards_use_latest_config,
        expiresAt: data.expires_at,
        revision: data.revision,
      };
    },
    async saveLevelChanges(input) {
      const { data } = await json(
        transport,
        root + "/levels",
        schema.levelSavedEnvelopeSchema,
        command("PUT", {
          ...levelsBody(input),
          confirmation_token: vault.confirmation("growth-levels"),
          confirmed: true,
        }),
      );
      const savedRows = validateSavedRows(
        input.changes,
        data.saved_rows,
        data.configuration.items,
      );
      vault.setConfirmation("growth-levels", null);
      return {
        configuration: {
          items: data.configuration.items.map(mapLevel),
          revision: data.configuration.revision,
        },
        savedRows,
      };
    },
    clearLevelPreview() {
      vault.setConfirmation("growth-levels", null);
    },
    async getAchievementConfiguration(kind) {
      const { data } = await json(
        transport,
        root + "/achievements?" + new URLSearchParams({ kind }),
        schema.achievementConfigurationEnvelopeSchema,
      );
      if (data.kind !== kind || data.items.some((r) => r.kind !== kind))
        throw contractFailure();
      return {
        kind: data.kind,
        items: data.items.map(mapAchievementConfig),
        revision: data.revision,
      };
    },
    async saveAchievementChanges(input) {
      const { data } = await json(
        transport,
        root + "/achievements",
        schema.achievementSavedEnvelopeSchema,
        command("PUT", achievementsBody(input)),
      );
      if (
        data.configuration.kind !== input.kind ||
        data.configuration.items.some((r) => r.kind !== input.kind)
      )
        throw contractFailure();
      const savedRows = validateSavedRows(
        input.changes,
        data.saved_rows,
        data.configuration.items,
      );
      return {
        configuration: {
          kind: data.configuration.kind,
          items: data.configuration.items.map(mapAchievementConfig),
          revision: data.configuration.revision,
        },
        savedRows,
      };
    },
  };
}
