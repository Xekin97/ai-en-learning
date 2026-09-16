import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adminUserEnvelopeSchema,
  adminUsersEnvelopeSchema,
  userGroupChangeEnvelopeSchema,
} from "@infrastructure/http/schemas/admin";
import { mapAdminUserDetailDto } from "@infrastructure/http/mappers";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";
import { normalizeFailure } from "@application/shared/failure";
import manifest from "../contracts/v1.4/manifest.json";
import limited from "../contracts/v1.4/user-limited.json";
import admin from "../contracts/v1.4/user-admin.json";
import changed from "../contracts/v1.4/group-limited.json";

describe("API v1.4 shared raw contracts", () => {
  it.each(manifest.fixtures)(
    "validates backend-owned bytes and strict schema: $file",
    (fixture) => {
      const raw = readFileSync(
        new URL("../contracts/v1.4/" + fixture.file, import.meta.url),
      );
      expect(createHash("sha256").update(raw).digest("hex")).toBe(
        fixture.sha256,
      );
      const schema =
        fixture.method === "GET"
          ? adminUserEnvelopeSchema
          : userGroupChangeEnvelopeSchema;
      const envelope = schema.parse(JSON.parse(raw.toString()));
      const model = mapAdminUserDetailDto(envelope.data.user);
      expect(JSON.stringify(model)).not.toContain("generation_quota");
      expect(JSON.stringify(model)).not.toContain("quota_reset");
      expect(model.generationQuota.kind).toBe(
        envelope.data.user.generation_quota?.kind ?? "not_applicable",
      );
    },
  );
  it.each([
    undefined,
    null,
    {},
    { kind: "limited" },
    { kind: "limited", remaining: null },
    { kind: "limited", remaining: -1 },
    { kind: "limited", remaining: 0.2 },
    { kind: "limited", remaining: "2" },
    { kind: "unknown", remaining: 0 },
    { kind: "unlimited", remaining: 2 },
    { kind: "unlimited" },
    { kind: "limited", remaining: 1, limit: 10 },
    { kind: "limited", remaining: 1, used: 2 },
    { kind: "limited", remaining: 1, token: "synthetic" },
  ])("rejects invalid quota without defaulting to unlimited: %j", (quota) => {
    const result = adminUserEnvelopeSchema.safeParse({
      ...limited,
      data: { user: { ...limited.data.user, generation_quota: quota } },
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(normalizeFailure(result.error).kind).toBe("contract_violation");
  });
  it("keeps 0 and max integers; rejects quota on admin and extra on summary", () => {
    for (const value of [0, 2147483647]) {
      const parsed = adminUserEnvelopeSchema.parse({
        ...limited,
        data: {
          user: {
            ...limited.data.user,
            generation_quota: { kind: "limited", remaining: value },
          },
        },
      });
      expect(mapAdminUserDetailDto(parsed.data.user).generationQuota).toEqual({
        kind: "limited",
        remaining: value,
      });
    }
    expect(
      adminUserEnvelopeSchema.safeParse({
        ...admin,
        data: {
          user: {
            ...admin.data.user,
            generation_quota: limited.data.user.generation_quota,
          },
        },
      }).success,
    ).toBe(false);
    const {
      ui_locale: _locale,
      learning_batch_count: _count,
      generation_quota: quota,
      ...summary
    } = limited.data.user;
    const page = {
      data: { items: [summary] },
      meta: { request_id: "req", next_cursor: null, has_more: false },
    };
    expect(adminUsersEnvelopeSchema.safeParse(page).success).toBe(true);
    expect(
      adminUsersEnvelopeSchema.safeParse({
        ...page,
        data: { items: [{ ...summary, generation_quota: quota }] },
      }).success,
    ).toBe(false);
  });
  it.each(["wrong-id", "wrong-plan", "admin", "missing-reset"])(
    "rejects a false successful mutation: %s",
    async (scenario) => {
      const body = structuredClone(changed);
      const user =
        scenario === "admin"
          ? admin.data.user
          : {
              ...body.data.user,
              id: scenario === "wrong-id" ? "another" : body.data.user.id,
              plan_code:
                scenario === "wrong-plan" ? "plus" : body.data.user.plan_code,
            };
      const result = {
        ...body,
        data: {
          user,
          ...(scenario === "missing-reset" ? {} : { quota_reset: true }),
        },
      };
      const vault = new TokenVault();
      vault.setCsrf("synthetic");
      const api = createApiRepository(
        {
          send: async () =>
            new Response(JSON.stringify(result), {
              headers: { "content-type": "application/json" },
            }),
        },
        vault,
        true,
      );
      await expect(
        api.changeUserGroup(changed.data.user.id, "basic"),
      ).rejects.toBeDefined();
    },
  );
});
