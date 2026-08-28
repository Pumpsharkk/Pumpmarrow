import http from "http";

/**
 * Tiny HTTP server whose only job is to respond to pings.
 * Free Replit projects go to sleep after inactivity — an external
 * uptime monitor (e.g. UptimeRobot) hitting this endpoint every few
 * minutes keeps the process alive.
 */
export function startKeepAliveServer(port = process.env.PORT || 3000) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("pumpfun-signal-bot is alive\n");
  });

  server.listen(port, () => {
    console.log(`[keepalive] ping server listening on port ${port}`);
  });

  return server;
}
