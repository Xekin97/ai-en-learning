import type { AdminItemsPort } from "@application/admin/items";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import * as schema from "../schemas/admin-items";
import {
  mapItemDefinition,
  itemDefinitionBody,
} from "../mappers/admin-items-mapper";
import { json, noContent } from "./repository-support";
export function createAdminItemsRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminItemsPort {
  const root = "/api/v1/admin/growth/items",
    command = (method: string, body: unknown): RequestInit => ({
      method,
      headers: {
        "content-type": "application/json",
        "x-csrf-token": vault.csrf(),
      },
      body: JSON.stringify(body),
    });
  return {
    async listItemDefinitions(input = {}) {
      const query = new URLSearchParams({ limit: "100" });
      if (input.query) query.set("q", input.query);
      if (input.kind) query.set("kind", input.kind);
      if (input.listed !== undefined) query.set("listed", String(input.listed));
      if (input.cursor) query.set("cursor", input.cursor);
      const { data, meta } = await json(
        transport,
        root + "?" + query,
        schema.itemDefinitionListEnvelopeSchema,
      );
      return {
        items: data.items.map((i) => mapItemDefinition(i, data.revision)),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async getItemDefinition(id) {
      const { data } = await json(
        transport,
        root + "/" + encodeURIComponent(id),
        schema.itemDefinitionEnvelopeSchema,
      );
      return mapItemDefinition(data.item, data.revision);
    },
    async saveItemDefinition(id, input, revision) {
      const body = schema.itemDefinitionInputSchema.parse(
        itemDefinitionBody(input),
      );
      const { data } = await json(
        transport,
        root + (id ? "/" + encodeURIComponent(id) : ""),
        schema.itemDefinitionEnvelopeSchema,
        command(id ? "PUT" : "POST", {
          ...body,
          ...(id ? { expected_revision: revision } : {}),
        }),
      );
      return mapItemDefinition(data.item, data.revision);
    },
    async setItemListing(id, listed, revision) {
      const { data } = await json(
        transport,
        root + "/" + encodeURIComponent(id) + "/listing",
        schema.itemDefinitionEnvelopeSchema,
        command("PUT", { listed, expected_revision: revision }),
      );
      return mapItemDefinition(data.item, data.revision);
    },
    async deleteItemDefinition(id, revision) {
      await noContent(
        transport,
        root + "/" + encodeURIComponent(id),
        command("DELETE", { expected_revision: revision, confirmed: true }),
      );
    },
    async listItemReferences(id, cursor) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const { data, meta } = await json(
        transport,
        root + "/" + encodeURIComponent(id) + "/references?" + query,
        schema.itemReferencesEnvelopeSchema,
      );
      return {
        everIssued: data.ever_issued,
        items: data.items.map((r) => ({
          kind: r.kind,
          id: r.id,
          name: r.name,
          enabled: r.enabled,
        })),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
  };
}
