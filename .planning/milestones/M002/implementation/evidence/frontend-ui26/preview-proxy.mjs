// Same-origin production-build test proxy; fixed loopback destinations only.
import { createServer, request } from "node:http";
createServer((req, res) => {
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: req.url.startsWith("/api/v1") ? 38080 : 3310,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}).listen(3311, "127.0.0.1", () =>
  console.log("Local mock proxy 3311 → frontend 3310 / contract mock 38080"),
);
