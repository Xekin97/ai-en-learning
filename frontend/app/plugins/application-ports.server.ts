import { appendResponseHeader, getRequestHeader } from "h3";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { serverTransport } from "@infrastructure/http/transports/transport";
import { TokenVault } from "@runtime/session/token-vault";

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const event = useRequestEvent();
  if (!event) throw new Error("SSR application port requires a request event");
  const vault = new TokenVault();
  const transport = serverTransport({
    origin: config.backendInternalOrigin,
    cookie: getRequestHeader(event, "cookie"),
    acceptLanguage: getRequestHeader(event, "accept-language"),
    requestId: getRequestHeader(event, "x-request-id"),
    onSetCookie(value) {
      appendResponseHeader(event, "set-cookie", value);
    },
  });
  return {
    provide: {
      tokenVault: vault,
      api: createApiRepository(transport, vault, false),
    },
  };
});
