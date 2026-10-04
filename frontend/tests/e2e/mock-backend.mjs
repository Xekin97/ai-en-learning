import { adminPresetsFixture } from "./m002-admin-presets-fixture.mjs";
import { adminGrowthFixture } from "./m002-admin-growth-fixture.mjs";
import {
  operationsFixture,
  configuredNotices,
} from "./m002-operations-fixture.mjs";
import { adminFixture } from "./m002-admin-fixture.mjs";
import { growthFixture } from "./m002-growth-fixture.mjs";
import { reviewFixture } from "./m002-review-fixture.mjs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
// Use the same frozen corpus as the real API; never ship this test adapter to clients.
const vocabularyBytes = readFileSync(
  new URL(
    "../../../backend/assets/vocabulary/english-words.json",
    import.meta.url,
  ),
);
const vocabularyEntries = JSON.parse(vocabularyBytes.toString("utf8"));
const vocabularyVersion =
  "sha256:" + createHash("sha256").update(vocabularyBytes).digest("hex");
const quotaFixtures = Object.fromEntries(
  [
    "user-limited",
    "user-zero",
    "user-unlimited",
    "user-admin",
    "group-limited",
    "group-zero",
    "group-unlimited",
  ].map((name) => [
    name,
    JSON.parse(
      readFileSync(
        new URL("../contracts/v1.4/" + name + ".json", import.meta.url),
        "utf8",
      ),
    ),
  ]),
);
const changedUsers = new Map();

const port = Number(process.env.WORDWEAVE_MOCK_PORT || 38080);
const savedAt = "2026-08-10T09:00:00+08:00";
const model = {
  id: "model-fast",
  display_name:
    "Quick Context with a deliberately long name for responsive checks",
  description:
    "Fast stories for everyday learning in a clear and natural context",
  provider_model_id: "mock/quick-context",
  connection: {
    id: "connection-demo",
    name: "Demo",
    protocol: "openai_chat",
    base_url: "https://models.example/v1",
    credential_configured: true,
    masked_hint: "••••demo",
  },
  max_output_tokens: null,
  output_mode: "prompt",
  retired_at: null,
  enabled: true,
  assigned_group_codes: ["visitor", "basic", "pro", "plus"],
  created_at: savedAt,
  updated_at: savedAt,
};
const batch = {
  id: "batch-e2e",
  title: "adapt",
  title_revision: "title-1",
  saved_at: savedAt,
  passage_preview: "Teams adapt quickly when the context changes.",
  tags: ["growth"],
  entries: ["adapt"],
  model: { name: model.display_name },
  meaning_language: "en",
  scenario: "discussion",
  length: "short",
  participates_in_range_review: true,
};
const batchDetail = {
  id: batch.id,
  title: batch.title,
  title_revision: batch.title_revision,
  title_max_length: 200,
  saved_at: batch.saved_at,
  configuration: {
    model: batch.model,
    meaning_language: batch.meaning_language,
    scenario: batch.scenario,
    length: batch.length,
  },
  participates_in_range_review: true,
  passage: "Teams adapt quickly when the context changes.",
  tags: ["growth"],
  targets: [
    {
      entry: "adapt",
      entry_meaning: "change to fit a new situation",
      hint_phrase: "adapt to change",
      hint_blanks: [{ start: 0, end: 5 }],
      occurrences: [{ surface: "adapt", start: 6, end: 11 }],
    },
  ],
  review_summary: {
    completed_count: 2,
    successful_count: 1,
    last_completed_at: "2026-08-20T09:00:00+08:00",
  },
};

