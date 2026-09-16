import http from "node:http";

const port = Number(process.env.MOCK_OPENROUTER_PORT ?? "39090");
const apiKey = "integration-secret-key";
const modelId = "provider/integration";
let modelRequests = 0;
let generationRequests = 0;
let responseMode = "success";

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("request too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function extractSpec(providerRequest) {
  const userMessage = providerRequest.messages?.find((message) => message.role === "user")?.content ?? "";
  const marker = "Create one batch using this server-validated data: ";
  const start = userMessage.indexOf(marker);
  const end = userMessage.indexOf(". Include every entry naturally", start);
  if (start < 0 || end < 0) throw new Error("generation specification missing");
  return {
    ...JSON.parse(userMessage.slice(start + marker.length, end)),
    compatibilityProbe: userMessage.includes("fixed compatibility probe"),
  };
}

function localizedMeaning(entry, language) {
  if (language === "zh") return "结合短文语境理解这个词的含义";
  if (language === "ja") return "文脈に沿ってこの語の意味を理解すること";
  return "gain knowledge through guided study and experience";
}

function localizedTag(language) {
  if (language === "zh") return "学习协作";
  if (language === "ja") return "学習協力";
  return "collaborative learning";
}

function buildCandidate(spec) {
  const entries = Array.isArray(spec.entries) ? spec.entries : [];
  const minimumWords = Number(spec.minimum_words ?? 50);
  const lead = `In this ${spec.scenario} passage, a thoughtful study group explores ${entries.join(", ")} through practical examples and careful conversation.`;
  const reinforcement = entries.map((entry) => `They use ${entry} naturally, discuss ${entry} again, and connect the idea with daily experience.`).join(" ");
  const filler = "The learners compare observations, ask clear questions, revise their notes, and support one another with patient explanations.";
  let passage = `${lead} ${reinforcement}`;
  while (passage.trim().split(/\s+/u).length < minimumWords) passage += ` ${filler}`;

  return {
    passage,
    tags: [localizedTag(spec.meaning_language)],
    targets: entries.map((entry) => ({
      source_entry: entry,
      contextual_meaning: localizedMeaning(entry, spec.meaning_language),
      hint_phrase: spec.compatibilityProbe && entry === "learn"
        ? "learning through learned examples while learning"
        : `use ${entry} with care and use ${entry} again`,
    })),
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/__stats") {
    json(response, 200, { modelRequests, generationRequests, responseMode });
    return;
  }
  if (request.method === "POST" && request.url === "/__reset") {
    modelRequests = 0;
    generationRequests = 0;
    responseMode = "success";
    json(response, 200, { reset: true });
    return;
  }
  if (request.method === "POST" && request.url?.startsWith("/__mode?")) {
    const requestedMode = new URL(request.url, "http://localhost").searchParams.get("value");
    if (!["success", "slow", "provider_error", "malformed", "content_invalid"].includes(requestedMode)) {
      json(response, 422, { error: { message: "unsupported mode" } });
      return;
    }
    responseMode = requestedMode;
    json(response, 200, { responseMode });
    return;
  }
  if (request.headers.authorization !== `Bearer ${apiKey}`) {
    json(response, 401, { error: { message: "unauthorized" } });
    return;
  }

  if (request.method === "GET" && request.url === "/v1/models") {
    modelRequests += 1;
    json(response, 200, {
      data: [{ id: modelId, supported_parameters: ["structured_outputs"] }],
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/chat/completions") {
    generationRequests += 1;
    try {
      const providerRequest = JSON.parse(await readBody(request));
      if (providerRequest.model !== modelId || providerRequest.stream !== true) {
        json(response, 422, { error: { message: "unsupported request" } });
        return;
      }
      if (responseMode === "provider_error") {
        json(response, 503, { error: { message: "verification provider unavailable" } });
        return;
      }
      const spec = extractSpec(providerRequest);
      const candidate = buildCandidate(spec);
      if (responseMode === "content_invalid") candidate.passage = "learn";
      const rawCandidate = responseMode === "malformed" ? "{not-json" : JSON.stringify(candidate);
      const splitAt = Math.max(1, Math.floor(rawCandidate.length / 3));
      const chunks = [
        rawCandidate.slice(0, splitAt),
        rawCandidate.slice(splitAt, splitAt * 2),
        rawCandidate.slice(splitAt * 2),
      ];
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const content of chunks) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        await new Promise((resolve) => setTimeout(resolve, responseMode === "slow" ? 1_500 : 60));
      }
      response.end("data: [DONE]\n\n");
    } catch {
      json(response, 400, { error: { message: "bad request" } });
    }
    return;
  }

  json(response, 404, { error: { message: "not found" } });
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`mock OpenRouter listening on ${port}\n`);
});
