/** Synthetic M002 fields layered on preserved M001 quota fixtures. */
export function userEnvelope<
  T extends { data: { user: { role: string; plan_code: unknown } } },
>(legacy: T) {
  return {
    ...legacy,
    data: {
      ...legacy.data,
      user: {
        ...legacy.data.user,
        nickname: null,
        gender: null,
        last_login_at: null,
        last_learning_at: null,
        base_revision: legacy.data.user.role === "admin" ? null : "base-1",
        effective_plan_code: legacy.data.user.plan_code,
        growth:
          legacy.data.user.role === "admin"
            ? null
            : {
                level_number: 1,
                points: "0",
                experience: "0",
                mastered_total: 0,
                saved_total: 0,
              },
      },
    },
  };
}
export const draftDto = () => ({
  attempt_id: "attempt-1",
  session_id: "session-1",
  batch_id: "batch-1",
  revision: "rev-1",
  attempt_token: "secret-capability",
  token_expires_at: "2099-01-01T00:00:00Z",
  words: [
    {
      question_id: "question-1",
      entry_meaning: "改变以适应",
      slots: [{ kind: "letters" as const, count: 5 }],
      hint: {
        segments: [
          { kind: "blank" as const },
          { kind: "text" as const, text: " to change" },
        ],
      },
    },
  ],
  passage: {
    segments: [
      { kind: "text" as const, text: "They " },
      {
        kind: "blank" as const,
        blank_id: "blank-1",
        group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
      },
      { kind: "text" as const, text: " and " },
      {
        kind: "blank" as const,
        blank_id: "blank-2",
        group_key: "grp_BBBBBBBBBBBBBBBBBBBBBB",
      },
      { kind: "text" as const, text: ", then " },
      {
        kind: "blank" as const,
        blank_id: "blank-3",
        group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
      },
      { kind: "text" as const, text: " again." },
    ],
  },
});
export const sessionDto = () => ({
  session_id: "session-1",
  mode: "single_batch" as const,
  status: "active" as const,
  date_range: null,
  progress: {
    completed_batches: 0,
    total_batches: 1,
    successful_batches: 0,
    unsuccessful_batches: 0,
    skipped_batches: 0,
  },
  current_batch: {
    batch_id: "batch-1",
    saved_at: "2026-09-20T00:00:00Z",
    scenario: "story" as const,
  },
  current_attempt: null,
});
