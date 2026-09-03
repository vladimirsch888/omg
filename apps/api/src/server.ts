import { serve } from "@hono/node-server";
import { app } from "./app";
import { config } from "./config";
import { startDigestScheduler } from "./modules/reminders/reminders.service";

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port} (TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone})`);
  startDigestScheduler();
});
