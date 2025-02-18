import { google } from "googleapis";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { createFactory } from "hono/factory";
import type { StatusCode } from "hono/utils/http-status";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";
import { oauth2Client } from "../../lib/googleapis";

extendZodWithOpenApi(z);
const factory = createFactory();

async function getWeek() {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const nextTuesday = new Date();
  nextTuesday.setDate(
    nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7),
  );
  nextTuesday.setHours(0, 0, 0, 0);
  const sixDaysLater = new Date(
    nextTuesday.getTime() + 6 * 24 * 60 * 60 * 1000,
  );
  sixDaysLater.setHours(23, 59, 59, 999);

  const events = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: nextTuesday.toISOString(),
    timeMax: sixDaysLater.toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });

  return events.data.items || [];
}

/* --- GET /week --- */

const getWeekResponse = z.array(
  z.object({
    summary: z
      .string()
      .openapi({ description: "The event summary", example: "Meeting" }),
    start: z
      .string()
      .openapi({
        description: "The start date-time",
        example: "2021-10-01T09:00:00+09:00",
      }),
    end: z
      .string()
      .openapi({
        description: "The end date-time",
        example: "2021-10-01T10:00:00+09:00",
      }),
  }),
);

export const getWeekRoute = describeRoute({
  description: "Get this week's events",
  tags: ["remind"],
  responses: {
    200: {
      description: "The events",
      content: { "application/json": { schema: resolver(getWeekResponse) } },
    },
  },
});

export const getWeekHandler = factory.createHandlers(async (context) => {
  return await getWeek()
    .then((events) => {
      return context.json(
        events.map((event) => ({
          summary: event.summary,
          start: event.start?.dateTime,
          end: event.end?.dateTime,
        })),
      );
    })
    .catch((error) => {
      if (error instanceof Error) {
        context.status(StatusCodes.UNAUTHORIZED);
        return context.json({ message: error.message });
      } else {
        console.error(error);
        context.status(StatusCodes.INTERNAL_SERVER_ERROR);
        return context.json({ message: ReasonPhrases.INTERNAL_SERVER_ERROR });
      }
    });
});

/* --- POST /week --- */

const postWeekResponse = z.object({
  message: z
    .string()
    .openapi({ description: "The message", example: "Success" }),
});

export const postWeekRoute = describeRoute({
  description: "Post week's events to Discord",
  tags: ["remind"],
  responses: {
    200: {
      description: "The message",
      content: { "application/json": { schema: resolver(postWeekResponse) } },
    },
  },
});

export const postWeekHandler = factory.createHandlers(async (context) => {
  try {
    const events = await getWeek();
    if (events.length === 0) {
      return context.json({ message: "No events found" });
    }

    const nextTuesday = new Date();
    nextTuesday.setDate(
      nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7),
    );
    nextTuesday.setHours(0, 0, 0, 0);
    const sixDaysLater = new Date(
      nextTuesday.getTime() + 6 * 24 * 60 * 60 * 1000,
    );

    const eventList =
      events.length > 0
        ? events.map((event) => {
            const start =
              new Date(event.start?.dateTime ?? "").getTime() / 1000;
            return `- <t:${start}:F>`;
          })
        : ["- 予定なし"];

    const messageBody = {
      embeds: [
        {
          title: `Schedule: ${nextTuesday.toLocaleDateString()} - ${sixDaysLater.toLocaleDateString()}`,
          description: `一週間の予定です！\n${eventList.join("\n")}`,
          color: parseInt("ffd700", 16),
        },
      ],
    };

    return await fetch(new URL(process.env.DISCORD_WEBHOOK_URL ?? ""), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageBody),
    })
      .then((res) => {
        if (res.ok) {
          return context.json({ message: "Success" });
        } else {
          context.status(res.status as StatusCode);
          return context.json({ message: res.statusText });
        }
      })
      .catch((error) => {
        console.error(error);
        context.status(StatusCodes.INTERNAL_SERVER_ERROR);
        return context.json({ message: ReasonPhrases.INTERNAL_SERVER_ERROR });
      });
  } catch (error) {
    if (context) {
      if (error instanceof Error) {
        context.status(StatusCodes.UNAUTHORIZED);
        return context.json({ message: error.message });
      } else {
        console.error(error);
        context.status(StatusCodes.INTERNAL_SERVER_ERROR);
        return context.json({ message: ReasonPhrases.INTERNAL_SERVER_ERROR });
      }
    } else {
      throw error;
    }
  }
});
