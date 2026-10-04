import type { Bilingual } from "./notices";
import type { ItemKind } from "@application/growth/models";
import type { PlanCode, PageModel } from "@application/shared/models";
export type ItemDefinitionEffect =
  | { kind: "makeup" }
  | { kind: "extra_credit"; extraCount: number }
  | {
      kind: "model_trial";
      modelIds: string[];
      trialSeconds: number;
      retirementPoints: string;
    }
  | { kind: "plan_trial"; targetPlanCode: PlanCode; trialSeconds: number };
export interface ItemDefinitionInput {
  kind: ItemKind;
  name: Bilingual;
  description: Bilingual;
  exchangePrice: string;
  activationTtlSeconds: number;
  effect: ItemDefinitionEffect;
}
export interface ItemDefinitionModel extends ItemDefinitionInput {
  id: string;
  listed: boolean;
  everIssued: boolean;
  referenceCount: number;
  createdAt: string;
  updatedAt: string;
  revision: string;
}
export interface ItemReferenceModel {
  kind: "level" | "achievement";
  id: string;
  name: string;
  enabled: boolean;
}
export interface AdminItemsPort {
  listItemDefinitions(input?: {
    query?: string;
    kind?: ItemKind;
    listed?: boolean;
    cursor?: string;
  }): Promise<PageModel<ItemDefinitionModel>>;
  getItemDefinition(id: string): Promise<ItemDefinitionModel>;
  saveItemDefinition(
    id: string | null,
    input: ItemDefinitionInput,
    revision: string | null,
  ): Promise<ItemDefinitionModel>;
  setItemListing(
    id: string,
    listed: boolean,
    revision: string,
  ): Promise<ItemDefinitionModel>;
  deleteItemDefinition(id: string, revision: string): Promise<void>;
  listItemReferences(
    id: string,
    cursor?: string,
  ): Promise<PageModel<ItemReferenceModel> & { everIssued: boolean }>;
}
