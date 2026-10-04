import type { PageModel } from "../shared/models";
export type ItemKind = "makeup" | "extra_credit" | "model_trial" | "plan_trial";
export interface RewardModel {
  points: string;
  experience: string;
  item: {
    definitionId: string;
    name: string;
    kind: ItemKind;
    count: number;
  } | null;
}
export interface GrowthModel {
  learningDay: string;
  growthStartedAt: string;
  points: string;
  experience: string;
  level: { id: string; number: number; name: string; minExperience: string };
  nextLevel: {
    id: string;
    number: number;
    minExperience: string;
    reward: RewardModel;
  } | null;
  masteredTotal: number;
  savedTotal: number;
  successfulReviewTotal: number;
  checkin: {
    signedToday: boolean;
    currentStreak: number;
    highestStreak: number;
    todayPoints: string;
    todayExperience: string;
  };
  reviewStreak: { current: number; highest: number };
  pendingRewardCount: number;
}
export interface SettlementModel {
  id: string;
  kind: string;
  settledAt: string;
  pointsDelta: string;
  experienceDelta: string;
  pointsAfter: string;
  experienceAfter: string;
  items: {
    itemId: string;
    definitionId: string;
    kind: ItemKind;
    activationDeadline: string;
  }[];
}
export type AwardState = "unachieved" | "claimable" | "blocked" | "claimed";
export type AchievementKind =
  "checkin_streak" | "review_streak" | "mastered_words" | "saved_passages";
export interface AwardModel {
  id: string;
  state: AwardState;
  blockReason: "tier_disabled" | "reward_unavailable" | "level_required" | null;
  achievedAt: string | null;
  claimedAt: string | null;
  reward: RewardModel;
  settlementId: string | null;
}
export interface LevelAwardModel extends AwardModel {
  levelId: string;
  levelNumber: number;
  minExperience: string;
}
export interface AchievementModel extends AwardModel {
  tierId: string;
  kind: AchievementKind;
  name: string;
  title: string;
  descriptionText: string | null;
  threshold: number;
  progress: number;
}
export interface CheckinModel {
  learningDay: string;
  makeupEarliestDay: string;
  days: {
    day: string;
    state: "normal" | "makeup" | "missing" | "future" | "before_start";
    pointsPaid: string;
    canMakeup: boolean;
  }[];
}
export interface GrowthPort {
  getGrowth(): Promise<GrowthModel>;
  getCheckins(start: string, end: string): Promise<CheckinModel>;
  listLevelRewards(cursor?: string): Promise<PageModel<LevelAwardModel>>;
  listAchievements(cursor?: string): Promise<PageModel<AchievementModel>>;
  claimReward(
    kind: "level" | "achievement",
    id: string,
    key: string,
  ): Promise<SettlementModel>;
}
