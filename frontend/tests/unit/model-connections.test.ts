import { describe, expect, it } from "vitest";
import {
  modelConfiguration,
  modelEntryDraft,
  modelBatchConfiguration,
  repeatedModelIds,
  modelDraft,
  needsConnectionKey,
} from "@application/admin/model-draft";
import { adminModelSchema } from "@infrastructure/http/schemas/admin";
import { mapAdminModelDto } from "@infrastructure/http/mappers";

const raw = {
  id: "model",
  display_name: "My model",
  description: null,
  provider_model_id: "Vendor/Case-ID",
  enabled: true,
  retired_at: null,
  assigned_group_codes: [],
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  max_output_tokens: null,
  output_mode: "prompt",
  connection: {
    id: "provider",
    name: "Provider",
    protocol: "openai_chat",
    base_url: "https://example.com/custom/v1/",
    credential_configured: true,
    masked_hint: "••••abcd",
  },
};
const model = () => mapAdminModelDto(adminModelSchema.parse(raw), "revision");
describe("generic model configuration boundaries", () => {
  it("maps exact URL/model ID and rejects a secret or default-model field in responses", () => {
    expect(model().providerModelId).toBe("Vendor/Case-ID");
    expect(model().connection.baseUrl).toBe(raw.connection.base_url);
    expect(
      adminModelSchema.safeParse({ ...raw, is_default: true }).success,
    ).toBe(false);
    expect(
      adminModelSchema.safeParse({
        ...raw,
        connection: { ...raw.connection, api_key: "secret" },
      }).success,
    ).toBe(false);
  });
  it("keeps saved keys out of the edit draft and explicitly reuses an unchanged connection", () => {
    const m = model(),
      draft = modelDraft(m);
    expect(draft.apiKey).toBe("");
    expect(modelConfiguration(draft, [m.connection]).connection).toBeNull();
    expect(needsConnectionKey(draft, [m.connection])).toBe(false);
  });
  it("key replacement creates a new connection and destination changes require a fresh key", () => {
    const m = model(),
      draft = modelDraft(m);
    draft.apiKey = "replacement";
    expect(modelConfiguration(draft, [m.connection]).connection?.apiKey).toBe(
      "replacement",
    );
    expect(m.connection.maskedHint).toBe("••••abcd");
    draft.apiKey = "";
    draft.baseUrl = "https://another.example/v1";
    expect(needsConnectionKey(draft, [m.connection])).toBe(true);
    draft.baseUrl = m.connection.baseUrl;
    draft.protocol = "anthropic_messages";
    expect(needsConnectionKey(draft, [m.connection])).toBe(true);
  });
  it("starts new models disabled with no connection/default and preserves explicit limits", () => {
    const draft = modelDraft(undefined, "r");
    expect(draft.enabled).toBe(false);
    expect(draft.connectionChoice).toBe("new");
    expect(needsConnectionKey(draft, [])).toBe(true);
    expect(modelConfiguration(draft, []).maxOutputTokens).toBeNull();
    draft.maxOutputTokens = "4096";
    expect(modelConfiguration(draft, []).maxOutputTokens).toBe(4096);
  });
  it("shares one connection while keeping each model's options independent", () => {
    const draft = modelDraft(undefined, "r"),
      first = modelEntryDraft("first"),
      second = modelEntryDraft("second");
    draft.baseUrl = "https://provider.example/v1";
    draft.apiKey = "synthetic-key";
    first.providerModelId = "Vendor/Exact-ID";
    first.maxOutputTokens = "4096";
    first.outputMode = "json_schema";
    second.providerModelId = "Vendor/Other";
    second.displayName = " Other model ";
    const batch = modelBatchConfiguration(draft, [first, second], []);
    expect(batch.connection?.apiKey).toBe("synthetic-key");
    expect(batch.models[0]).toMatchObject({
      displayName: "Vendor/Exact-ID",
      providerModelId: "Vendor/Exact-ID",
      maxOutputTokens: 4096,
      outputMode: "json_schema",
    });
    expect(batch.models[1]).toMatchObject({
      displayName: "Other model",
      maxOutputTokens: null,
      outputMode: "prompt",
    });
    expect(batch.models.every((m) => !("connection" in m))).toBe(true);
    draft.protocol = "anthropic_messages";
    expect(
      modelBatchConfiguration(draft, [first], []).models[0]?.outputMode,
    ).toBe("prompt");
    expect(first.outputMode).toBe("json_schema");
  });
  it("blocks exact duplicate IDs while preserving case-sensitive provider identifiers", () => {
    const entries = ["Vendor/A", "vendor/a", "Vendor/A", ""].map(
      (id, index) => ({
        ...modelEntryDraft(String(index)),
        providerModelId: id,
      }),
    );
    expect([...repeatedModelIds(entries)]).toEqual(["Vendor/A"]);
    expect([...repeatedModelIds(entries.slice(1))]).toEqual([]);
  });
});
