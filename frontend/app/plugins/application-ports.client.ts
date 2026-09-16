import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { browserTransport } from "@infrastructure/http/transports/transport";
import { TokenVault } from "@runtime/session/token-vault";

export default defineNuxtPlugin(() => {
  const vault = new TokenVault();
  return {
    provide: {
      tokenVault: vault,
      api: createApiRepository(browserTransport(), vault, true),
    },
  };
});
