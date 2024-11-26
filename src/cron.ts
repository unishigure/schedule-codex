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

      // Get events
      const { data } = await app.today.get();
      if (!data) {
        console.error("Failed to fetch events");
        return;
      }
      if ("message" in data) {
        console.error(data.message);
        return;
      }

      // Send reminder
      if (Array.isArray(data)) {
        data.forEach(async (event) => {
          console.log(`Event: ${event.summary}`);
          console.log(`Start: ${event.start?.dateTime}`);
          console.log(`End: ${event.end?.dateTime}`);

          const start = new Date(event.start?.dateTime ?? "").getTime() / 1000;
          const messageBody = {
            embeds: [
              {
                title: `Reminder: ${event.summary}`,
                description: `本日活動日です！\n<t:${start}:t>より`,
                timestamp: event.start?.dateTime,
                color: parseInt("ffd700", 16),
                image: {
                  url: process.env.DISCORD_IMAGE_URL ?? "",
                },
              },
            ],
          };

          await fetch(new URL(process.env.DISCORD_WEBHOOK_URL ?? ""), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(messageBody),
          });
        });
      }
      console.log(new Date(), "Cron job finished");
    },
  })
);
