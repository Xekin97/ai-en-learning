import { userEnvelope } from "../fixtures/m002";
import { describe, expect, it } from "vitest";
import { createAdminDetailState } from "@application/admin/user-detail";
import { adminUserEnvelopeSchema } from "@infrastructure/http/schemas/admin";
import { mapAdminUserDetailDto } from "@infrastructure/http/mappers";
import {
  presentAdminUserDetail,
  presentAdminBatchReader,
  type AdminDetailFormat,
} from "@presentation/admin/admin-user-detail-presenter";
import legacy from "../contracts/v1.4/user-limited.json";

const format: AdminDetailFormat = {
  t: (key) => key,
  date: (value) => value,
  integer: String,
  group: (value) => value,
  meaning: (value) => value,
  scenario: (value) => value,
  length: (value) => value,
};

const raw = userEnvelope(legacy);

describe("CR030 long-name layout keeps content intact", () => {
  it.each(["abcdefghijklmnopqrstuvwxyz123456", "W".repeat(32), "reader"])(
    "preserves the entire username through the contract, state and presenters: %s",
    (username) => {
      const dto = adminUserEnvelopeSchema.parse({
        ...raw,
        data: { user: { ...raw.data.user, username } },
      });
      const state = createAdminDetailState();
      state.status = "ready";
      state.user = mapAdminUserDetailDto(dto.data.user);
      const view = presentAdminUserDetail(state, format);
      expect(view.username).toBe(username);
      expect(view.ready).toBe(true);
      expect(view.canManage).toBe(true);
      expect(
        presentAdminBatchReader({ kind: "closed" }, view.username, format)
          .username,
      ).toBe(username);
      expect(state.user.username).toBe(username);
      expect(view.rows).toHaveLength(4);
    },
  );
});
