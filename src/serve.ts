import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { google } from "googleapis";

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
  console.log("Update tokens", tokens);
  oauth2Client.setCredentials({ ...tokens, refresh_token: refreshToken });

  if (tokens.expiry_date) {
    const expired = new Date(tokens.expiry_date);
    console.log("expires_in", expired.toLocaleString());
  }
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

function getAuth() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
  });

  if (oauth2Client.credentials.access_token) {
    const expired = oauth2Client.credentials.expiry_date
      ? new Date(oauth2Client.credentials.expiry_date)
      : null;
    return {
      message: "Already authenticated!",
      expired: expired?.toLocaleString(),
      refreshTokenExists: !!refreshToken,
      authUrl,
    };
  } else {
    return {
      message: "Authorize this app by visiting this URL",
      authUrl,
    };
  }
}

async function getOauth2callback(code: string) {
  const { tokens } = await oauth2Client.getToken(code);

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

async function getToday() {
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
    console.error(error);
    if (error instanceof Error) {
      return { message: error.message, error };
    } else {
      return { error };
    }
  }
}

async function postToday() {
  const events = await getToday();
  if (!Array.isArray(events)) {
    return;
  }

  events.forEach(async (event) => {
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

async function getWeek() {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: today.toISOString(),
      timeMax: nextWeek.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: "startTime",
    });

    return events.data.items;
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return { message: error.message, error };
    } else {
      return { error };
    }
  }
}

async function postWeek() {
  const events = await getWeek();
  if (!Array.isArray(events)) {
    return;
  }

  const today = new Date();
  const sixDaysLater = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000);

  const eventList = events.map((event) => {
    const start = new Date(event.start?.dateTime ?? "").getTime() / 1000;
    return `- <t:${start}:F>`;
  });

  const messageBody = {
    embeds: [
      {
        title: `Schedule: ${today.toLocaleDateString()} - ${sixDaysLater.toLocaleDateString()}`,
        description: `今週の予定です！\n${eventList.join("\n")}`,
        color: parseInt("ffd700", 16),
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
}

const app = new Elysia()
  .use(swagger({ path: "/docs" }))
  .get("/auth", getAuth, {
    detail: {
      description:
        "Revoke the permissions: https://myaccount.google.com/permissions",
    },
  })
  .get("/oauth2callback", async (req) => {
    const code = req.query.code ?? "";
    return await getOauth2callback(code);
  })
  .get("/today", getToday)
  .post("/today", postToday)
  .get("/week", getWeek)
  .post("/week", postWeek)
  .listen(process.env.API_PORT ?? 3000);
export type App = typeof app;
