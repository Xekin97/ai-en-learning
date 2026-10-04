import type {
  AdminModelModel,
  ModelConfigurationInput,
  ModelConnectionModel,
  ModelProtocol,
  ModelBatchConfigurationInput,
} from "@application/shared/models";

export type EditableModel = Pick<
  AdminModelModel,
  | "id"
  | "displayName"
  | "description"
  | "providerModelId"
  | "connection"
  | "maxOutputTokens"
  | "outputMode"
  | "enabled"
  | "revision"
>;
export function modelDraft(model?: EditableModel, revision = "") {
  return {
    modelId: model?.id ?? null,
    displayName: model?.displayName ?? "",
    description: model?.description ?? "",
    providerModelId: model?.providerModelId ?? "",
    connectionChoice: model?.connection.id ?? "new",
    originalConnectionId: model?.connection.id ?? null,
    connectionName: model?.connection.name ?? "",
    protocol: model?.connection.protocol ?? ("openai_chat" as ModelProtocol),
    baseUrl: model?.connection.baseUrl ?? "",
    apiKey: "",
    maxOutputTokens: model?.maxOutputTokens?.toString() ?? "",
    outputMode: model?.outputMode ?? "prompt",
    enabled: model?.enabled ?? false,
    expectedRevision: model?.revision ?? revision,
  };
}
export type ModelEditorDraft = ReturnType<typeof modelDraft>;
export function modelConfiguration(
  draft: ModelEditorDraft,
  connections: readonly ModelConnectionModel[],
): ModelConfigurationInput {
  const sourceId =
    draft.connectionChoice === "new"
      ? draft.originalConnectionId
      : draft.connectionChoice;
  const source = connections.find((c) => c.id === sourceId);
  const unchanged =
    draft.connectionChoice !== "new" &&
    source &&
    source.name === draft.connectionName &&
    source.protocol === draft.protocol &&
    source.baseUrl === draft.baseUrl &&
    !draft.apiKey;
  return {
    displayName:
      draft.displayName.trim() ||
      Array.from(draft.providerModelId).slice(0, 200).join(""),
    description: draft.description.trim() || null,
    providerModelId: draft.providerModelId,
    connectionId: sourceId,
    connection: unchanged
      ? null
      : {
          name: draft.connectionName,
          protocol: draft.protocol,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
        },
    maxOutputTokens:
      draft.maxOutputTokens === "" ? null : Number(draft.maxOutputTokens),
    outputMode:
      draft.protocol === "anthropic_messages" ? "prompt" : draft.outputMode,
    enabled: draft.enabled,
    expectedRevision: draft.expectedRevision,
  };
}
export function needsConnectionKey(
  draft: ModelEditorDraft,
  connections: readonly ModelConnectionModel[],
) {
  const id =
    draft.connectionChoice === "new"
      ? draft.originalConnectionId
      : draft.connectionChoice;
  const source = connections.find((c) => c.id === id);
  return (
    !source?.credentialConfigured ||
    source.baseUrl !== draft.baseUrl ||
    source.protocol !== draft.protocol
  );
}

export function modelEntryDraft(key: string, model?: EditableModel) {
  const draft = modelDraft(model);
  return {
    key,
    modelId: model?.id ?? null,
    displayName: draft.displayName,
    providerModelId: draft.providerModelId,
    description: draft.description,
    maxOutputTokens: draft.maxOutputTokens,
    outputMode: draft.outputMode,
    enabled: draft.enabled,
  };
}
export type ModelEntryDraft = ReturnType<typeof modelEntryDraft>;
export function modelBatchConfiguration(
  draft: ModelEditorDraft,
  entries: readonly ModelEntryDraft[],
  connections: readonly ModelConnectionModel[],
): ModelBatchConfigurationInput {
  const shared = modelConfiguration(draft, connections);
  return {
    connectionId: shared.connectionId,
    connection: shared.connection,
    expectedRevision: draft.expectedRevision,
    models: entries.map((entry) => {
      const input = modelConfiguration({ ...draft, ...entry }, connections);
      return {
        displayName: input.displayName,
        providerModelId: input.providerModelId,
        description: input.description,
        maxOutputTokens: input.maxOutputTokens,
        outputMode: input.outputMode,
        enabled: input.enabled,
      };
    }),
  };
}
export function repeatedModelIds(
  entries: readonly ModelEntryDraft[],
): Set<string> {
  const seen = new Set<string>(),
    repeated = new Set<string>();
  for (const entry of entries) {
    if (entry.providerModelId && seen.has(entry.providerModelId))
      repeated.add(entry.providerModelId);
    seen.add(entry.providerModelId);
  }
  return repeated;
}
