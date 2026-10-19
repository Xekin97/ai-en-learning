import type { ApiPort } from "@application/shared/ports";
import type { TokenVault } from "@runtime/session/token-vault";
import type { PronunciationCoordinator } from "@application/pronunciation/coordinator";

declare module "#app" {
  interface NuxtApp {
    $api: ApiPort;
    $tokenVault: TokenVault;
    $pronunciation?: PronunciationCoordinator;
  }
}

declare module "vue" {
  interface ComponentCustomProperties {
    $api: ApiPort;
    $pronunciation?: PronunciationCoordinator;
  }
}

export {};
