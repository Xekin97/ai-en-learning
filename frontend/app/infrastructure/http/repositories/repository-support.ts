import type { z } from "zod";
import type { RawHttpTransport } from "../transports/transport";
import { problemSchema } from "../schemas/common";
import { mapProblemDto } from "../mappers/problem-mapper";
export async function json<T extends z.ZodType>(
  transport: RawHttpTransport,
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await transport.send(path, init);
  if (!response.ok) throw await problemFromResponse(response);
  if (!response.headers.get("content-type")?.startsWith("application/json"))
    throw contractFailure();
  return schema.parse(await response.json());
}

export async function noContent(
  transport: RawHttpTransport,
  path: string,
  init: RequestInit,
): Promise<void> {
  const response = await transport.send(path, init);
  if (!response.ok) throw await problemFromResponse(response);
  if (response.status !== 204 || (await response.text()).length !== 0)
    throw contractFailure();
}

export async function problemFromResponse(response: Response) {
  if (
    !response.headers
      .get("content-type")
      ?.startsWith("application/problem+json")
  )
    return contractFailure();
  const parsed = problemSchema.safeParse(await response.json());
  return parsed.success ? mapProblemDto(parsed.data) : contractFailure();
}

export function contractFailure() {
  return {
    kind: "contract_violation",
    code: "contract_violation",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  } as const;
}
