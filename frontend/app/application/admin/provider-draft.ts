import type {
  AdminProviderModel,
  ProviderConfigurationInput,
} from "@application/shared/models";
import {
  modelDraft,
  modelBatchConfiguration,
  type EditableModel,
  type ModelEditorDraft,
  type ModelEntryDraft,
} from "./model-draft";
import { mergeEdited } from "./growth-drafts";
export type EditableProvider = {
  connection: AdminProviderModel["connection"];
  models: readonly EditableModel[];
};
export function providerDraft(
  provider?: EditableProvider,
  revision = "",
): ModelEditorDraft {
  const draft = modelDraft(undefined, revision),
    c = provider?.connection;
  if (c)
    Object.assign(draft, {
      connectionChoice: c.id,
      originalConnectionId: c.id,
      connectionName: c.name,
      protocol: c.protocol,
      baseUrl: c.baseUrl,
    });
  return draft;
}
export function providerConfiguration(
  draft: ModelEditorDraft,
  entries: readonly ModelEntryDraft[],
): ProviderConfigurationInput {
  const batch = modelBatchConfiguration(draft, entries, []);
  return {
    connection: {
      name: draft.connectionName,
      protocol: draft.protocol,
      baseUrl: draft.baseUrl,
      apiKey: draft.apiKey,
    },
    expectedRevision: draft.expectedRevision,
    models: batch.models.map((m, i) => ({
      ...m,
      id: entries[i]?.modelId ?? null,
    })),
  };
}
export function mergeProviderEntries(
  baseline: readonly ModelEntryDraft[],
  draft: readonly ModelEntryDraft[],
  remote: readonly ModelEntryDraft[],
): ModelEntryDraft[] {
  const next: ModelEntryDraft[] = [];
  for (const row of draft) {
    if (!row.modelId) {
      next.push(row);
      continue;
    }
    const updated = remote.find((r) => r.modelId === row.modelId),
      original = baseline.find((r) => r.modelId === row.modelId);
    if (updated)
      next.push(
        original
          ? mergeEdited(original, row, { ...updated, key: row.key })
          : { ...updated, key: row.key },
      );
  }
  for (const row of remote) {
    if (!next.some((r) => r.modelId === row.modelId)) next.push(row);
  }
  return next;
}
