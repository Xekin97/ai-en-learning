import type { GrowthPort } from "@application/growth/models";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import {
  growthEnvelopeSchema,
  checkinsEnvelopeSchema,
  levelsEnvelopeSchema,
  achievementsEnvelopeSchema,
  claimRewardEnvelopeSchema,
} from "../schemas/growth";
import {
  mapGrowth,
  mapLevelAward,
  mapAchievement,
  mapSettlement,
} from "../mappers/growth-mapper";
import { json } from "./repository-support";
export function createGrowthRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): GrowthPort {
  const root = "/api/v1/me/growth",
    query = (cursor?: string) =>
      "?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
  return {
    async getGrowth() {
      return mapGrowth(
        (await json(transport, root, growthEnvelopeSchema)).data,
      );
    },
    async getCheckins(start, end) {
      const { data } = await json(
        transport,
        `${root}/checkins?${new URLSearchParams({ start_date: start, end_date: end })}`,
        checkinsEnvelopeSchema,
      );
      return {
        learningDay: data.learning_day,
        makeupEarliestDay: data.makeup_earliest_day,
        days: data.days.map((d) => ({
          day: d.day,
          state: d.state,
          pointsPaid: d.points_paid,
          canMakeup: d.can_makeup,
        })),
      };
    },
    async listLevelRewards(cursor) {
      const { data, meta } = await json(
        transport,
        root + "/level-rewards" + query(cursor),
        levelsEnvelopeSchema,
      );
      return {
        items: data.items.map(mapLevelAward),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async listAchievements(cursor) {
      const { data, meta } = await json(
        transport,
        root + "/achievements" + query(cursor),
        achievementsEnvelopeSchema,
      );
      return {
        items: data.items.map(mapAchievement),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async claimReward(kind, id, key) {
      const { data } = await json(
        transport,
        `${root}/${kind === "level" ? "level-rewards" : "achievements"}/${encodeURIComponent(id)}/claim`,
        claimRewardEnvelopeSchema,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": vault.csrf(),
            "idempotency-key": key,
          },
          body: "{}",
        },
      );
      return mapSettlement(data.receipt);
    },
  };
}
