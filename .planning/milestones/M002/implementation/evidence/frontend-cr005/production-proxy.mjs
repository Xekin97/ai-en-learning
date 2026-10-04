// Same-origin production-build test proxy; fixed loopback destinations only.
import { createServer, request } from "node:http";
createServer((req, res) => {
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: req.url.startsWith("/api/v1") ? 38080 : 3333,
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
}).listen(3334, "127.0.0.1", () =>
  console.log("Local mock proxy 3334 → frontend 3333 / contract mock 38080"),
);
