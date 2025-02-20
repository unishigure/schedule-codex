import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { createFactory } from "hono/factory";
import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";
import { oauth2Client, scopes } from "../lib/googleapis";
import { loadRefreshToken, saveRefreshToken } from "../lib/s3";

extendZodWithOpenApi(z);
const factory = createFactory();

/* --- GET /auth --- */

export const getAuthResponse = z.object({
  message: z
    .string()
    .openapi({ example: "Authorize this app by visiting this URL" }),
  url: z.string().url(),
});

export const getAuthRoute = describeRoute({
  description: "The OAuth2 authorization URL to get the authorization code",
  tags: ["auth"],
  responses: {
    200: {
      description: "The auth URL",
      content: { "application/json": { schema: resolver(getAuthResponse) } },
    },
  },
});

export const getAuthHandler = factory.createHandlers(async (context) => {
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

  return context.json({
    message: "Authorize this app by visiting this URL",
    url: authUrl,
  });
});

/* --- GET /oauth2callback --- */

export const getOauth2CallbackQuery = z.object({
  code: z.string().openapi({ description: "The authorization code" }),
});

export const getOauth2CallbackResponse = z.object({
  message: z.string().openapi({ example: "Successfully authorized" }),
  expired: z.string().openapi({ example: "2021-09-30T12:00:00Z" }),
});

export const getOauth2CallbackRoute = describeRoute({
  description: "The OAuth2 callback URL",
  tags: ["auth"],
  query: resolver(getOauth2CallbackQuery),
  responses: {
    200: {
      description: "The authorized response",
      content: {
        "application/json": { schema: resolver(getOauth2CallbackResponse) },
      },
    },
  },
  hide: true,
});

export const getOauth2CallbackHandler = factory.createHandlers(
  async (context) => {
    const { code } = getOauth2CallbackQuery.parse(context.req.query());
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.refresh_token) {
      await saveRefreshToken(tokens.refresh_token);
    }
    oauth2Client.setCredentials({
      ...tokens,
      refresh_token: await loadRefreshToken(),
    });

    const expired = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    return context.json({
      message: "Successfully authorized",
      expired: expired?.toISOString(),
    });
  },
);
