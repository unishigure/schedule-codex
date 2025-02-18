import { google } from "googleapis";
import { loadRefreshToken } from "./s3";

export const oauth2Client = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_REDIRECT_URI,
  credentials: { refresh_token: await loadRefreshToken() },
});

export const scopes = ["https://www.googleapis.com/auth/calendar.readonly"];

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
