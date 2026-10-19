import http from "node:http";

const publicHost = "127.0.0.1";
const publicPort = 3019;
const frontend = { hostname: "127.0.0.1", port: 3018 };
const backend = { hostname: "127.0.0.1", port: 43331 };
const candidateOrigin = "http://localhost:3019";
const configuredPublicOrigin = "http://localhost:3016";

const server = http.createServer((request, response) => {
  const target = request.url?.startsWith("/api/v1") ? backend : frontend;
  const headers = { ...request.headers };
  headers.host = `${target.hostname}:${target.port}`;
  headers["x-forwarded-host"] =
    target === backend ? "localhost:3016" : request.headers.host ?? "localhost:3019";
  headers["x-forwarded-proto"] = "http";

  if (target === backend && headers.origin === candidateOrigin) {
    headers.origin = configuredPublicOrigin;
  }
  if (
    target === backend &&
    typeof headers.referer === "string" &&
    headers.referer.startsWith(`${candidateOrigin}/`)
  ) {
    headers.referer = `${configuredPublicOrigin}${headers.referer.slice(candidateOrigin.length)}`;
  }

  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: request.url,
      method: request.method,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }
    response.end("Pronunciation candidate upstream unavailable");
  });
  request.pipe(upstream);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

server.listen(publicPort, publicHost, () => {
  console.log(
    `pronunciation candidate http://localhost:${publicPort} -> frontend:${frontend.port} / real backend:${backend.port}`,
  );
});
