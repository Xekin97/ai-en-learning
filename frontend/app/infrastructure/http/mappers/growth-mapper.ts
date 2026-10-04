import type {
  RewardModel,
  SettlementModel,
  GrowthModel,
  AwardModel,
  AchievementModel,
  LevelAwardModel,
} from "@application/growth/models";
import type {
  RewardDto,
  SettlementDto,
  GrowthDto,
  AchievementDto,
  LevelAwardDto,
} from "../schemas/growth";
export function mapReward(d: RewardDto): RewardModel {
  return {
    points: d.points,
    experience: d.experience,
    item: d.item
      ? {
          definitionId: d.item.definition_id,
          name: d.item.name,
          kind: d.item.kind,
          count: d.item.count,
        }
      : null,
  };
}
export function mapSettlement(d: SettlementDto): SettlementModel {
  return {
    id: d.id,
    kind: d.kind,
    settledAt: d.settled_at,
    pointsDelta: d.points_delta,
    experienceDelta: d.experience_delta,
    pointsAfter: d.points_after,
    experienceAfter: d.experience_after,
    items: d.items.map((i) => ({
      itemId: i.item_id,
      definitionId: i.definition_id,
      kind: i.kind,
      activationDeadline: i.activation_deadline,
    })),
  };
}
export function mapGrowth(d: GrowthDto): GrowthModel {
  return {
    learningDay: d.learning_day,
    growthStartedAt: d.growth_started_at,
    points: d.points,
    experience: d.experience,
    level: {
      id: d.level.id,
      number: d.level.number,
      name: d.level.name,
      minExperience: d.level.min_experience,
    },
    nextLevel: d.next_level
      ? {
          id: d.next_level.id,
          number: d.next_level.number,
          minExperience: d.next_level.min_experience,
          reward: mapReward(d.next_level.reward),
        }
      : null,
    masteredTotal: d.mastered_total,
    savedTotal: d.saved_total,
    successfulReviewTotal: d.successful_review_total,
    checkin: {
      signedToday: d.checkin.signed_today,
      currentStreak: d.checkin.current_streak,
      highestStreak: d.checkin.highest_streak,
      todayPoints: d.checkin.today_points,
      todayExperience: d.checkin.today_experience,
    },
    reviewStreak: {
      current: d.review_streak.current,
      highest: d.review_streak.highest,
    },
    pendingRewardCount: d.pending_reward_count,
  };
}
function award(d: AchievementDto | LevelAwardDto): AwardModel {
  return {
    id: d.id,
    state: d.state,
    blockReason: d.block_reason,
    achievedAt: d.achieved_at,
    claimedAt: d.claimed_at,
    reward: mapReward(d.reward),
    settlementId: d.settlement_id,
  };
}
export function mapAchievement(d: AchievementDto): AchievementModel {
  return {
    ...award(d),
    tierId: d.tier_id,
    kind: d.kind,
    name: d.name,
    title: d.title,
    descriptionText: d.description,
    threshold: d.threshold,
    progress: d.progress,
  };
}
export function mapLevelAward(d: LevelAwardDto): LevelAwardModel {
  return {
    ...award(d),
    levelId: d.level_id,
    levelNumber: d.level_number,
    minExperience: d.min_experience,
  };
}
