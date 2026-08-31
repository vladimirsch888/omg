import { serve } from "@hono/node-server";
import { app } from "./app";
import { config } from "./config";

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
