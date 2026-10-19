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
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";
import { mergeProviderEntries } from "@application/admin/provider-draft";
import { locateCustomParameterErrors } from "@presentation/admin/custom-parameter-presenter";

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
  custom_parameters: { temperature: 0.4 },
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
    expect(model().customParameters).toEqual({ temperature: 0.4 });
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
    expect(draft.customParametersText).toBe('{\n  "temperature": 0.4\n}');
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
    first.customParametersText = '{"reasoning":{"enabled":false}}';
    second.providerModelId = "Vendor/Other";
    second.displayName = " Other model ";
    const batch = modelBatchConfiguration(draft, [first, second], []);
    expect(batch.connection?.apiKey).toBe("synthetic-key");
    expect(batch.models[0]).toMatchObject({
      displayName: "Vendor/Exact-ID",
      providerModelId: "Vendor/Exact-ID",
      maxOutputTokens: 4096,
      outputMode: "json_schema",
      customParameters: { reasoning: { enabled: false } },
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
  it("serializes custom parameters through every typed model write and probe", async () => {
    const sent: Array<{ path: string; body: Record<string, unknown> }> = [];
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    const responseModel = { ...raw, custom_parameters: { temperature: 0.4 } };
    const reply = (data: unknown) =>
      new Response(JSON.stringify({ data, meta: { request_id: "request" } }), {
        headers: { "content-type": "application/json" },
      });
    const api = createApiRepository(
      {
        async send(path, init) {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          sent.push({ path, body });
          if (path.endsWith("model-connection-test"))
            return reply({ ok: true });
          if (path.includes("model-providers"))
            return reply({
              provider: {
                connection: responseModel.connection,
                models: [responseModel],
              },
              revision: "next",
            });
          if (path.endsWith("/batch"))
            return reply({ items: [responseModel], revision: "next" });
          return reply({ model: responseModel, revision: "next" });
        },
      },
      vault,
      true,
    );
    const draft = modelDraft(model());
    draft.customParametersText = '{"reasoning":{"enabled":false}}';
    const input = modelConfiguration(draft, [model().connection]);
    const batch = modelBatchConfiguration(
      draft,
      [modelEntryDraft("one", model())],
      [model().connection],
    );
    batch.models[0]!.customParameters = input.customParameters;
    await api.testModelConnection(input);
    await api.createModel(input);
    await api.updateModel("model", input, "revision");
    await api.createModels(batch);
    await api.saveModelProvider("provider", {
      connection: {
        name: "Provider",
        protocol: "openai_chat",
        baseUrl: "https://example.com/v1",
        apiKey: "",
      },
      expectedRevision: "revision",
      models: [{ ...batch.models[0]!, id: "model" }],
    });
    expect(sent).toHaveLength(5);
    expect(
      sent.slice(0, 3).map((request) => request.body.custom_parameters),
    ).toEqual([
      input.customParameters,
      input.customParameters,
      input.customParameters,
    ]);
    expect(
      (sent[3]!.body.models as Array<Record<string, unknown>>)[0]
        ?.custom_parameters,
    ).toEqual(input.customParameters);
    expect(
      (sent[4]!.body.models as Array<Record<string, unknown>>)[0]
        ?.custom_parameters,
    ).toEqual(input.customParameters);
  });
  it("retains invalid local raw when a remote model is deleted and flags divergent edits", () => {
    const saved = modelEntryDraft("stable-key", model());
    const local = { ...saved, customParametersText: '{"reasoning":' };
    expect(mergeProviderEntries([saved], [local], [])).toEqual([
      expect.objectContaining({
        key: "stable-key",
        customParametersText: '{"reasoning":',
        remoteDeleted: true,
      }),
    ]);
    const remote = {
      ...saved,
      key: "remote-key",
      customParametersText: '{"temperature":0.9}',
    };
    expect(mergeProviderEntries([saved], [local], [remote])[0]).toMatchObject({
      key: "stable-key",
      customParametersText: '{"reasoning":',
      customConflict: true,
      remoteDeleted: false,
    });
  });
  it("locates server pointers against the frozen submitted order", () => {
    const located = locateCustomParameterErrors(
      {
        kind: "validation",
        code: "validation_failed",
        status: 422,
        requestId: "request",
        retryable: false,
        fields: {
          "/models/1/custom_parameters/a~1b": "protected_field",
        },
      },
      [
        { key: "first", modelId: "one" },
        { key: "second", modelId: "two" },
      ],
    );
    expect(located).toEqual({
      entries: { second: "protected_field" },
      formCode: null,
    });
    expect(
      locateCustomParameterErrors(
        {
          kind: "validation",
          code: "request_too_large",
          status: 413,
          requestId: "request",
          retryable: false,
          fields: { "": "required" },
        },
        [],
      ),
    ).toEqual({ entries: {}, formCode: "request_too_large" });
  });
});
