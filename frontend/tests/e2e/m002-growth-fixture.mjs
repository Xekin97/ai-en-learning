let claimed = false,
  active = false,
  refunded = false,
  exchanged = false,
  refundVersion = 1;
const time = "2026-09-20T05:00:00Z",
  end = "2026-10-20T05:00:00Z",
  balance = "9007199254740993";
const reward = { points: "5", experience: "10", item: null };
const effects = {
  model_trial: {
    kind: "model_trial",
    models: [{ id: "model-fast", name: "Model A", status: "enabled" }],
    trial_seconds: 259200,
    retirement_points: "20",
  },
  plan_trial: {
    kind: "plan_trial",
    target_plan_code: "pro",
    trial_seconds: 259200,
  },
  extra_credit: { kind: "extra_credit", extra_count: 3 },
  makeup: { kind: "makeup" },
};
const owned = (kind) => ({
  id: "item-" + kind,
  definition_id: "def-" + kind,
  name:
    kind === "model_trial"
      ? "Model time card"
      : kind === "plan_trial"
        ? "Plan trial card"
        : kind === "makeup"
          ? "Make-up card"
          : "Extra creations",
  description: "",
  kind,
  effect: effects[kind],
  issued_at: time,
  activation_deadline: end,
  activated_at: active && kind === "plan_trial" ? time : null,
  state:
    kind === "model_trial"
      ? refunded
        ? "refunded"
        : "refundable"
      : active && kind === "plan_trial"
        ? "active"
        : "unused",
  use_block: null,
  model_times: [],
  plan_trial:
    active && kind === "plan_trial" ? { plan_code: "pro", ends_at: end } : null,
  extra_credit: null,
  refund:
    kind === "model_trial" && !refunded
      ? { eligible_at: time, points: String(refundVersion * 20) }
      : null,
  refunded_at: refunded && kind === "model_trial" ? time : null,
  refund_receipt_id:
    refunded && kind === "model_trial" ? "refund-receipt" : null,
});
const receipt = (kind) => ({
  id: "receipt-" + kind,
  kind,
  settled_at: time,
  points_delta: "0",
  experience_delta: "0",
  points_after: balance,
  experience_after: "120",
  items: [],
});
export async function growthFixture(request, response, url) {
  const json = (data, more) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data,
        meta: {
          request_id: "growth-fixture",
          ...(more !== undefined
            ? { next_cursor: more, has_more: more !== null }
            : {}),
        },
      }),
    );
    return true;
  };
  const body = async () => {
    let text = "";
    for await (const part of request) text += part;
    return JSON.parse(text || "{}");
  };
  if (url.pathname === "/api/v1/__test/growth-reset") {
    claimed = active = refunded = exchanged = false;
    refundVersion = 1;
    return json({});
  }
  if (url.pathname === "/api/v1/__test/refund-price-change") {
    refundVersion = 2;
    return json({});
  }
  if (url.pathname === "/api/v1/me/growth")
    return json({
      learning_day: "2026-09-20",
      growth_started_at: time,
      points: balance,
      experience: "120",
      level: { id: "lv2", number: 2, name: "Lv.2", min_experience: "100" },
      next_level: { id: "lv3", number: 3, min_experience: "200", reward },
      mastered_total: 12,
      saved_total: 8,
      successful_review_total: 3,
      checkin: {
        signed_today: true,
        current_streak: 3,
        highest_streak: 7,
        today_points: "3",
        today_experience: "1",
      },
      review_streak: { current: 2, highest: 3 },
      pending_reward_count: claimed ? 0 : 1,
    });
  if (url.pathname === "/api/v1/me/growth/checkins")
    return json({
      learning_day: "2026-09-20",
      makeup_earliest_day: "2026-08-21",
      days: ["2026-09-18", "2026-09-19", "2026-09-20"].map((day) => ({
        day,
        state: day.endsWith("19") ? "missing" : "normal",
        points_paid: day.endsWith("19") ? "0" : "2",
        can_makeup: day.endsWith("19"),
      })),
    });
  if (url.pathname === "/api/v1/me/growth/achievements")
    return json(
      {
        items: [
          {
            id: "award-1",
            tier_id: "tier-1",
            kind: "saved_passages",
            name: "First stories",
            title: "Story keeper",
            description: "<b>Plain text description</b>",
            threshold: 5,
            progress: 8,
            state: claimed ? "claimed" : "claimable",
            block_reason: null,
            achieved_at: time,
            claimed_at: claimed ? time : null,
            reward,
            settlement_id: claimed ? "receipt-award" : null,
          },
        ],
      },
      null,
    );
  if (url.pathname === "/api/v1/me/growth/level-rewards")
    return json(
      {
        items: [
          {
            id: "level-award",
            level_id: "lv2",
            level_number: 2,
            min_experience: "100",
            state: "blocked",
            block_reason: "reward_unavailable",
            achieved_at: time,
            claimed_at: null,
            reward,
            settlement_id: null,
          },
        ],
      },
      null,
    );
  if (url.pathname === "/api/v1/me/growth/achievements/tier-1/claim") {
    claimed = true;
    return json({
      receipt: receipt("award"),
      growth: {
        points: balance,
        experience: "120",
        level_number: 2,
        pending_reward_count: 0,
      },
    });
  }
  if (url.pathname === "/api/v1/shop/items")
    return json(
      {
        balance,
        items: [
          {
            id: "def-extra_credit",
            name: "Extra creations",
            description: "",
            kind: "extra_credit",
            price: "10",
            activation_ttl_seconds: 86400,
            effect: effects.extra_credit,
            available: true,
            unavailable_reason: null,
          },
        ],
      },
      null,
    );
  if (url.pathname === "/api/v1/shop/exchanges") {
    exchanged = true;
    return json({ receipt: receipt("exchange") });
  }
  if (url.pathname === "/api/v1/me/items")
    return json(
      {
        items: Object.keys(effects)
          .map(owned)
          .concat(
            exchanged
              ? [{ ...owned("extra_credit"), id: "item-exchanged" }]
              : [],
          ),
      },
      null,
    );
  if (url.pathname.endsWith("/activation-preview"))
    return json({
      can_activate: true,
      reason: null,
      effect: effects.plan_trial,
      model_times: [],
      plan_result: { plan_code: "pro", result_ends_at: end },
      discarded_trial: {
        plan_code: "basic",
        ends_at: end,
        remaining_seconds: 259200,
      },
      extra_result: null,
      confirmation_token: "activation-private",
      token_expires_at: end,
    });
  if (url.pathname.endsWith("/activate")) {
    active = true;
    return json({ receipt: receipt("activate"), item: owned("plan_trial") });
  }
  if (url.pathname.endsWith("/refund-preview"))
    return json({
      eligible: true,
      reason: null,
      points: String(refundVersion * 20),
      confirmation_token: "refund-" + refundVersion,
    });
  if (url.pathname.endsWith("/retirement-refund")) {
    const input = await body();
    if (input.confirmation_token !== "refund-" + refundVersion) {
      response.writeHead(409, { "content-type": "application/problem+json" });
      response.end(
        JSON.stringify({
          type: "about:blank",
          title: "Preview changed",
          status: 409,
          code: "preview_stale",
          detail: "Please preview again.",
          request_id: "refund-changed",
        }),
      );
      return true;
    }
    refunded = true;
    return json({ receipt: receipt("refund"), item: owned("model_trial") });
  }
  if (url.pathname === "/api/v1/me/growth/makeup-preview")
    return json({
      can_use: true,
      reason: null,
      points_added: "2",
      affected_days: [
        {
          day: "2026-09-19",
          before_points: "0",
          after_points: "2",
          difference: "2",
        },
      ],
      experience_added: "0",
      confirmation_token: "makeup-private",
    });
  if (url.pathname === "/api/v1/me/growth/makeups")
    return json({
      receipt: receipt("makeup"),
      affected_days: [{ day: "2026-09-19", points_added: "2" }],
      checkin: { current_streak: 4, highest_streak: 7 },
    });
  return false;
}
