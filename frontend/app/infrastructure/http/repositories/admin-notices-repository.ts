import type { AdminNoticesPort } from "@application/admin/notices";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import {
  adminNoticeEnvelopeSchema,
  adminNoticesEnvelopeSchema,
  adminNoticePreviewEnvelopeSchema,
} from "../schemas/admin-notices";
import { mapAdminNotice, bilingualBody } from "../mappers/admin-notice-mapper";
import { json } from "./repository-support";
export function createAdminNoticesRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminNoticesPort {
  const root = "/api/v1/admin/notices",
    command = (method: string, body: unknown): RequestInit => ({
      method,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": vault.csrf(),
      },
      body: JSON.stringify(body),
    });
  return {
    async listAdminNotices(cursor) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const { data, meta } = await json(
        transport,
        root + "?" + query,
        adminNoticesEnvelopeSchema,
      );
      return {
        items: data.items.map((n) => mapAdminNotice(n, data.revision)),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async getAdminNotice(id) {
      const { data } = await json(
        transport,
        root + "/" + encodeURIComponent(id),
        adminNoticeEnvelopeSchema,
      );
      return mapAdminNotice(data.notice, data.revision);
    },
    async saveAdminNotice(id, input, revision) {
      const body = {
        title: bilingualBody(input.title),
        body_markdown: bilingualBody(input.bodyMarkdown),
        visible: input.visible,
        remind: input.remind,
        remind_once: input.remindOnce,
        ...(id ? { expected_revision: revision } : {}),
      };
      const { data } = await json(
        transport,
        root + (id ? "/" + encodeURIComponent(id) : ""),
        adminNoticeEnvelopeSchema,
        command(id ? "PUT" : "POST", body),
      );
      return mapAdminNotice(data.notice, data.revision);
    },
    async previewNotice(markdown) {
      return (
        await json(
          transport,
          root + "/preview",
          adminNoticePreviewEnvelopeSchema,
          command("POST", { body_markdown: markdown }),
        )
      ).data.body_html;
    },
  };
}
