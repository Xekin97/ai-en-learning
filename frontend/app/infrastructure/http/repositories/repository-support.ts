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
  if (!parsed.success) return contractFailure();
  if (parsed.data.code === "generation_busy") {
    const context = parsed.data.context;
    const retry = context?.retry_after_seconds;
    const keys = context ? Object.keys(context).sort().join(",") : "";
    if (
      response.status !== 503 ||
      parsed.data.status !== 503 ||
      keys !== "accepted,retry_after_seconds" ||
      context?.accepted !== false ||
      !Number.isInteger(retry) ||
      (retry as number) < 1 ||
      (retry as number) > 600 ||
      response.headers.get("retry-after") !== String(retry)
    )
      return contractFailure();
  }
  if (parsed.data.code === "generation_unavailable" && parsed.data.context) {
    const context = parsed.data.context;
    if (
      response.status !== 503 ||
      parsed.data.status !== 503 ||
      Object.keys(context).join(",") !== "accepted" ||
      context.accepted !== false
    )
      return contractFailure();
  }
  if (parsed.data.code === "revision_conflict") {
    const context = parsed.data.context;
    if (
      parsed.data.status !== 409 ||
      Object.keys(context ?? {}).join(",") !== "current_revision" ||
      typeof context?.current_revision !== "string" ||
      !context.current_revision
    )
      return contractFailure();
  }
  if (parsed.data.code === "model_request_rejected") {
    const context = parsed.data.context;
    if (
      parsed.data.status !== 422 ||
      Object.keys(context ?? {}).join(",") !== "upstream_status" ||
      (context?.upstream_status !== 400 && context?.upstream_status !== 422)
    )
      return contractFailure();
  }
  if (
    parsed.data.code === "request_too_large" &&
    (response.status !== 413 || parsed.data.status !== 413)
  )
    return contractFailure();
  return mapProblemDto(parsed.data);
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
