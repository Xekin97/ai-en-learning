const time = "2026-09-20T05:00:00Z",
  day = "2026-09-20";
let notices = [],
  noticeVersion = 1;
const events = [];
const ready = (value) => ({
  value,
  numerator: null,
  denominator: null,
  status: "ready",
  reason: null,
});
const missing = (status) => ({
  value: null,
  numerator: null,
  denominator: null,
  status,
  reason: status === "unavailable" ? "detail_expired" : null,
});
const base = {
  range: { start_day: "2026-09-14", end_day: day },
  learning_day: day,
  updated_at: time,
  freshness: "delayed",
  detail_available_from: "2026-06-22T05:00:00Z",
};
const usage = {
  logical_runs: 2,
  provider_calls: 3,
  input_tokens: null,
  output_tokens: null,
  cost: null,
  unknown_calls: 1,
};
const reset = () => {
  noticeVersion = 1;
  events.length = 0;
  notices = [
    {
      id: "notice-admin",
      title: { zh_CN: "中文通知", en_US: null },
      body_markdown: { zh_CN: "**正文**", en_US: null },
      visible: true,
      remind: false,
      remind_once: false,
      published_at: time,
      updated_at: time,
    },
  ];
};
reset();
export async function operationsFixture(request, response, url) {
  const json = (data, list = false, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data,
        meta: {
          request_id: "operations-fixture",
          ...(list ? { next_cursor: null, has_more: false } : {}),
        },
      }),
    );
    return true;
  };
  const body = async () => {
    let s = "";
    for await (const c of request) s += c;
    return s ? JSON.parse(s) : {};
  };
  if (url.pathname === "/api/v1/__test/operations-reset") {
    reset();
    return json({});
  }
  if (url.pathname === "/api/v1/__test/events") return json({ events });
  if (url.pathname === "/api/v1/analytics/events") {
    events.push(await body());
    response.writeHead(204);
    response.end();
    return true;
  }
  const root = "/api/v1/admin";
  if (url.pathname === root + "/overview")
    return json({
      ...base,
      today: {
        pv: ready(5),
        uv: ready(3),
        valid_generations: ready(0),
        saved_passages: ready(0),
        review_submissions: ready(0),
      },
      last_7_days: {
        wau: ready(0),
        registration_rate: missing("no_sample"),
        activation_rate: missing("observing"),
        generation_failure_rate: ready(0),
      },
      preview_usage: usage,
    });
  if (url.pathname === root + "/analytics/traffic")
    return json({
      ...base,
      pv: ready(5),
      uv: missing("unavailable"),
      bounce_rate: missing("no_sample"),
      series: [
        {
          day: "2026-09-14",
          pv: ready(0),
          uv: ready(0),
          bounce_rate: missing("no_sample"),
        },
        {
          day: "2026-09-15",
          pv: missing("unavailable"),
          uv: missing("unavailable"),
          bounce_rate: missing("no_sample"),
        },
        {
          day: "2026-09-16",
          pv: ready(5),
          uv: ready(3),
          bounce_rate: ready(0.2),
        },
      ],
      channels: [{ source_type: "direct_unknown", pv: ready(5), uv: ready(3) }],
      clarity: { available: false, url: null },
    });
  if (url.pathname === root + "/analytics/funnel")
    return json({
      ...base,
      registration: {
        converted_visitor_uv: ready(0),
        anonymous_uv: ready(0),
        rate: missing("no_sample"),
        new_accounts: ready(0),
        unattributed_accounts: ready(0),
      },
      activation: {
        within_7_days: missing("observing"),
        same_day: ready(0),
        cohorts: [],
      },
      review: {
        started: ready(0),
        submitted: ready(0),
        successful: ready(0),
        completion_rate: missing("no_sample"),
        success_rate: missing("no_sample"),
      },
      generation: {
        valid: ready(0),
        failed: ready(0),
        cancelled: ready(1),
        ongoing: ready(1),
        precheck_rejected: ready(1),
        failure_rate: ready(0),
      },
    });
  if (url.pathname === root + "/analytics/retention")
    return json({
      ...base,
      cohorts: [
        {
          registration_day: "2026-09-14",
          accounts: 2,
          d1: ready(0.5),
          d7: missing("observing"),
          d30: missing("observing"),
        },
        {
          registration_day: "2026-09-15",
          accounts: 0,
          d1: missing("no_sample"),
          d7: missing("observing"),
          d30: missing("observing"),
        },
      ],
      series: [
        {
          day,
          wau: ready(0),
          valid_generations: ready(0),
          saved_passages: ready(0),
          review_submissions: ready(0),
          successful_reviews: ready(0),
          reviews_per_active_learner: missing("no_sample"),
        },
      ],
    });
  if (url.pathname === root + "/notices/preview") {
    await body();
    return json({ body_html: "<p><strong>Safe preview</strong></p>" });
  }
  if (url.pathname === root + "/notices" && request.method === "GET")
    return json({ items: notices, revision: "notice-" + noticeVersion }, true);
  if (url.pathname.startsWith(root + "/notices")) {
    const id = url.pathname.split("/")[5],
      existing = notices.find((n) => n.id === id);
    if (request.method === "GET")
      return json({ notice: existing, revision: "notice-" + noticeVersion });
    const input = await body();
    if (existing && input.expected_revision !== "notice-" + noticeVersion) {
      response.writeHead(409, { "content-type": "application/problem+json" });
      response.end(
        JSON.stringify({
          type: "about:blank",
          title: "Changed",
          status: 409,
          code: "revision_conflict",
          detail: "Please review.",
          request_id: "notice-fixture",
        }),
      );
      return true;
    }
    delete input.expected_revision;
    noticeVersion++;
    const notice = {
      id: existing?.id ?? "notice-new",
      ...input,
      published_at: existing?.published_at ?? time,
      updated_at: time,
    };
    if (existing) notices[notices.indexOf(existing)] = notice;
    else notices.unshift(notice);
    return json({ notice, revision: "notice-" + noticeVersion });
  }
  return false;
}

// Local preview must expose the same notice settings saved through the admin UI.
export function configuredNotices(locale) {
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  return notices
    .filter((n) => n.visible)
    .map((n) => {
      let lang = locale === "zh-CN" ? "zh_CN" : "en_US";
      if (!n.title[lang]?.trim() || !n.body_markdown[lang]?.trim())
        lang = lang === "zh_CN" ? "en_US" : "zh_CN";
      return {
        id: n.id,
        title: n.title[lang] ?? "",
        body_html: `<p>${escape(n.body_markdown[lang] ?? "")}</p>`,
        content_locale: lang === "zh_CN" ? "zh-CN" : "en-US",
        remind: n.remind,
        remind_once: n.remind_once ?? false,
        published_at: n.published_at,
        revision: `notice-${noticeVersion}`,
      };
    });
}
