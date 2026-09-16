import { request, origin, bootstrap, api, login, sql, recorder } from "./lib.mjs";

const out = recorder("batch-delete-contract-recheck2");
const client = await request.newContext();
const safeResponses = [];

try {
  out.record("login with retained synthetic account", (await login({ request: client }, "qa085_nocontent", "Qa085AdminResetOnly!")).status, 200);
  const csrf = (await bootstrap({ request: client })).csrf_token;
  const batchID = sql("SELECT id FROM wordweave.learning_batches WHERE owner_id=(SELECT id FROM wordweave.accounts WHERE lower(username)='qa085_nocontent') ORDER BY saved_at DESC LIMIT 1");
  const sessionID = sql(`SELECT rs.id FROM wordweave.review_sessions rs JOIN wordweave.review_session_batches rsb ON rsb.session_id=rs.id WHERE rs.owner_id=(SELECT id FROM wordweave.accounts WHERE lower(username)='qa085_nocontent') AND rsb.batch_id='${batchID}' ORDER BY rs.created_at DESC LIMIT 1`);
  out.record("retained batch fixture exists", Boolean(batchID), true);
  out.record("retained review-session fixture exists", Boolean(sessionID), true);

  const response = await api({ request: client }, "DELETE", `/api/v1/me/batches/${batchID}`, csrf, undefined, { "content-type": "application/json" });
  safeResponses.push({
    id: "consumer batch deletion corrected contract request",
    status: response.status,
    bodyBytes: response.raw.length,
    contentType: response.headers["content-type"] ?? null,
    cacheControl: response.headers["cache-control"] ?? null,
  });
  out.record("batch deletion status", response.status, 204);
  out.record("batch deletion body bytes", response.raw.length, 0);
  out.record("batch deletion content-type absent", response.headers["content-type"] ?? null, null);
  out.record("batch deletion cache-control", response.headers["cache-control"], "no-store");
  out.record("batch deletion cascades review session", Number(sql(`SELECT count(*) FROM wordweave.review_sessions WHERE id='${sessionID}'`)), 0);
  out.record("deleted batch cannot be read", (await api({ request: client }, "GET", `/api/v1/me/batches/${batchID}`)).status, 404);
} catch (error) {
  out.error("batch deletion corrected request execution", error);
} finally {
  await client.dispose().catch(() => {});
}

out.save({ origin, topology: "fixed candidate backend through real QA085 Nginx", correction: "application/json request Content-Type required by global write contract", safeResponses });
