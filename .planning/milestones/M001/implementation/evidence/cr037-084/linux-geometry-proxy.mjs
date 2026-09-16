import net from "node:net";
const servers = [];
const sockets = new Set();
for (const port of [3300, 6010]) {
  const server = net.createServer((local) => {
    const remote = net.connect(port, "host.docker.internal");
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
    server.listen(port, "127.0.0.1", resolve).on("error", reject),
  );
  servers.push(server);
}
try {
  await import("./linux-geometry.mjs");
} finally {
  for (const socket of sockets) socket.destroy();
  for (const server of servers) server.close();
}
