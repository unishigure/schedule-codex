import { describeRoute } from "hono-openapi";
import { resolver } from "hono-openapi/zod";
import { createFactory } from "hono/factory";
import { ReasonPhrases } from "http-status-codes";
import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";
import { getToday } from "./remind/today";

extendZodWithOpenApi(z);
const factory = createFactory();

/* --- GET /health --- */

export const getHealthResponse = z.object({
  status: z.string().describe("The health status").openapi({ example: "OK" }),
  message: z.string().optional().describe("The error message"),
});

export const getHealthRoute = describeRoute({
  description: "Health check",
  tags: ["health"],
  responses: {
    200: {
      description: "The health status",
      content: { "application/json": { schema: resolver(getHealthResponse) } },
    },
  },
});

export const getHealthHandler = factory.createHandlers(async (context) => {
  return await getToday()
    .then(() => {
      console.log(" ➜ Health check passed");
      return context.json({ status: "OK" });
    })
    .catch((error) => {
      console.error(" ➜ Health check failed");
      console.error(error);
      return context.json({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : ReasonPhrases.INTERNAL_SERVER_ERROR,
      });
    });
});
