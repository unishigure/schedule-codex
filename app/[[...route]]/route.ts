import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { openAPISpecs } from "hono-openapi";
import { logger } from "hono/logger";
import { handle } from "hono/vercel";
import {
  getAuthHandler,
  getAuthRoute,
  getOauth2CallbackHandler,
  getOauth2CallbackQuery,
  getOauth2CallbackRoute,
} from "./handler/auth";
import { getHealthHandler, getHealthRoute } from "./handler/health";
import {
  getTodayHandler,
  getTodayRoute,
  postTodayHandler,
  postTodayRoute,
} from "./handler/remind/today";
import {
  getWeekHandler,
  getWeekRoute,
  postWeekHandler,
  postWeekRoute,
} from "./handler/remind/week";
import { validator } from "hono-openapi/zod";

const app = new Hono();

/* --- OpenAPI specs --- */
app
  .get(
    "/openapi",
    openAPISpecs(app, {
      documentation: {
        info: {
          title: "Schedule Codex",
          version: "1.0.0",
          description: "A simple API to remind your calendar events",
        },
      },
    })
  )
  .get(
    "/docs",
    apiReference({
      pageTitle: "Schedule Codex",
      spec: { url: "/openapi" },
      favicon: "/favicon.svg",
      theme: "deepSpace",
      defaultOpenAllTags: true,
    })
  );

/* --- Routes --- */
app
  .use(logger())
  .get("/", (context) => context.redirect("/docs"))
  .get("/auth", getAuthRoute, ...getAuthHandler)
  .get(
    "/oauth2callback",
    getOauth2CallbackRoute,
    validator("query", getOauth2CallbackQuery),
    ...getOauth2CallbackHandler
  )
  .get("/today", getTodayRoute, ...getTodayHandler)
  .post("/today", postTodayRoute, ...postTodayHandler)
  .get("/week", getWeekRoute, ...getWeekHandler)
  .post("/week", postWeekRoute, ...postWeekHandler)
  .get("/health", getHealthRoute, ...getHealthHandler);

export const GET = handle(app);
export const POST = handle(app);
