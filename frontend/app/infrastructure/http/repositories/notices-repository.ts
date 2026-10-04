import type { NoticesPort } from "@application/notices/models";
import type { RawHttpTransport } from "../transports/transport";
import {
  noticesEnvelopeSchema,
  noticeEnvelopeSchema,
} from "../schemas/notices";
import { mapNotice } from "../mappers/notices-mapper";
import { json } from "./repository-support";
export function createNoticesRepository(
  transport: RawHttpTransport,
): NoticesPort {
  return {
    async listNotices(input) {
      const query = new URLSearchParams({
        reminders_only: String(input.remindersOnly),
      });
      if (input.cursor) query.set("cursor", input.cursor);
      const value = await json(
        transport,
        `/api/v1/notices?${query}`,
        noticesEnvelopeSchema,
        input.signal ? { signal: input.signal } : undefined,
      );
      return {
        items: value.data.items.map(mapNotice),
        nextCursor: value.meta.next_cursor,
        hasMore: value.meta.has_more,
      };
    },
    async getNotice(id) {
      return mapNotice(
        (
          await json(
            transport,
            `/api/v1/notices/${encodeURIComponent(id)}`,
            noticeEnvelopeSchema,
          )
        ).data.notice,
      );
    },
  };
}
