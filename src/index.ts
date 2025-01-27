import { cron } from "@elysiajs/cron";
import { treaty } from "@elysiajs/eden";
import { swagger } from "@elysiajs/swagger";
import { logger } from "@tqman/nice-logger";
import { Elysia, type Context } from "elysia";
import { google } from "googleapis";
import { ReasonPhrases, StatusCodes } from "http-status-codes";

const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
});
const scopes = ["https://www.googleapis.com/auth/calendar.readonly"];

/**
 * OAuth2 client's Refresh Token
 *
 * Only get a refresh_token in the response on the first authorisation
 * @link https://github.com/googleapis/google-api-nodejs-client/issues/750#issuecomment-304521450
 */
let refreshToken = await loadRefreshToken();

oauth2Client.on("tokens", (tokens) => {
  if (tokens.expiry_date) {
    console.log(
      ` ➜ Update tokens: Expires at ${new Date(
        tokens.expiry_date
      ).toLocaleString("ja-JP")}`
    );
  } else {
    console.warn(" ➜ Update tokens: Missing expiry_date");
  }
  oauth2Client.setCredentials({ ...tokens, refresh_token: refreshToken });
});

function saveRefreshToken(refreshToken: string) {
  Bun.write("refresh_token", refreshToken);
}

async function loadRefreshToken() {
  try {
    const file = Bun.file("refresh_token");
    return await file.text();
  } catch (error) {
    return "";
  }
}

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
    refreshToken = tokens.refresh_token;
    saveRefreshToken(tokens.refresh_token);
  }
  oauth2Client.setCredentials({ ...tokens, refresh_token: refreshToken });

  const expired = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
  return {
    message: "Authenticated!",
    expired: expired?.toLocaleString(),
    refreshTokenExists: !!refreshToken,
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
          ReasonPhrases.INTERNAL_SERVER_ERROR
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
    console.log({
      event: event,
      start: event.start?.dateTime,
      end: event.end?.dateTime,
    });

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
          ReasonPhrases.INTERNAL_SERVER_ERROR
        );
      });

    return res;
  } catch (e) {
    context.set.status = StatusCodes.FAILED_DEPENDENCY;
    return context.error(
      StatusCodes.FAILED_DEPENDENCY,
      "Event loading failed. Please check the authentication."
    );
  }
}

async function getWeek(context?: Context) {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const nextTuesday = new Date();
  nextTuesday.setDate(
    nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7)
  );
  nextTuesday.setHours(0, 0, 0, 0);
  const sixDaysLater = new Date(
    nextTuesday.getTime() + 6 * 24 * 60 * 60 * 1000
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
          ReasonPhrases.INTERNAL_SERVER_ERROR
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
      nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7)
    );
    nextTuesday.setHours(0, 0, 0, 0);
    const sixDaysLater = new Date(
      nextTuesday.getTime() + 6 * 24 * 60 * 60 * 1000
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
          description: `今週の予定です！\n${eventList.join("\n")}`,
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
          ReasonPhrases.INTERNAL_SERVER_ERROR
        );
      });

    return res;
  } catch (e) {
    context.set.status = StatusCodes.FAILED_DEPENDENCY;
    return context.error(
      StatusCodes.FAILED_DEPENDENCY,
      "Event loading failed. Please check the authentication."
    );
  }
}

const app = new Elysia()
  .use(logger({ withBanner: true }))
  .use(swagger({ path: "/docs" }))
  .get("/", (context) => context.redirect("/docs"), { detail: { hide: true } })
  .get("/auth", getAuth, {
    detail: {
      description:
        "Revoke the permissions: https://myaccount.google.com/permissions",
    },
  })
  .get("/oauth2callback", (context) => getOauth2callback(context))
  .get("/today", getToday)
  .post("/today", postToday)
  .get("/week", getWeek)
  .post("/week", postWeek)
  .listen(process.env.API_PORT ?? 3000);

const api = treaty<typeof app>(process.env.API_URL ?? "");

new Elysia().use(
  cron({
    name: "reminder-event",
    pattern: "0 0 * * *",
    timezone: "Asia/Tokyo",
    async run() {
      console.log(new Date(), "Cron job started");
      await api.today.post();
      console.log(new Date(), "Cron job finished");
    },
  })
);
