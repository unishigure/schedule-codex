import { staticPlugin } from "@elysiajs/static";
import { swagger } from "@elysiajs/swagger";
import { logger } from "@tqman/nice-logger";
import { Elysia, type Context } from "elysia";
import { google } from "googleapis";
import { ReasonPhrases, StatusCodes } from "http-status-codes";
import { loadRefreshToken, saveRefreshToken } from "./s3";

const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  credentials: {
    refresh_token: await loadRefreshToken(),
  },
});
const scopes = ["https://www.googleapis.com/auth/calendar.readonly"];

oauth2Client.on("tokens", async (tokens) => {
  if (tokens.expiry_date) {
    console.log(
      ` ➜ Update tokens: Expires at ${new Date(
        tokens.expiry_date,
      ).toLocaleString("ja-JP")}`,
    );
  } else {
    console.warn(" ➜ Update tokens: Missing expiry_date");
  }
  oauth2Client.setCredentials({
    ...tokens,
    refresh_token: await loadRefreshToken(),
  });
});

async function getAuth() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });

  if (oauth2Client.credentials.access_token) {
    await oauth2Client
      .revokeCredentials()
      .then(() => {
        console.log(" ➜ Revoked the credentials");
      })
      .catch(() => {
        console.warn(" ➜ Failed to revoke the credentials");
      });
  }

  return {
    message: "Authorize this app by visiting this URL",
    authUrl,
  };
}

async function getOauth2callback(context: Context) {
  if (!context.query.code) {
    context.set.status = StatusCodes.BAD_REQUEST;
    return context.error(StatusCodes.BAD_REQUEST, "No code provided");
  }

  const { tokens } = await oauth2Client.getToken(context.query.code);

  if (tokens.refresh_token) {
    await saveRefreshToken(tokens.refresh_token);
  }
  oauth2Client.setCredentials({
    ...tokens,
    refresh_token: await loadRefreshToken(),
  });

  const expired = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
  return {
    message: "Authenticated!",
    expired: expired?.toLocaleString(),
  };
}

async function getToday(context?: Context) {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: today.toISOString(),
      timeMax: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    return events.data.items;
  } catch (error) {
    if (context) {
      if (error instanceof Error) {
        context.set.status = StatusCodes.UNAUTHORIZED;
        return context.error(StatusCodes.UNAUTHORIZED, error.message);
      } else {
        console.error(error);
        context.set.status = StatusCodes.INTERNAL_SERVER_ERROR;
        return context.error(
          StatusCodes.INTERNAL_SERVER_ERROR,
          ReasonPhrases.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      throw error;
    }
  }
}

async function postToday(context: Context) {
  try {
    const events = await getToday();
    if (!Array.isArray(events) || events.length === 0) {
      return { message: "No events found" };
    }

    const event = events[0];

    if (events.length > 1) {
      console.warn("Multiple events found. Only the first one is posted.");
    }

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

    const res = await fetch(new URL(process.env.DISCORD_WEBHOOK_URL ?? ""), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
    })
      .then((res) => {
        if (res.ok) {
          return { message: "Success" };
        } else {
          context.set.status = res.status;
          return context.error(res.status, res.statusText);
        }
      })
      .catch((error) => {
        console.error(error);
        context.set.status = StatusCodes.INTERNAL_SERVER_ERROR;
        return context.error(
          StatusCodes.INTERNAL_SERVER_ERROR,
          ReasonPhrases.INTERNAL_SERVER_ERROR,
        );
      });

    return res;
  } catch (e) {
    context.set.status = StatusCodes.FAILED_DEPENDENCY;
    return context.error(
      StatusCodes.FAILED_DEPENDENCY,
      "Event loading failed. Please check the authentication.",
    );
  }
}

async function getWeek(context?: Context) {
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

  try {
    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: nextTuesday.toISOString(),
      timeMax: sixDaysLater.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    return events.data.items;
  } catch (error) {
    if (context) {
      if (error instanceof Error) {
        context.set.status = StatusCodes.UNAUTHORIZED;
        return context.error(StatusCodes.UNAUTHORIZED, error.message);
      } else {
        console.error(error);
        context.set.status = StatusCodes.INTERNAL_SERVER_ERROR;
        return context.error(
          StatusCodes.INTERNAL_SERVER_ERROR,
          ReasonPhrases.INTERNAL_SERVER_ERROR,
        );
      }
    } else {
      throw error;
    }
  }
}

async function postWeek(context: Context) {
  try {
    const events = await getWeek();
    if (!Array.isArray(events)) {
      return { message: "No events found" };
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

    const res = await fetch(new URL(process.env.DISCORD_WEBHOOK_URL ?? ""), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messageBody),
    })
      .then((res) => {
        if (res.ok) {
          return { message: "Success" };
        } else {
          context.set.status = res.status;
          return context.error(res.status, res.statusText);
        }
      })
      .catch((error) => {
        console.error(error);
        context.set.status = StatusCodes.INTERNAL_SERVER_ERROR;
        return context.error(
          StatusCodes.INTERNAL_SERVER_ERROR,
          ReasonPhrases.INTERNAL_SERVER_ERROR,
        );
      });

    return res;
  } catch (e) {
    context.set.status = StatusCodes.FAILED_DEPENDENCY;
    return context.error(
      StatusCodes.FAILED_DEPENDENCY,
      "Event loading failed. Please check the authentication.",
    );
  }
}

async function getHealth(context: Context) {
  return await getToday()
    .then(() => {
      console.log(" ➜ Health check passed");
      return { status: "ok" };
    })
    .catch((error) => {
      console.error(" ➜ Health check failed");
      console.error(error);
      context.set.status = StatusCodes.INTERNAL_SERVER_ERROR;
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : ReasonPhrases.INTERNAL_SERVER_ERROR,
      };
    });
}

export const app = new Elysia()
  .use(logger({ withBanner: true }))
  .use(staticPlugin())
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Schedule Codex",
          version: "1.0.0",
          description: "A simple API to remind your calendar events",
        },
      },
      scalarConfig: {
        favicon: "/public/favicon.svg",
        defaultOpenAllTags: true,
      },
    }),
  )
  .get("/", (context) => context.redirect("/docs"), { detail: { hide: true } })
  .get("/auth", getAuth, {
    tags: ["auth"],
    detail: {
      description:
        "Revoke the permissions: https://myaccount.google.com/permissions",
    },
  })
  .get("/oauth2callback", (context) => getOauth2callback(context), {
    tags: ["auth"],
    detail: { hide: true },
  })
  .get("/today", getToday, { tags: ["reminder"] })
  .post("/today", postToday, { tags: ["reminder"] })
  .get("/week", getWeek, { tags: ["reminder"] })
  .post("/week", postWeek, { tags: ["reminder"] })
  .get("/health", getHealth, { tags: ["management"] })
  .listen(process.env.API_PORT ?? 3000);
