import type { LearnerReturnIntent } from "@application/auth/return-intent";
export type Translate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string;
export function presentAuthGate(intent: LearnerReturnIntent, t: Translate) {
  return {
    eyebrow: t("auth.gateEyebrow"),
    title: t(`auth.targets.${intent.target}`),
    description: t(`auth.descriptions.${intent.target}`),
    loginLabel: t("auth.gateLogin"),
    registerLabel: t("auth.gateRegister"),
    loginTo: { path: "/login", query: { redirect: intent.href } },
    registerTo: { path: "/register", query: { redirect: intent.href } },
  };
}
export type AuthGateViewModel = ReturnType<typeof presentAuthGate>;
