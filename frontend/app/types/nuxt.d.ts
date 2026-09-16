import type { ApiPort } from "@application/shared/ports";
import type { TokenVault } from "@runtime/session/token-vault";

declare module "#app" {
  interface NuxtApp {
    $api: ApiPort;
    $tokenVault: TokenVault;
  }
}

declare module "vue" {
  interface ComponentCustomProperties {
    $api: ApiPort;
  }
}

export {};
