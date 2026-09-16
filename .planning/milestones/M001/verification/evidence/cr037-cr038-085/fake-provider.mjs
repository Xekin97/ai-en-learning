import http from "node:http";

const passage = "A thoughtful student learns by building a steady learning routine through daily reading and discussion. Each morning the student reviews a few ideas, connects them with practical examples, and writes a short reflection. Friends later compare their observations, ask clear questions, and share useful explanations about what they learned. This patient practice makes new knowledge easier to remember and apply with confidence.";
const candidate = {
  passage,
  tags: ["study"],
  targets: [{
    source_entry: "learn",
    contextual_meaning: "gain knowledge through study",
    hint_phrase: "learning through learned examples while learning",
  }],
};

const server = http.createServer((request, response) => {
  if (request.headers.authorization !== "Bearer qa085-synthetic-provider-key") {
    response.writeHead(401).end("unauthorized");
    return;
  }
  if (request.method === "GET" && request.url === "/models") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "provider/qa085", supported_parameters: ["structured_outputs"] }] }));
    return;
  }
  if (request.method === "POST" && request.url === "/chat/completions") {
    request.resume();
    request.on("end", () => {
      const chunk = { choices: [{ delta: { content: JSON.stringify(candidate) } }] };
      response.setHeader("content-type", "text/event-stream");
      response.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
    });
    return;
  }
  response.writeHead(404).end("not found");
});

server.listen(8888, "0.0.0.0");
