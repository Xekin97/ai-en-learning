import net from "node:net";
const sockets = new Set();
const server = net.createServer((local) => {
  const remote = net.connect(6101, "host.docker.internal");
  for (const socket of [local, remote]) {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  }
  local.pipe(remote);
  remote.pipe(local);
  local.on("error", () => remote.destroy());
  remote.on("error", () => local.destroy());
});
await new Promise((resolve, reject) =>
  server.listen(6101, "127.0.0.1", resolve).on("error", reject),
);
try {
  await import("./password-browser.mjs");
} finally {
  for (const socket of sockets) socket.destroy();
  server.close();
}
