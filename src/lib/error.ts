import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

import consola from "consola"

export class HTTPError extends Error {
  response: Response

  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

export async function forwardError(c: Context, error: unknown) {
  consola.error("Error occurred:", error)

  if (error instanceof HTTPError) {
    try {
      const errorData = await error.response.clone().json()
      consola.error("HTTP error:", errorData)
      return c.json(
        {
          error: errorData,
        },
        error.response.status as ContentfulStatusCode,
      )
    } catch {
      // If JSON parsing fails, try to read as text
      const errorText = await error.response.clone().text()
      consola.error("HTTP error (text):", errorText)
      return c.json(
        {
          error: {
            message: errorText,
            type: "error",
          },
        },
        error.response.status as ContentfulStatusCode,
      )
    }
  }

  return c.json(
    {
      error: {
        message: (error as Error).message,
        type: "error",
      },
    },
    500,
  )
}
