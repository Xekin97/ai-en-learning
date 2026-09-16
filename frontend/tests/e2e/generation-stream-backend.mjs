// Synthetic-only browser fixture. No provider, database or real credentials.
import "./mock-backend.mjs";
import { createServer, request as httpRequest } from "node:http";
let sequence = 0;
const runs = new Map();
const frame = (name, data) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const result = (id) => ({
  run_id: id,
  result: {
    passage: "We adapt. 🙂",
    tags: ["Study"],
    targets: [
      {
        entry: "adapt",
        entry_meaning: "change to fit a new situation",
        hint_phrase: "adapt well",
        hint_blanks: [{ start: 0, end: 5 }],
        occurrences: [{ start: 3, end: 8, surface: "adapt" }],
      },
    ],
  },
});
createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  if (path === "/api/v1/generations/stream") {
    const mode =
      /wordweave_g14=([^;]+)/.exec(req.headers.cookie ?? "")?.[1] ?? "valid";
    const id = "synthetic-" + ++sequence;
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      "x-request-id": "synthetic-request",
    });
    res.flushHeaders();
    const run = { res, mode, timers: [] };
    runs.set(id, run);
    const later = (fn, ms) => run.timers.push(setTimeout(fn, ms));
    const start = () => {
      res.write(
        frame("generation.started", {
          run_id: id,
          generation_token: "synthetic-capability",
        }),
      );
      res.write(frame("passage.delta", { text: "We adapt." }));
      if (["valid", "failed", "eof", "malformed"].includes(mode))
        later(() => {
          if (mode === "valid")
            res.write(frame("generation.validated", result(id))); // Intentionally stay open.
          if (mode === "failed")
            res.write(
              frame("generation.failed", {
                code: "content_validation_failed",
                quota_refunded: false,
                retryable: true,
                request_id: "synthetic-request",
              }),
            );
          if (mode === "eof") res.end();
          if (mode === "malformed")
            res.write("event: passage.delta\ndata: {broken\n\n");
        }, 300);
    };
    if (mode === "early-cancel") later(start, 250);
    else start();
    later(() => res.end(), 15000);
    res.on("close", () => {
      for (const t of run.timers) clearTimeout(t);
      runs.delete(id);
    });
    return;
  }
  const match = /^\/api\/v1\/generations\/(synthetic-\d+)\/cancel$/.exec(path);
  if (match) {
    const run = runs.get(match[1]);
    const status = run?.mode === "cancel-loses" ? "valid" : "cancelled";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        data: { status, quota_refunded: false },
        meta: { request_id: "synthetic-cancel" },
      }),
    );
    if (run)
      run.timers.push(
        setTimeout(() => {
          run.res.write(
            status === "valid"
              ? frame("generation.validated", result(match[1]))
              : frame("generation.cancelled", { quota_refunded: false }),
          );
        }, 80),
      );
    return;
  }
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: 38080,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}).listen(38081, "127.0.0.1", () =>
  process.stdout.write("synthetic G14 stream fixture ready\n"),
);
