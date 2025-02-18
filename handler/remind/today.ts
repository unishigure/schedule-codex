import { google } from "googleapis";
import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { createFactory } from "hono/factory";
import type { StatusCode } from "hono/utils/http-status";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";
import { oauth2Client } from "../../../lib/googleapis";

extendZodWithOpenApi(z);
const factory = createFactory();

export async function getToday() {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const events = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: today.toISOString(),
    timeMax: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  });

  return events.data.items || [];
}

/* --- GET /today --- */

const getTodayResponse = z.array(
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

export const getTodayRoute = describeRoute({
  description: "Get today's events",
  tags: ["remind"],
  responses: {
    200: {
      description: "The events",
      content: { "application/json": { schema: resolver(getTodayResponse) } },
    },
  },
});

export const getTodayHandler = factory.createHandlers(async (context) => {
  return getToday()
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

/* --- POST /today --- */

const postTodayResponse = z.object({
  message: z
    .string()
    .openapi({ description: "The message", example: "Success" }),
});

export const postTodayRoute = describeRoute({
  description: "Post today's event to Discord",
  tags: ["remind"],
  responses: {
    200: {
      description: "The message",
      content: { "application/json": { schema: resolver(postTodayResponse) } },
    },
  },
});

export const postTodayHandler = factory.createHandlers(async (context) => {
  try {
    const events = await getToday();
    if (events.length === 0) {
      return context.json({ message: "No events found" });
    }

    if (events.length > 1) {
      console.warn("Multiple events found. Only the first one is posted.");
    }

    const event = events[0];

    const start = new Date(event.start?.dateTime ?? "").getTime() / 1000;
    const messageBody = {
      embeds: [
        {
          title: `Reminder: ${event.summary}`,
          description: `本日活動日です！\n<t:${start}:t>より`,
          timestamp: event.start?.dateTime,
          color: parseInt("ffd700", 16),
          image: { url: process.env.DISCORD_IMAGE_URL ?? "" },
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
    if (error instanceof Error) {
      context.status(StatusCodes.UNAUTHORIZED);
      return context.json({ message: error.message });
    } else {
      console.error(error);
      context.status(StatusCodes.INTERNAL_SERVER_ERROR);
      return context.json({ message: ReasonPhrases.INTERNAL_SERVER_ERROR });
    }
  }
});
