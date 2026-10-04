let sessions = new Map(),
  attempts = new Map(),
  serial = 0;
const stamp = "2026-09-20T09:00:00Z";
export async function reviewFixture(request, response, url) {
  const json = (data, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ data, meta: { request_id: "review-fixture" } }),
    );
    return true;
  };
  const body = async () => {
    let value = "";
    for await (const part of request) value += part;
    return JSON.parse(value || "{}");
  };
  const problem = (status, code) => {
    response.writeHead(status, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Unavailable",
        status,
        code,
        detail: "Review request could not be completed.",
        request_id: "fixture-problem",
      }),
    );
    return true;
  };
  if (url.pathname === "/api/v1/__test/review-reset") {
    sessions = new Map();
    attempts = new Map();
    serial = 0;
    return json({});
  }
  if (!url.pathname.includes("/me/review-")) return false;
  if (url.pathname === "/api/v1/me/review-range/preview")
    return json({ batch_count: 1, entry_count: 1, empty: false });
  if (url.pathname === "/api/v1/me/review-sessions/active-range")
    return json({
      session:
        [...sessions.values()].find(
          (s) => s.mode === "range" && s.status === "active",
        ) ?? null,
    });
  const makeSession = (input) => {
    const id = "session-" + ++serial;
    const session = {
      session_id: id,
      mode: input.mode,
      status: "active",
      date_range:
        input.mode === "range"
          ? {
              start_date: input.start_date,
              end_date: input.end_date,
              timezone: input.timezone,
            }
          : null,
      progress: {
        completed_batches: 0,
        total_batches: 1,
        successful_batches: 0,
        unsuccessful_batches: 0,
        skipped_batches: 0,
      },
      current_batch: {
        batch_id: "batch-e2e",
        saved_at: stamp,
        scenario: "story",
      },
      current_attempt: null,
    };
    sessions.set(id, session);
    return session;
  };
  const makeAttempt = (session) => {
    const id = "attempt-" + ++serial;
    const attempt = {
      attempt_id: id,
      session_id: session.session_id,
      batch_id: "batch-e2e",
      revision: "1",
      attempt_token: "test-capability",
      token_expires_at: "2099-01-01T00:00:00Z",
      words: [
        {
          question_id: "q-opaque",
          entry_meaning: "change to fit a new situation",
          slots: [{ kind: "letters", count: 5 }],
          hint: {
            segments: [{ kind: "blank" }, { kind: "text", text: " to change" }],
          },
        },
      ],
      passage: {
        segments: [
          { kind: "text", text: "Teams " },
          {
            kind: "blank",
            blank_id: "b-opaque",
            group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
          },
          { kind: "text", text: " quickly when the context changes." },
        ],
      },
    };
    attempts.set(id, { attempt, state: "draft" });
    session.status = "active";
    session.current_batch = {
      batch_id: "batch-e2e",
      saved_at: stamp,
      scenario: "story",
    };
    session.current_attempt = { attempt_id: id, revision: "1", state: "draft" };
    return attempt;
  };
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/me/review-sessions"
  ) {
    const input = await body(),
      existing = [...sessions.values()].find(
        (s) => s.status === "active" && s.mode === input.mode,
      );
    return json({
      session: existing ?? makeSession(input),
      reused: Boolean(existing),
    });
  }
  const sessionMatch =
    /\/review-sessions\/([^/]+)(?:\/(attempts|replace))?$/.exec(url.pathname);
  if (sessionMatch) {
    const session = sessions.get(sessionMatch[1]);
    if (!session) return problem(404, "not_found");
    if (!sessionMatch[2])
      return json({ session, session_revision: "session-revision" });
    if (sessionMatch[2] === "replace") {
      const input = await body();
      session.status = "abandoned";
      session.current_batch = session.current_attempt = null;
      return json({
        session: makeSession({ mode: "range", ...input.range }),
        replaced_session_id: session.session_id,
      });
    }
    if (session.status !== "active") return problem(409, "state_conflict");
    const existing = session.current_attempt
      ? attempts.get(session.current_attempt.attempt_id)
      : null;
    return json({ attempt: existing?.attempt ?? makeAttempt(session) });
  }
  const match = /\/review-attempts\/([^/]+)(?:\/(submit|restart))?$/.exec(
    url.pathname,
  );
  if (!match) return false;
  const record = attempts.get(match[1]);
  if (!record) return problem(404, "not_found");
  const session = sessions.get(record.attempt.session_id);
  if (request.method === "GET")
    return record.state === "draft"
      ? json({ state: "draft", attempt: record.attempt })
      : record.state === "submitted"
        ? json({ state: "submitted", receipt: record.receipt, session })
        : json({ state: "restarted", session });
  if (match[2] === "restart") {
    record.state = record.state === "submitted" ? "submitted" : "restarted";
    return json({ attempt: makeAttempt(session), session });
  }
  if (match[2] === "submit") {
    if (record.state === "submitted")
      return json({
        outcome: "already_submitted",
        receipt: record.receipt,
        session,
      });
    if (record.state !== "draft") return problem(409, "state_conflict");
    const input = await body(),
      word =
        input.words.find((w) => w.question_id === "q-opaque")?.answer.trim() ??
        "",
      passage =
        input.passage.find((p) => p.blank_id === "b-opaque")?.answer.trim() ??
        "";
    const result = (value) =>
      !value
        ? "unanswered"
        : value.toLowerCase() === "adapt"
          ? "correct"
          : "incorrect";
    const successful =
      result(word) === "correct" && result(passage) === "correct";
    record.state = "submitted";
    record.receipt = {
      attempt_id: record.attempt.attempt_id,
      batch_id: "batch-e2e",
      revision: "2",
      submitted_at: stamp,
      successful,
      has_answer: Boolean(word || passage),
    };
    session.status = "completed";
    session.current_batch = session.current_attempt = null;
    session.progress = {
      completed_batches: 1,
      total_batches: 1,
      successful_batches: successful ? 1 : 0,
      unsuccessful_batches: successful ? 0 : 1,
      skipped_batches: !word || !passage ? 1 : 0,
    };
    return json({
      outcome: "submitted",
      receipt: record.receipt,
      session,
      comparison: {
        words: [
          {
            question_id: "q-opaque",
            input: word,
            correct: "adapt",
            result: result(word),
          },
        ],
        passage_segments: [
          { kind: "text", text: "Teams " },
          {
            kind: "answer",
            blank_id: "b-opaque",
            input: passage,
            correct: "adapt",
            result: result(passage),
          },
          { kind: "text", text: " quickly when the context changes." },
        ],
      },
      growth: {
        new_masteries: successful ? 1 : 0,
        experience_added: successful ? "1" : "0",
        points_added: "0",
      },
    });
  }
  return false;
}
