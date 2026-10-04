const time = "2026-09-20T05:00:00Z";
const result = {
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
};
const usage = {
  logical_runs: 1,
  provider_calls: 1,
  input_tokens: null,
  output_tokens: null,
  cost: null,
  unknown_calls: 1,
};
let revision = 1,
  items = [],
  missing = false,
  optionsFail = false,
  delayed = false;
const config = {
  model: { id: "model-admin", name: "Admin model" },
  entries: ["adapt"],
  meaning_language: "en",
  scenario: "story",
  length: "short",
};
function reset() {
  revision = 1;
  missing = false;
  optionsFail = false;
  delayed = false;
  items = [
    {
      id: "preset-admin",
      draft_version: "draft-1",
      published_version: "published-1",
      listed: true,
      title: "Live story",
      configuration: structuredClone(config),
      draft_state: "preview_ready",
      has_unpublished_changes: false,
      preview: {
        preview_run_id: "preview-old",
        completed_at: time,
        result,
        usage,
      },
      published: {
        title: "Live story",
        configuration: structuredClone(config),
        sample: result,
        version_created_at: time,
      },
    },
  ];
}
reset();
export async function adminPresetsFixture(request, response, url) {
  const json = (data, list = false, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data,
        meta: {
          request_id: "presets-fixture",
          ...(list ? { next_cursor: null, has_more: false } : {}),
        },
      }),
    );
    return true;
  };
  const problem = (status, code) => {
    response.writeHead(status, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Try again",
        status,
        code,
        detail: "Try again.",
        request_id: "presets-fixture",
      }),
    );
    return true;
  };
  const body = async () => {
    let s = "";
    for await (const c of request) s += c;
    return s ? JSON.parse(s) : {};
  };
  const rev = () => `preset-config-${revision}`;
  if (url.pathname === "/api/v1/__test/admin-presets-reset") {
    reset();
    return json({});
  }
  if (url.pathname === "/api/v1/__test/admin-presets-state") {
    const input = await body();
    missing = input.missing ?? missing;
    optionsFail = input.optionsFail ?? optionsFail;
    delayed = input.delayed ?? delayed;
    return json({});
  }
  if (url.pathname === "/api/v1/admin/generation-options") {
    if (optionsFail) return problem(503, "temporarily_unavailable");
    return json({
      models: [{ id: "model-admin", name: "Admin model", description: null }],
      meaning_languages: ["zh", "en", "ja"],
      scenarios: ["discussion", "story", "business", "news"],
      lengths: ["short", "medium", "long", "xlong"],
      vocabulary_version: "words-fixture",
      revision: rev(),
      availability: {
        can_preview: !missing,
        reason: missing ? "credential_missing" : null,
      },
    });
  }
  if (url.pathname === "/api/v1/admin/preset-previews/preview-new/cancel") {
    if (request.headers["x-preview-token"] !== "preview-private-token")
      return problem(404, "not_found");
    return json({ status: "cancelled" });
  }
  if (!url.pathname.startsWith("/api/v1/admin/presets")) return false;
  const path = url.pathname.slice("/api/v1/admin/presets".length),
    method = request.method;
  if (path === "" && method === "GET")
    return json({ items, revision: rev() }, true);
  const match = path.match(
      /^\/([^/]+)(?:\/(publish|unpublish|previews\/stream))?$/,
    ),
    item = items.find((p) => p.id === match?.[1]);
  if (item && method === "GET") return json({ preset: item, revision: rev() });
  const input = await body();
  if (match?.[2] === "previews/stream") {
    if (missing) return problem(422, "credential_missing");
    if (input.draft_version !== item.draft_version)
      return problem(409, "revision_conflict");
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    });
    const event = (name, data) =>
      response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    event("preview.started", {
      preview_run_id: "preview-new",
      preview_token: "preview-private-token",
    });
    event("passage.delta", { text: result.passage });
    if (delayed) {
      response.on("close", () => {});
      return true;
    }
    item.preview = {
      preview_run_id: "preview-new",
      completed_at: time,
      result,
      usage,
    };
    item.draft_state = "preview_ready";
    event("preview.validated", {
      preview_run_id: "preview-new",
      draft_version: item.draft_version,
      result,
      usage,
    });
    response.end();
    return true;
  }
  if (item && input.expected_revision !== rev())
    return problem(409, "revision_conflict");
  if (match?.[2] === "publish") {
    if (item.draft_state !== "preview_ready")
      return problem(422, "preview_required");
    item.published = {
      title: item.title,
      configuration: structuredClone(item.configuration),
      sample: item.preview.result,
      version_created_at: time,
    };
    item.published_version = "published-" + revision;
    item.listed = true;
    item.has_unpublished_changes = false;
    revision++;
    return json({ preset: item, revision: rev() });
  }
  if (match?.[2] === "unpublish") {
    item.listed = false;
    revision++;
    return json({ preset: item, revision: rev() });
  }
  if (method === "POST" || method === "PUT") {
    const c = input.configuration,
      configuration = {
        model: { id: c.model_id, name: "Admin model" },
        entries: c.entries,
        meaning_language: c.meaning_language,
        scenario: c.scenario,
        length: c.length,
      },
      same =
        item &&
        JSON.stringify(configuration) === JSON.stringify(item.configuration);
    revision++;
    const value = {
      id: item?.id ?? "preset-new",
      draft_version: "draft-" + revision,
      published_version: item?.published_version ?? null,
      listed: item?.listed ?? false,
      title: input.title,
      configuration,
      draft_state: same && item.preview ? "preview_ready" : "needs_preview",
      has_unpublished_changes: true,
      preview: same ? item.preview : null,
      published: item?.published ?? null,
    };
    if (item) items[items.indexOf(item)] = value;
    else items.push(value);
    return json({ preset: value, revision: rev() }, false, item ? 200 : 201);
  }
  return problem(404, "not_found");
}
