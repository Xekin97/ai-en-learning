export interface UsageSummaryModel {
  logicalRuns: number;
  providerCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: { amount: string; unit: "openrouter_credits" } | null;
  unknownCalls: number;
}
