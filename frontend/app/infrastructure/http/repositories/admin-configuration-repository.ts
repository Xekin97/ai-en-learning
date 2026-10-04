import type {
  AdminConfigurationPort,
  GroupDraft,
} from "@application/admin/configuration";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import {
  removalImpactEnvelopeSchema,
  modelRemovedEnvelopeSchema,
  groupImpactEnvelopeSchema,
  priorityImpactEnvelopeSchema,
  adminGroupsEnvelopeSchema,
} from "../schemas/admin";
import { mapAdminModelDto, mapGroupDto } from "../mappers";
import { json } from "./repository-support";
export const groupDraftBody = (input: GroupDraft) => ({
  expected_revision: input.expectedRevision,
  priority: input.priority,
  rolling_24h_limit: input.rolling24hLimit,
  max_entries: input.maxEntries,
  allowed_lengths: [...input.allowedLengths],
  model_ids: [...input.modelIds],
});
export function createAdminConfigurationRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminConfigurationPort {
  const command = (method: string, body: unknown): RequestInit => ({
    method,
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
    },
    body: JSON.stringify(body),
  });
  return {
    async previewModelRemoval(id) {
      const { data } = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(id)}/removal-impact`,
        removalImpactEnvelopeSchema,
      );
      vault.setConfirmation("remove-model:" + id, data.confirmation_token);
      return {
        model: mapAdminModelDto(data.model, data.revision),
        affectedGroups: data.affected_groups.map((g) => ({
          code: g.code,
          remainingEnabledModels: g.remaining_enabled_models,
        })),
        affectedPresets: data.affected_presets,
        affectedItemDefinitions: data.affected_item_definitions,
        affectedOwnedCards: data.affected_owned_cards,
        revision: data.revision,
      };
    },
    async removeModel(id, expectedRevision) {
      const { data } = await json(
        transport,
        `/api/v1/admin/models/${encodeURIComponent(id)}`,
        modelRemovedEnvelopeSchema,
        command("DELETE", {
          expected_revision: expectedRevision,
          confirmation_token: vault.confirmation("remove-model:" + id),
          confirmed: true,
        }),
      );
      vault.setConfirmation("remove-model:" + id, null);
      return mapAdminModelDto(data.model, data.revision);
    },
    clearModelRemoval(id) {
      vault.setConfirmation("remove-model:" + id, null);
    },
    async previewGroup(code, input) {
      const { data } = await json(
        transport,
        `/api/v1/admin/groups/${code}/impact-preview`,
        groupImpactEnvelopeSchema,
        command("POST", groupDraftBody(input)),
      );
      return {
        baseUsers: data.base_users,
        activeTrialUsers: data.active_trial_users,
        priorityChanged: data.priority_changed,
        mayChangeEffectivePlan: data.may_change_effective_plan,
        losesAllModels: data.loses_all_models,
        revision: data.revision,
      };
    },
    async previewPriorities(priorities, expectedRevision) {
      const { data } = await json(
        transport,
        "/api/v1/admin/groups/priority-impact",
        priorityImpactEnvelopeSchema,
        command("POST", {
          expected_revision: expectedRevision,
          priorities: priorities.map((p) => ({
            code: p.code,
            priority: p.priority,
          })),
        }),
      );
      return {
        affectedBaseUsers: data.affected_base_users,
        affectedTrialUsers: data.affected_trial_users,
        revision: data.revision,
      };
    },
    async savePriorities(priorities, expectedRevision) {
      const { data } = await json(
        transport,
        "/api/v1/admin/groups/priorities",
        adminGroupsEnvelopeSchema,
        command("PUT", {
          expected_revision: expectedRevision,
          priorities: priorities.map((p) => ({
            code: p.code,
            priority: p.priority,
          })),
        }),
      );
      return data.items.map((g) => mapGroupDto(g, data.revision));
    },
  };
}
