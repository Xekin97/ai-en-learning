import type {
  ConfigPortabilityPort,
  PortabilityFailure,
} from "@application/admin/config-portability";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import { problemSchema } from "../schemas/common";
import {
  portabilityCurrentEnvelopeSchema,
  portabilityPreviewEnvelopeSchema,
  portabilityResultEnvelopeSchema,
} from "../schemas/config-portability";
import {
  mapPortabilityCurrent,
  mapPortabilityPreview,
  mapPortabilityResult,
} from "../mappers/config-portability-mapper";
import { contractFailure } from "./repository-support";

const base = "/api/v1/admin/config-portability";
const safeFilename =
  /^wordweave-(models|plans|items|growth)-\d{8}T\d{6}Z(?:\.wwcfg)?\.json$/;

function command(
  vault: TokenVault,
  body: unknown,
  signal?: AbortSignal,
): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": vault.csrf(),
    },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

async function portabilityProblem(
  response: Response,
): Promise<PortabilityFailure | ReturnType<typeof contractFailure>> {
  if (
    !response.headers
      .get("content-type")
      ?.startsWith("application/problem+json")
  )
    return contractFailure();
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return contractFailure();
  }
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status !== response.status)
    return contractFailure();
  const context = parsed.data.context ?? {};
  const allowedContext = new Set([
    "category",
    "items",
    "errors_truncated",
    "operation_id",
    "outcome",
  ]);
  if (Object.keys(context).some((key) => !allowedContext.has(key)))
    return contractFailure();
  const itemsRaw = context.items;
  if (itemsRaw !== undefined && !Array.isArray(itemsRaw))
    return contractFailure();
  const items: PortabilityFailure["items"] = [];
  for (const entry of (itemsRaw as unknown[] | undefined) ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      return contractFailure();
    const item = entry as Record<string, unknown>;
    if (
      Object.keys(item).some(
        (key) => !["identity", "label", "field", "code"].includes(key),
      ) ||
      typeof item.code !== "string"
    )
      return contractFailure();
    for (const key of ["identity", "label", "field"])
      if (
        item[key] !== undefined &&
        item[key] !== null &&
        typeof item[key] !== "string"
      )
        return contractFailure();
    items.push({
      identity: (item.identity as string | null | undefined) ?? null,
      label: (item.label as string | null | undefined) ?? null,
      field: (item.field as string | null | undefined) ?? null,
      code: item.code,
    });
  }
  const retryRaw = response.headers.get("retry-after");
  const retryAfterSeconds =
    retryRaw && /^\d+$/.test(retryRaw) ? Number(retryRaw) : null;
  if (
    retryAfterSeconds !== null &&
    (retryAfterSeconds < 1 || retryAfterSeconds > 600)
  )
    return contractFailure();
  const outcome = context.outcome === "unknown" ? "unknown" : null;
  if (context.outcome !== undefined && outcome === null)
    return contractFailure();
  return {
    kind: "portability_failure",
    code: parsed.data.code,
    status: response.status,
    requestId: parsed.data.request_id,
    fieldIssues: (parsed.data.field_errors ?? []).map((item) => ({ ...item })),
    items,
    errorsTruncated: context.errors_truncated === true,
    outcome,
    retryAfterSeconds,
  };
}

async function envelope<T>(
  response: Response,
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
): Promise<T> {
  if (!response.ok) throw await portabilityProblem(response);
  if (!response.headers.get("content-type")?.startsWith("application/json"))
    throw contractFailure();
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw contractFailure();
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw contractFailure();
  return parsed.data;
}

export function createConfigPortabilityRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): ConfigPortabilityPort {
  return {
    async exportConfiguration(input) {
      const body: Record<string, unknown> = {
        include_credentials: input.includeCredentials,
      };
      if (input.includeCredentials) {
        body.passphrase = input.passphrase;
        body.passphrase_confirmation = input.passphraseConfirmation;
      }
      const response = await transport.send(
        `${base}/${input.category}/exports`,
        command(vault, body, input.signal),
      );
      if (!response.ok) throw await portabilityProblem(response);
      if (response.headers.get("content-type") !== "application/json")
        throw contractFailure();
      const match = (response.headers.get("content-disposition") ?? "").match(
        /^attachment; filename="([^"]+)"$/,
      );
      if (!match?.[1] || !safeFilename.test(match[1])) throw contractFailure();
      return { blob: await response.blob(), safeFilename: match[1] };
    },
    async previewConfiguration(input) {
      const body: Record<string, unknown> = { file_base64: input.fileBase64 };
      if (input.passphrase !== undefined) body.passphrase = input.passphrase;
      const result = await envelope(
        await transport.send(
          `${base}/${input.category}/previews`,
          command(vault, body, input.signal),
        ),
        portabilityPreviewEnvelopeSchema,
      );
      return mapPortabilityPreview(result.data);
    },
    async importConfiguration(input) {
      const body: Record<string, unknown> = {
        file_base64: input.fileBase64,
        preview_token: input.previewToken,
        operation_id: input.operationId,
        confirmed: true,
      };
      if (input.passphrase !== undefined) body.passphrase = input.passphrase;
      const result = await envelope(
        await transport.send(
          `${base}/${input.category}/imports`,
          command(vault, body, input.signal),
        ),
        portabilityResultEnvelopeSchema,
      );
      return mapPortabilityResult(result.data);
    },
    async resolveConfigurationOperation(input) {
      const response = await transport.send(
        `${base}/${input.category}/operations/${encodeURIComponent(input.operationId)}/resolve`,
        command(vault, { preview_token: input.previewToken }, input.signal),
      );
      return mapPortabilityResult(
        (await envelope(response, portabilityResultEnvelopeSchema)).data,
      );
    },
    async getCurrentConfiguration(category, signal) {
      const response = await transport.send(
        `${base}/${category}/current`,
        signal ? { signal } : undefined,
      );
      return mapPortabilityCurrent(
        (await envelope(response, portabilityCurrentEnvelopeSchema)).data,
      );
    },
  };
}