createServer(async (request, response) => {
  try {
    await handle(request, response);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(error instanceof Error ? error.message : String(error));
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock backend listening on ${port}\n`);
});

async function handle(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (await adminPresetsFixture(request, response, url)) return;
  if (await adminGrowthFixture(request, response, url)) return;
  if (await operationsFixture(request, response, url)) return;
  if (await adminFixture(request, response, url)) return;
  if (await reviewFixture(request, response, url)) return;
  if (await growthFixture(request, response, url)) return;
  const role = sessionRole(request.headers.cookie);
  const locale = request.headers.cookie?.includes("wordweave_ui_locale=zh-CN")
    ? "zh-CN"
    : "en-US";

  if (request.method === "GET" && url.pathname === "/api/v1/bootstrap") {
    return json(response, {
      data: {
        actor:
          role === "visitor"
            ? {
                kind: "visitor",
              }
            : {
                kind: "account",
                id: role + "-e2e",
                username: role === "admin" ? "admin_e2e" : "learner_e2e",
                role,
                plan_code: role === "learner" ? "basic" : null,
              },
        ui_locale: role === "visitor" ? null : locale,
        csrf_token: "csrf-e2e",
      },
      meta: { request_id: "req-bootstrap" },
    });
  }

  if (
    request.method === "POST" &&
    ["/api/v1/auth/login", "/api/v1/auth/register"].includes(url.pathname)
  ) {
    const body = await requestJson(request);
    if (body.password === "WrongPass123!") {
      return problem(response, {
        status: 401,
        code: "invalid_credentials",
        title: "Invalid credentials",
        detail: "The supplied credentials are invalid.",
      });
    }
    const nextRole = body.username === "admin_e2e" ? "admin" : "learner";
    return json(
      response,
      {
        data: {
          actor: {
            kind: "account",
            id: nextRole + "-e2e",
            username: nextRole === "admin" ? "admin_e2e" : "learner_e2e",
            role: nextRole,
            plan_code: nextRole === "learner" ? "basic" : null,
          },
          ui_locale: "en-US",
          csrf_token: "csrf-login-e2e",
          welcome: url.pathname.endsWith("/register")
            ? {
                kind: "no_learning",
                display_name: "Mia",
                days_since_learning: null,
                previous_learning_at: null,
              }
            : nextRole === "admin"
              ? null
              : {
                  kind: "returning",
                  display_name: "Mia",
                  days_since_learning: 5,
                  previous_learning_at: "2026-09-15T05:00:00Z",
                },
        },
        meta: { request_id: "req-login" },
      },
      {
        headers: {
          "set-cookie": `wordweave_session=${nextRole}; Path=/; HttpOnly; SameSite=Lax`,
        },
      },
    );
  }

  if (request.method === "PUT" && url.pathname === "/api/v1/me/ui-locale") {
    const body = await requestJson(request);
    return json(response, {
      data: { ui_locale: body.ui_locale },
      meta: { request_id: "req-locale" },
    });
  }

  if (
    ["GET", "PATCH"].includes(request.method) &&
    url.pathname === "/api/v1/me/account"
  ) {
    const profile =
      request.method === "PATCH"
        ? await requestJson(request)
        : { nickname: null, gender: null };
    return json(response, {
      data: {
        account: {
          username: "learner_e2e",
          nickname: profile.nickname,
          gender: profile.gender,
          display_name: profile.nickname || "learner_e2e",
          base_plan_code: "basic",
          effective_plan_code: "basic",
          ui_locale: locale,
          last_login_at: "2026-09-20T05:00:00Z",
          last_learning_at: "2026-09-15T05:00:00Z",
        },
      },
      meta: { request_id: "req-account" },
    });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/v1/notices")) {
    const notice = {
      id: "notice-1",
      title: locale === "zh-CN" ? "欢迎来到词涟" : "Welcome to WordWeave",
      body_html: "<p>Read a story. Practise your words.</p>",
      content_locale: locale,
      remind: true,
      remind_once: false,
      published_at: "2026-09-20T01:00:00Z",
      revision: "notice-revision",
    };
    const rows = [notice, ...configuredNotices(locale)].sort(
      (a, b) =>
        Number(b.remind) - Number(a.remind) ||
        b.published_at.localeCompare(a.published_at) ||
        a.id.localeCompare(b.id),
    );
    if (url.pathname === "/api/v1/notices")
      return json(response, {
        data: {
          items: rows.filter(
            (n) =>
              url.searchParams.get("reminders_only") !== "true" || n.remind,
          ),
        },
        meta: { request_id: "req-notices", next_cursor: null, has_more: false },
      });
    const selected = rows.find((n) => n.id === url.pathname.split("/").at(-1));
    if (!selected)
      return problem(response, {
        status: 404,
        code: "not_found",
        title: "Not found",
        detail: "Not found",
      });
    return json(response, {
      data: { notice: selected },
      meta: { request_id: "req-notice" },
    });
  }

  if (request.method === "DELETE" && url.pathname === "/api/v1/me/account") {
    const body = await requestJson(request);
    if (body.current_password !== "CorrectPass123!") {
      return problem(response, {
        status: 422,
        code: "validation_failed",
        title: "Invalid password",
        detail: "The current password is incorrect.",
        fieldErrors: [{ field: "current_password", code: "incorrect" }],
      });
    }
    return noContent(response, {
      "set-cookie":
        "wordweave_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax",
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/me/learning-summary"
  ) {
    const empty = request.headers.cookie?.includes(
      "wordweave_test_library=empty",
    );
    return json(response, {
      data: {
        generation_count: empty ? 0 : 18,
        unique_learned_entries: empty ? 0 : 42,
        participating_batches: empty ? 0 : 7,
        paused_batches: empty ? 0 : 2,
        successful_review_count: empty ? 0 : 11,
        batches_ever_reviewed_successfully: empty ? 0 : 5,
      },
      meta: { request_id: "req-summary" },
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/vocabulary/random"
  ) {
    const body = await requestJson(request);
    const entry =
      ["adapt", "gentle", "weave"].find(
        (word) => !body.selected_entries.includes(word),
      ) ?? null;
    return json(response, {
      data: { entry, reason: entry ? null : "no_candidates" },
      meta: { request_id: "req-random" },
    });
  }
  if (request.method === "GET" && url.pathname.startsWith("/api/v1/presets")) {
    const item = (id, language) => ({
      id,
      title: "A small step — " + language,
      published_version: "published-1",
      version_created_at: savedAt,
      configuration: {
        model: { id: model.id, name: model.display_name },
        entries: batch.entries,
        meaning_language: language,
        scenario: "story",
        length: "short",
      },
      sample: {
        passage: batchDetail.passage,
        tags: batchDetail.tags,
        targets: batchDetail.targets,
      },
      availability: { can_generate: true, reason: null },
    });
    if (url.pathname === "/api/v1/presets") {
      const second = url.searchParams.has("cursor");
      return json(response, {
        data: {
          items: second ? [item("preset-en", "en")] : [item("preset-zh", "zh")],
        },
        meta: {
          request_id: "req-presets",
          next_cursor: second ? null : "page-2",
          has_more: !second,
        },
      });
    }
    return json(response, {
      data: {
        preset: item(
          url.pathname.endsWith("preset-en") ? "preset-en" : "preset-zh",
          url.pathname.endsWith("preset-en") ? "en" : "zh",
        ),
        quota: {
          kind: "limited",
          limit: 5,
          remaining: 5,
          window_hours: 24,
          refreshes_at: null,
        },
        extra_quota: { remaining: 0, earliest_expires_at: null },
        can_start: true,
        block_reason: null,
      },
      meta: { request_id: "req-preset" },
    });
  }
  if (
    request.method === "PATCH" &&
    url.pathname === "/api/v1/me/batches/batch-e2e"
  ) {
    const body = await requestJson(request);
    if ("title" in body) {
      if (body.expected_title_revision !== batchDetail.title_revision)
        return problem(response, {
          status: 409,
          code: "revision_conflict",
          title: "Changed",
          detail: "Title changed.",
        });
      batch.title = batchDetail.title = body.title.trim();
      batch.title_revision = batchDetail.title_revision = "title-" + Date.now();
      return json(response, {
        data: {
          batch_id: batch.id,
          title: batch.title,
          title_revision: batch.title_revision,
        },
        meta: { request_id: "req-title" },
      });
    }
    batch.participates_in_range_review =
      batchDetail.participates_in_range_review =
        body.participates_in_range_review;
    return json(response, {
      data: {
        batch_id: batch.id,
        participates_in_range_review: body.participates_in_range_review,
      },
      meta: { request_id: "req-participation" },
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/generations/run-e2e/save"
  )
    return json(response, {
      data: { batch_id: batch.id, saved_at: savedAt, title: batch.title },
      meta: { request_id: "req-save" },
    });
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/generations/run-e2e/visitor-claim"
  )
    return json(response, {
      data: { claim_token: "claim-e2e", expires_at: "2026-09-20T12:00:00Z" },
      meta: { request_id: "req-claim" },
    });
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/visitor-claims/consume"
  )
    return json(response, {
      data: { batch_id: batch.id, claimed: true, title: batch.title },
      meta: { request_id: "req-consume" },
    });
  if (request.method === "GET" && url.pathname === "/api/v1/me/batches") {
    const empty =
      request.headers.cookie?.includes("wordweave_test_library=empty") ||
      url.searchParams.get("entry") === "absentword";
    return list(
      response,
      empty
        ? []
        : [
            {
              ...batch,
              single_batch_review: {
                action: "start",
                session_id: null,
              },
            },
          ],
      "req-batches",
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/me/review-sessions"
  ) {
    const body = await requestJson(request);
    const range = body.mode === "range";
    return json(
      response,
      {
        data: {
          session_id: range
            ? "session-restarted-range"
            : "session-restarted-single",
          mode: range ? "range" : "single_batch",
          status: "active",
          reused: false,
          date_range: range
            ? {
                start_date: body.start_date,
                end_date: body.end_date,
                timezone: body.timezone,
              }
            : null,
          progress: {
            completed_batches: 0,
            total_batches: range ? 5 : 1,
            successful_batches: 0,
            unsuccessful_batches: 0,
          },
          current_batch: reviewBatchProjection(),
        },
        meta: { request_id: "req-review-created" },
      },
      { status: 201 },
    );
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/me/batches/batch-e2e"
  ) {
    return json(response, {
      data: { batch: batchDetail },
      meta: { request_id: "req-batch-detail" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/generation-options"
  ) {
    const unavailable = request.headers.cookie?.includes(
      "wordweave_test_generation=unavailable",
    );
    return json(response, {
      data: {
        models: unavailable
          ? []
          : [
              {
                id: model.id,
                name: model.display_name,
                description: model.description,
                access: { from_plan: true, card_ends_at: null },
              },
            ],
        meaning_languages: ["zh", "en", "ja"],
        scenarios: ["discussion", "story", "business", "news"],
        lengths: unavailable ? [] : ["short", "medium", "long", "xlong"],
        max_entries: 5,
        effective_plan: {
          code: role === "visitor" ? "visitor" : "basic",
          origin: role === "visitor" ? "visitor" : "base",
          trial_ends_at: null,
        },
        extra_quota: { remaining: 0, earliest_expires_at: null },
        availability: unavailable
          ? { can_generate: false, reason: "no_models" }
          : { can_generate: true, reason: null },
        quota: {
          kind: "limited",
          limit: 5,
          remaining: 5,
          window_hours: 24,
          refreshes_at: "2026-09-02T00:00:00+08:00",
        },
      },
      meta: { request_id: "req-options" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/vocabulary/search"
  ) {
    const query = url.searchParams.get("q") ?? "";
    const rawLimit = url.searchParams.get("limit") || "10";
    if (!/^[+-]?\d+$/.test(rawLimit))
      return problem(response, {
        status: 400,
        code: "malformed_request",
        title: "Malformed request",
        detail: "The limit parameter is invalid.",
      });
    const limit = BigInt(rawLimit);
    if (limit < -(2n ** 63n) || limit > 2n ** 63n - 1n)
      return problem(response, {
        status: 400,
        code: "malformed_request",
        title: "Malformed request",
        detail: "The limit parameter is invalid.",
      });
    if (
      ![...query].length ||
      [...query].length > 64 ||
      limit < 1n ||
      limit > 20n
    )
      return problem(response, {
        status: 422,
        code: "validation_failed",
        title: "Invalid query",
        detail: "The vocabulary query is invalid.",
      });
    const normalized = query.toLowerCase();
    const matches = vocabularyEntries
      .filter((entry) => entry.toLowerCase().includes(normalized))
      .sort(
        (a, b) =>
          Number(!a.startsWith(normalized)) -
            Number(!b.startsWith(normalized)) ||
          a.length - b.length ||
          (a < b ? -1 : a > b ? 1 : 0),
      )
      .slice(0, Number(limit));
    return json(response, {
      data: {
        items: matches.map((entry) => ({ entry })),
        vocabulary_version: vocabularyVersion,
      },
      meta: { request_id: "req-search" },
    });
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/api/v1/generations/stream" ||
      /^\/api\/v1\/presets\/[^/]+\/generations\/stream$/.test(url.pathname))
  ) {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8",
    });
    response.end(
      [
        sse("generation.started", {
          run_id: "run-e2e",
          generation_token: "generation-token-e2e",
        }),
        sse("passage.delta", {
          text: "Teams adapt quickly when the context changes.",
        }),
        sse("generation.validated", {
          run_id: "run-e2e",
          result: {
            passage: batchDetail.passage,
            tags: batchDetail.tags,
            targets: batchDetail.targets,
          },
        }),
      ].join(""),
    );
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/generations/run-e2e/discard"
  ) {
    return noContent(response);
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/me/review-range/preview"
  ) {
    const scenario = /cr034_case=([^;]+)/.exec(
      request.headers.cookie ?? "",
    )?.[1];
    const timezone = url.searchParams.get("timezone") || "UTC";
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const records =
      scenario === "empty"
        ? []
        : [
            {
              date:
                scenario === "old" || scenario === "resume"
                  ? "2026-08-10"
                  : today,
              entries: 1,
              participates: scenario !== "paused",
            },
          ];
    const matches = records.filter(
      (record) =>
        record.participates &&
        record.date >= url.searchParams.get("start_date") &&
        record.date <= url.searchParams.get("end_date"),
    );
    const entries = matches.reduce((sum, record) => sum + record.entries, 0);
    return json(response, {
      data: {
        batch_count: matches.length,
        entry_count: entries,
        empty: matches.length === 0,
      },
      meta: { request_id: "req-review-preview" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/me/review-sessions/active-range"
  ) {
    const resume = request.headers.cookie?.includes("cr034_case=resume");
    return json(response, {
      data: {
        session: resume
          ? {
              session_id: "session-restarted-range",
              mode: "range",
              status: "active",
              date_range: {
                start_date: "2026-08-01",
                end_date: "2026-08-31",
                timezone: "UTC",
              },
              progress: {
                completed_batches: 2,
                total_batches: 5,
                successful_batches: 2,
                unsuccessful_batches: 0,
              },
            }
          : null,
      },
      meta: { request_id: "req-active-range" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/me/review-sessions/session-single"
  ) {
    return json(response, {
      data: { session: reviewSession() },
      meta: { request_id: "req-review-session" },
    });
  }

  const completedRoute = url.pathname.match(
    /^\/api\/v1\/me\/review-sessions\/(session-(single|range)-(complete|incomplete))$/u,
  );
  if (request.method === "GET" && completedRoute) {
    const [, sessionId, mode, outcome] = completedRoute;
    return json(response, {
      data: {
        session: completedReviewSession(
          sessionId,
          mode === "single" ? "single_batch" : "range",
          outcome === "complete",
        ),
      },
      meta: { request_id: "req-review-completed" },
    });
  }

  if (
    request.method === "POST" &&
    /^\/api\/v1\/me\/review-sessions\/[^/]+\/attempts$/u.test(url.pathname)
  ) {
    return json(
      response,
      {
        data: {
          attempt_id: "attempt-e2e",
          attempt_token: "attempt-token-e2e",
          item: {
            stage: "spelling",
            item_id: "item-e2e",
            entry_meaning: "change to fit a new situation",
            hint: {
              segments: [
                { kind: "blank", length_hint: 8 },
                { kind: "text", text: " to change" },
              ],
            },
          },
          progress: {
            stage: "spelling",
            item_number: 1,
            items_in_stage: 1,
          },
        },
        meta: { request_id: "req-review-attempt" },
      },
      { status: 201 },
    );
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/me/review-attempts/attempt-e2e/actions"
  ) {
    const body = await requestJson(request);
    if (body.item_id === "item-e2e") {
      return json(response, {
        data: {
          outcome: "advanced",
          result: body.action === "skip" ? "skipped" : "correct",
          item: reviewPassageItem(),
          progress: {
            stage: "passage_cloze",
            item_number: 1,
            items_in_stage: 1,
          },
        },
        meta: { request_id: "req-review-advanced" },
      });
    }
    return json(response, {
      data: {
        outcome: "retry",
        result: "incorrect",
        item: reviewPassageItem(),
        progress: {
          stage: "passage_cloze",
          item_number: 1,
          items_in_stage: 1,
        },
        incorrect_blank_ids: ["blank-2"],
      },
      meta: { request_id: "req-review-retry" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/admin/model-connections"
  )
    return json(response, {
      data: { items: [model.connection] },
      meta: { request_id: "req-connections" },
    });
  if (request.method === "GET" && url.pathname === "/api/v1/admin/models")
    return json(response, {
      data: { items: [model], revision: "model-revision" },
      meta: { request_id: "req-models", next_cursor: null, has_more: false },
    });

  if (request.method === "GET" && url.pathname === "/api/v1/admin/groups") {
    return json(response, {
      data: {
        items: ["visitor", "basic", "pro", "plus"].map((code) => ({
          code,
          rolling_24h_limit: code === "visitor" ? 5 : null,
          max_entries: 5,
          allowed_lengths: ["short", "medium", "long", "xlong"],
          models: [
            {
              id: model.id,
              display_name: model.display_name,
              enabled: true,
            },
          ],
        })),
      },
      meta: { request_id: "req-groups" },
    });
  }

  if (url.pathname.startsWith("/api/v1/admin/") && role !== "admin")
    return problem(response, {
      status: role === "visitor" ? 401 : 403,
      code: role === "visitor" ? "authentication_required" : "forbidden",
      title: "Access denied",
      detail: "Access denied",
    });
  const userMatch = url.pathname.match(
    /^\/api\/v1\/admin\/users\/(user-e2e|user-two|user-admin)(?:\/(batches)(?:\/([^/]+))?)?$/,
  );
  if (request.method === "GET" && userMatch) {
    const [, userId, collection, batchId] = userMatch;
    if (!collection) {
      const name =
        userId === "user-admin"
          ? "user-admin"
          : userId === "user-two"
            ? "user-zero"
            : "user-limited";
      const value = structuredClone(quotaFixtures[name]);
      value.data.user.id = userId;
      value.data.user.username =
        userId === "user-e2e"
          ? "learner_e2e"
          : userId === "user-two"
            ? "second_learner"
            : "admin_target";
      if (changedUsers.has(userId))
        Object.assign(value.data.user, changedUsers.get(userId));
      return json(response, value);
    }
    if (!batchId)
      return list(
        response,
        userId === "user-admin"
          ? []
          : [
              batch,
              {
                ...batch,
                id: "batch-second",
                entries: ["adapt"],
                saved_at: "2026-08-11T09:00:00+08:00",
              },
            ],
        "req-user-batches",
      );
    if (!["batch-e2e", "batch-second", "batch-long"].includes(batchId))
      return problem(response);
    const value = structuredClone(batchDetail);
    value.id = batchId;
    if (batchId !== "batch-e2e") {
      value.passage +=
        "\n\n" +
        (userId === "user-two"
          ? "A different learner owns this story."
          : "A second story belongs to this learner.");
      value.tags = [
        "second story",
        "a deliberately long multiword topic for wrapping checks",
      ];
      value.saved_at = "2026-08-11T09:00:00+08:00";
    }
    if (batchId === "batch-long")
      value.passage += (
        "\n\n" +
        "Readers build a clear connection between familiar ideas and new situations. ".repeat(
          20,
        )
      ).repeat(25);
    return json(response, {
      data: { batch: value },
      meta: { request_id: "req-reader" },
    });
  }

  if (request.method === "GET" && url.pathname === "/api/v1/admin/users") {
    const username = url.searchParams.get("username") ?? "";
    const cursor = url.searchParams.get("cursor");
    if (username === "return_scroll") {
      const items = Array.from({ length: 46 }, (_, index) =>
        index === 30
          ? adminUserSummary()
          : adminUserSummary(
              `return-user-${index}`,
              `return_scroll_${String(index).padStart(2, "0")}`,
            ),
      );
      if (cursor === "opaque.return.page-2") {
        return list(
          response,
          items.slice(20, 40),
          "req-users-return-2",
          "opaque.return.page-3",
        );
      }
      if (cursor === "opaque.return.page-3") {
        return list(response, items.slice(40), "req-users-return-3");
      }
      return list(
        response,
        items.slice(0, 20),
        "req-users-return-1",
        "opaque.return.page-2",
      );
    }
    if (username === "recover_cursor") {
      if (cursor) {
        return problem(response, {
          status: 422,
          code: "validation_failed",
          title: "Invalid cursor",
          detail: "The cursor is no longer valid.",
          fieldErrors: [{ field: "cursor", code: "invalid" }],
        });
      }
      return list(
        response,
        [adminUserSummary("recover-1", "recover_cursor")],
        "req-users-recover",
        "opaque.recover.expired",
      );
    }
    if (username === "append_failure") {
      if (cursor) {
        return problem(response, {
          status: 503,
          code: "service_unavailable",
          title: "Unavailable",
          detail: "Try again later.",
        });
      }
      return list(
        response,
        [adminUserSummary("failure-1", "append_failure")],
        "req-users-failure",
        "opaque.failure.next",
      );
    }
    if (username === "learner_e2e") {
      if (cursor) await delay(250);
      if (cursor === "opaque.users.page-2") {
        return list(
          response,
          [
            adminUserSummary("user-charlie", "charlie-learner_e2e"),
            adminUserSummary("user-delta", "delta-learner_e2e"),
          ],
          "req-users-2",
          "opaque.users.page-3",
        );
      }
      if (cursor === "opaque.users.page-3") {
        return list(
          response,
          [
            adminUserSummary("user-echo", "echo-learner_e2e"),
            adminUserSummary("user-foxtrot", "foxtrot-learner_e2e"),
          ],
          "req-users-3",
        );
      }
      return list(
        response,
        [
          adminUserSummary(),
          adminUserSummary("user-alpha", "alpha-learner_e2e"),
        ],
        "req-users-1",
        "opaque.users.page-2",
      );
    }
    return list(response, [adminUserSummary()], "req-users");
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/admin/users/user-e2e"
  ) {
    return json(response, {
      data: { user: adminUserDetail("basic") },
      meta: { request_id: "req-user-detail" },
    });
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/admin/users/user-e2e/batches"
  ) {
    return list(response, [batch], "req-user-batches");
  }

  if (
    request.method === "PUT" &&
    url.pathname === "/api/v1/admin/users/user-e2e/group"
  ) {
    const body = await requestJson(request);
    changedUsers.set("user-e2e", adminUserDetail(body.group_code));
    return json(response, {
      data: {
        user: adminUserDetail(body.group_code),
        quota_reset: true,
      },
      meta: { request_id: "req-change-group" },
    });
  }

  if (
    request.method === "PUT" &&
    url.pathname === "/api/v1/admin/users/user-e2e/password"
  ) {
    return noContent(response);
  }

  problem(response);
}

function sessionRole(cookie = "") {
  if (cookie.includes("wordweave_session=admin")) return "admin";
  if (cookie.includes("wordweave_session=learner")) return "learner";
  return "visitor";
}

function reviewSession() {
  return {
    session_id: "session-single",
    mode: "single_batch",
    status: "active",
    date_range: null,
    progress: {
      completed_batches: 0,
      total_batches: 1,
      successful_batches: 0,
      unsuccessful_batches: 0,
    },
    current_batch: reviewBatchProjection(),
    summary: null,
  };
}

function reviewBatchProjection() {
  return {
    batch_id: batch.id,
    saved_at: batch.saved_at,
    scenario: batch.scenario,
  };
}

function completedReviewSession(sessionId, mode, successfulView) {
  const single = mode === "single_batch";
  const total = single ? 1 : 5;
  const successful = single ? (successfulView ? 1 : 0) : successfulView ? 4 : 3;
  const unsuccessful = total - successful;
  return {
    session_id: sessionId,
    mode,
    status: "completed",
    date_range: single
      ? null
      : {
          start_date: "2026-08-23",
          end_date: "2026-08-29",
          timezone: "Asia/Shanghai",
        },
    progress: {
      completed_batches: total,
      total_batches: total,
      successful_batches: successful,
      unsuccessful_batches: unsuccessful,
    },
    current_batch: null,
    summary: {
      total_batches: total,
      successful_batches: successful,
      unsuccessful_batches: unsuccessful,
      skipped_batches: successfulView ? 0 : 1,
    },
  };
}

function reviewPassageItem() {
  return {
    stage: "passage_cloze",
    item_id: "item-passage-e2e",
    passage_segments: [
      { kind: "text", text: "Teams " },
      {
        kind: "blank",
        blank_id: "blank-1",
        group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
      },
      { kind: "text", text: " quickly and " },
      {
        kind: "blank",
        blank_id: "blank-2",
        group_key: "grp_BBBBBBBBBBBBBBBBBBBBBB",
      },
      { kind: "text", text: " ideas. Later they " },
      {
        kind: "blank",
        blank_id: "blank-3",
        group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
      },
      { kind: "text", text: " again while other " },
      {
        kind: "blank",
        blank_id: "blank-4",
        group_key: "grp_CCCCCCCCCCCCCCCCCCCCCC",
      },
      { kind: "text", text: " teams " },
      {
        kind: "blank",
        blank_id: "blank-5",
        group_key: "grp_BBBBBBBBBBBBBBBBBBBBBB",
      },
      { kind: "text", text: "." },
    ],
  };
}

function adminUserSummary(id = "user-e2e", username = "learner_e2e") {
  return {
    id,
    username,
    role: "learner",
    plan_code: "basic",
    status: "active",
    created_at: savedAt,
  };
}

function adminUserDetail(planCode) {
  return {
    ...structuredClone(
      quotaFixtures[
        planCode === "pro"
          ? "group-unlimited"
          : planCode === "plus"
            ? "group-zero"
            : "group-limited"
      ].data.user,
    ),
    ...adminUserSummary(),
    plan_code: planCode,
    ui_locale: "zh-CN",
    learning_batch_count: 1,
  };
}

async function requestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function list(response, items, requestId, nextCursor = null) {
  return json(response, {
    data: { items },
    meta: {
      request_id: requestId,
      next_cursor: nextCursor,
      has_more: nextCursor !== null,
    },
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function json(response, body, options = {}) {
  response.writeHead(options.status ?? 200, {
    "content-type": "application/json",
    ...(options.headers ?? {}),
  });
  response.end(JSON.stringify(body));
}

function noContent(response, headers = {}) {
  response.writeHead(204, headers);
  response.end();
}

function problem(response, options = {}) {
  const status = options.status ?? 404;
  response.writeHead(status, {
    "content-type": "application/problem+json",
  });
  response.end(
    JSON.stringify({
      type: "about:blank",
      title: options.title ?? "Not found",
      status,
      code: options.code ?? "not_found",
      detail: options.detail ?? "Mock route not found",
      request_id: "req-not-found",
      ...(options.fieldErrors ? { field_errors: options.fieldErrors } : {}),
    }),
  );
}
