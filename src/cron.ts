import { cron } from "@elysiajs/cron";
import { treaty } from "@elysiajs/eden";
import { Elysia } from "elysia";
import type { App } from "./serve";

const app = treaty<App>(process.env.API_URL ?? "");

new Elysia().use(
  cron({
    name: "reminder-event",
    pattern: "0 18 * * *",
    timezone: "Asia/Tokyo",
    async run() {
      console.log(new Date(), "Cron job started");
      await app.today.post();
      console.log(new Date(), "Cron job finished");
    },
  })
);
