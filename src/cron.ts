import cron from "@elysiajs/cron";
import { treaty } from "@elysiajs/eden";
import Elysia from "elysia";
import type { app } from "./api";

const api = treaty<typeof app>(process.env.API_URL ?? "");

new Elysia()
  .use(
    cron({
      name: "reminder-event",
      pattern: "0 0 * * *",
      timezone: "Asia/Tokyo",
      async run() {
        console.log(new Date(), "Cron job started");
        await api.today.post();
        console.log(new Date(), "Cron job finished");
      },
    }),
  )
  .use(
    cron({
      name: "health-check",
      pattern: "*/5 * * * *",
      timezone: "Asia/Tokyo",
      async run() {
        const res = await api.health.get();
        console.log(new Date(), res);
      },
    }),
  );

console.log("Cron job is running");
