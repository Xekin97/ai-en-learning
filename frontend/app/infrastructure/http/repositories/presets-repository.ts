import type { PresetsPort } from "@application/presets/models";
import type { RawHttpTransport } from "../transports/transport";
import {
  presetsEnvelopeSchema,
  presetDetailEnvelopeSchema,
} from "../schemas/presets";
import { mapPreset, mapPresetDetail } from "../mappers/presets-mapper";
import { json } from "./repository-support";
export function createPresetsRepository(
  transport: RawHttpTransport,
): PresetsPort {
  return {
    async listPresets(cursor, signal) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const value = await json(
        transport,
        `/api/v1/presets?${query}`,
        presetsEnvelopeSchema,
        signal ? { signal } : undefined,
      );
      return {
        items: value.data.items.map(mapPreset),
        nextCursor: value.meta.next_cursor,
        hasMore: value.meta.has_more,
      };
    },
    async getPreset(id, signal) {
      return mapPresetDetail(
        (
          await json(
            transport,
            `/api/v1/presets/${encodeURIComponent(id)}`,
            presetDetailEnvelopeSchema,
            signal ? { signal } : undefined,
          )
        ).data,
      );
    },
  };
}
