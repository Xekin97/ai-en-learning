import type { BenefitsPort } from "@application/benefits/models";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import * as schemas from "../schemas/benefits";
import {
  mapOwnedItem,
  mapShopItem,
  mapActivation,
} from "../mappers/benefits-mapper";
import { mapSettlement } from "../mappers/growth-mapper";
import { json } from "./repository-support";
export function createBenefitsRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): BenefitsPort {
  const post = (body: unknown, key?: string): RequestInit => ({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": vault.csrf(),
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(body),
    }),
    item = (id: string) => "/api/v1/me/items/" + encodeURIComponent(id),
    query = (cursor?: string) =>
      "?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
  const tokenKey = (id: string, kind: string) => kind + ":" + id;
  return {
    async listShop(cursor) {
      const { data, meta } = await json(
        transport,
        "/api/v1/shop/items" + query(cursor),
        schemas.shopEnvelopeSchema,
      );
      return {
        balance: data.balance,
        items: data.items.map(mapShopItem),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async listItems(cursor) {
      const { data, meta } = await json(
        transport,
        "/api/v1/me/items" + query(cursor),
        schemas.itemsEnvelopeSchema,
      );
      return {
        items: data.items.map(mapOwnedItem),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async exchangeItem(id, quantity, key) {
      return mapSettlement(
        (
          await json(
            transport,
            "/api/v1/shop/exchanges",
            schemas.exchangeEnvelopeSchema,
            post({ definition_id: id, quantity }, key),
          )
        ).data.receipt,
      );
    },
    async previewActivation(id) {
      const { data } = await json(
        transport,
        item(id) + "/activation-preview",
        schemas.activationPreviewEnvelopeSchema,
        post({}),
      );
      vault.setConfirmation(tokenKey(id, "activate"), data.confirmation_token);
      return mapActivation(data);
    },
    async activateItem(id, discard, key) {
      const { data } = await json(
        transport,
        item(id) + "/activate",
        schemas.itemCommandEnvelopeSchema,
        post(
          {
            confirmation_token: vault.confirmation(tokenKey(id, "activate")),
            confirm_discard: discard,
          },
          key,
        ),
      );
      return {
        receipt: mapSettlement(data.receipt),
        item: mapOwnedItem(data.item),
      };
    },
    async previewRefund(id) {
      const { data } = await json(
        transport,
        item(id) + "/refund-preview",
        schemas.refundPreviewEnvelopeSchema,
        post({}),
      );
      vault.setConfirmation(tokenKey(id, "refund"), data.confirmation_token);
      return {
        eligible: data.eligible,
        reason: data.reason,
        points: data.points,
      };
    },
    async refundItem(id, key) {
      const { data } = await json(
        transport,
        item(id) + "/retirement-refund",
        schemas.itemCommandEnvelopeSchema,
        post(
          { confirmation_token: vault.confirmation(tokenKey(id, "refund")) },
          key,
        ),
      );
      return {
        receipt: mapSettlement(data.receipt),
        item: mapOwnedItem(data.item),
      };
    },
    async previewMakeup(id, day) {
      const { data } = await json(
        transport,
        "/api/v1/me/growth/makeup-preview",
        schemas.makeupPreviewEnvelopeSchema,
        post({ item_id: id, learning_day: day }),
      );
      vault.setConfirmation(
        tokenKey(id, "makeup:" + day),
        data.confirmation_token,
      );
      return {
        canUse: data.can_use,
        reason: data.reason,
        pointsAdded: data.points_added,
        experienceAdded: data.experience_added,
        affectedDays: data.affected_days.map((d) => ({
          day: d.day,
          beforePoints: d.before_points,
          afterPoints: d.after_points,
          difference: d.difference,
        })),
      };
    },
    async makeupDay(id, day, key) {
      return mapSettlement(
        (
          await json(
            transport,
            "/api/v1/me/growth/makeups",
            schemas.makeupEnvelopeSchema,
            post(
              {
                item_id: id,
                learning_day: day,
                confirmation_token: vault.confirmation(
                  tokenKey(id, "makeup:" + day),
                ),
              },
              key,
            ),
          )
        ).data.receipt,
      );
    },
    clearBenefitPreview(id) {
      vault.clearConfirmationsFor(id);
    },
  };
}
