import { describe, it, expect } from "vitest";
import { modelEntryDraft } from "@application/admin/model-draft";
import {
  providerDraft,
  providerConfiguration,
  mergeProviderEntries,
} from "@application/admin/provider-draft";
import { adminProviderListEnvelopeSchema } from "@infrastructure/http/schemas/admin";
describe("provider workspace drafts", () => {
  it("submits stable model IDs and new entries under one provider connection", () => {
    const draft = providerDraft(undefined, "revision");
    draft.connectionName = "Provider";
    draft.baseUrl = "https://provider.example/v1";
    draft.apiKey = "synthetic-key";
    const first = {
      ...modelEntryDraft("first"),
      modelId: "existing-id",
      providerModelId: "Existing/Case",
      displayName: "Changed",
    };
    const second = { ...modelEntryDraft("second"), providerModelId: "New/ID" };
    const input = providerConfiguration(draft, [first, second]);
    expect(input.models.map((m) => m.id)).toEqual(["existing-id", null]);
    expect(input.models[1]?.displayName).toBe("New/ID");
    expect(input.connection.apiKey).toBe("synthetic-key");
    expect(input.models.every((m) => !("connection" in m))).toBe(true);
  });
  it("merges by identity, retains local additions, includes remote additions and drops retired rows", () => {
    const old = {
      ...modelEntryDraft("old-key"),
      modelId: "one",
      providerModelId: "One",
      displayName: "Baseline",
    };
    const removed = {
      ...modelEntryDraft("removed"),
      modelId: "retired",
      providerModelId: "Retired",
    };
    const added = {
      ...modelEntryDraft("draft-new"),
      providerModelId: "Local/New",
    };
    const remote = { ...old, key: "remote-key", maxOutputTokens: "8000" };
    const remoteNew = {
      ...modelEntryDraft("remote-new"),
      modelId: "two",
      providerModelId: "Remote/New",
    };
    const merged = mergeProviderEntries(
      [old, removed],
      [{ ...old, displayName: "Local edit" }, removed, added],
      [remote, remoteNew],
    );
    expect(merged.map((m) => m.modelId)).toEqual(["one", null, "two"]);
    expect(merged[0]).toMatchObject({
      key: "old-key",
      displayName: "Local edit",
      maxOutputTokens: "8000",
    });
    expect(merged[1]).toEqual(added);
  });
  it("accepts an empty provider while rejecting exposed credentials in a grouped response", () => {
    const connection = {
      id: "provider",
      name: "Provider",
      protocol: "openai_chat",
      base_url: "https://provider.example/v1",
      credential_configured: true,
      masked_hint: "••••test",
    };
    const envelope = {
      data: { items: [{ connection, models: [] }], revision: "r" },
      meta: { request_id: "test" },
    };
    expect(adminProviderListEnvelopeSchema.safeParse(envelope).success).toBe(
      true,
    );
    expect(
      adminProviderListEnvelopeSchema.safeParse({
        ...envelope,
        data: {
          ...envelope.data,
          items: [
            { connection: { ...connection, api_key: "secret" }, models: [] },
          ],
        },
      }).success,
    ).toBe(false);
  });
});
