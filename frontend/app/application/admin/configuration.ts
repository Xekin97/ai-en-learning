import type {
  AdminModelModel,
  GroupCode,
  GroupPolicyModel,
  PassageLength,
} from "@application/shared/models";
export interface GroupDraft {
  priority: number;
  rolling24hLimit: number | null;
  maxEntries: number;
  allowedLengths: PassageLength[];
  modelIds: string[];
  expectedRevision: string;
}
export interface ModelRemovalImpact {
  model: AdminModelModel;
  affectedGroups: { code: GroupCode; remainingEnabledModels: number }[];
  affectedPresets: number;
  affectedItemDefinitions: number;
  affectedOwnedCards: number;
  revision: string;
}
export interface GroupImpact {
  baseUsers: number;
  activeTrialUsers: number;
  priorityChanged: boolean;
  mayChangeEffectivePlan: boolean;
  losesAllModels: boolean;
  revision: string;
}
export interface AdminConfigurationPort {
  previewModelRemoval(id: string): Promise<ModelRemovalImpact>;
  removeModel(id: string, expectedRevision: string): Promise<AdminModelModel>;
  clearModelRemoval(id: string): void;
  previewGroup(code: GroupCode, input: GroupDraft): Promise<GroupImpact>;
  previewPriorities(
    priorities: { code: GroupCode; priority: number }[],
    expectedRevision: string,
  ): Promise<{
    affectedBaseUsers: number;
    affectedTrialUsers: number;
    revision: string;
  }>;
  savePriorities(
    priorities: { code: GroupCode; priority: number }[],
    expectedRevision: string,
  ): Promise<GroupPolicyModel[]>;
}
