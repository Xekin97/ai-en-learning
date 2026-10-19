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
  content_review_enabled: input.contentReviewEnabled,
  content_repair_limit: input.contentRepairLimit,
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
        contentServiceChange: {
          before: {
            contentReviewEnabled:
              data.content_service_change.before.content_review_enabled,
            contentRepairLimit:
              data.content_service_change.before.content_repair_limit,
          },
          after: {
            contentReviewEnabled:
              data.content_service_change.after.content_review_enabled,
            contentRepairLimit:
              data.content_service_change.after.content_repair_limit,
          },
        },
        appliesTo: data.applies_to,
        inFlightPolicy: data.in_flight_policy,
        usageReset: data.usage_reset,
        trialDatesChanged: data.trial_dates_changed,
        warnings: [...data.warnings],
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
        contentServiceByPlan: data.content_service_by_plan.map((item) => ({
          code: item.code,
          contentReviewEnabled: item.content_review_enabled,
          contentRepairLimit: item.content_repair_limit,
        })),
        mayChangeContentService: data.may_change_content_service,
        appliesTo: data.applies_to,
        inFlightPolicy: data.in_flight_policy,
        usageReset: data.usage_reset,
        trialDatesChanged: data.trial_dates_changed,
        nativeCorrectionPolicy: {
          version: data.native_correction_policy.version,
          scope: data.native_correction_policy.scope,
          maxCalls: data.native_correction_policy.max_calls,
          editable: data.native_correction_policy.editable,
        },
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
      return data.items.map((g) =>
        mapGroupDto(g, data.revision, data.native_correction_policy),
      );
    },
  };
}
