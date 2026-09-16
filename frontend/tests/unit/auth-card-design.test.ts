import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, reactive, ref } from "vue";
import LoginPage from "../../app/pages/login.vue";
import RegisterPage from "../../app/pages/register.vue";
import en from "../../i18n/locales/en-US.json";
import zh from "../../i18n/locales/zh-CN.json";

const wrappers: VueWrapper[] = [];
const route = reactive<{ query: Record<string, unknown> }>({ query: {} });
const locale = ref<"en-US" | "zh-CN">("en-US");
const claim = ref(false);
const sessionState = ref<{ failure: object | null }>({ failure: null });

function translate(key: string): string {
  const messages = locale.value === "en-US" ? en : zh;
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)[part],
      messages,
    );
  if (typeof value !== "string") throw new Error("Missing copy: " + key);
  return value;
}
beforeEach(() => {
  route.query = {};
  locale.value = "en-US";
  claim.value = false;
  sessionState.value = { failure: null };
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("definePageMeta", vi.fn());
  vi.stubGlobal("useLocalizedHead", vi.fn());
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useI18n", () => ({ t: translate }));
  vi.stubGlobal("useApplicationLocale", () => ({
    locale,
    initialize: vi.fn(),
  }));
  vi.stubGlobal("useSessionStore", () => ({
    state: sessionState,
    hasVisitorClaim: () => claim.value,
  }));
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

for (const [name, component] of [
  ["login", LoginPage],
  ["register", RegisterPage],
] as const) {
  const render = () => {
    const wrapper = mount(component, {
      global: {
        mocks: { $t: translate },
        stubs: {
          NuxtLink: { template: "<a><slot /></a>" },
          AppIcon: true,
          AppError: {
            props: ["failure"],
            template:
              '<div v-if="failure" class="app-error" role="alert">Error</div>',
          },
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  };
  describe("CR037 " + name + " card order", () => {
    it.each(["en-US", "zh-CN"] as const)(
      "places a live status before the title for each safe target in %s",
      async (language) => {
        locale.value = language;
        const targets = [
          ["/review", "review"],
          ["/library", "library"],
          ["/library/batch-example", "story"],
          ["/account", "account"],
        ] as const;
        for (const [path, target] of targets) {
          route.query = { redirect: path };
          const wrapper = render();
          const card = wrapper.get(".auth-card");
          const hint = card.get(".auth-intent");
          expect(hint.text()).toBe(translate("auth.continue." + target));
          expect(hint.attributes("role")).toBe("status");
          expect(card.element.firstElementChild).toBe(hint.element);
          expect(hint.element.nextElementSibling?.tagName).toBe("H2");
          await wrapper.vm.$nextTick();
        }
      },
    );
    it.each([
      undefined,
      "//outside.test",
      "https://outside.test",
      "/admin/users",
      ["/review", "/account"],
    ])("omits a hint for an absent or unsafe target: %j", (redirect) => {
      route.query = { redirect };
      expect(render().find(".auth-intent").exists()).toBe(false);
    });
    it("gives a valid visitor claim its own leading notice", () => {
      route.query = { redirect: "/review", claim: "1" };
      claim.value = true;
      const wrapper = render();
      expect(wrapper.find(".auth-intent").exists()).toBe(false);
      expect(wrapper.get(".auth-card").element.firstElementChild).toBe(
        wrapper.get(".notice-warning").element,
      );
    });
    it("does not let a stale claim suppress a safe return hint", () => {
      route.query = { redirect: "/review", claim: "1" };
      const wrapper = render();
      expect(wrapper.find(".notice-warning").exists()).toBe(false);
      expect(wrapper.get(".auth-card").element.firstElementChild).toBe(
        wrapper.get(".auth-intent").element,
      );
    });
    it("keeps the hint first while language, target and error change", async () => {
      route.query = { redirect: "/review" };
      const wrapper = render();
      locale.value = "zh-CN";
      route.query = { redirect: "/account" };
      sessionState.value.failure = { kind: "invalid_credentials" };
      await wrapper.vm.$nextTick();
      expect(wrapper.get(".auth-intent").text()).toBe(zh.auth.continue.account);
      expect(wrapper.get(".auth-card").element.firstElementChild).toBe(
        wrapper.get(".auth-intent").element,
      );
      expect(wrapper.get(".app-error").attributes("role")).toBe("alert");
    });
  });
}

describe("CR037 approved account copy", () => {
  it.each([
    [
      en,
      [
        "Change password",
        "Current password",
        "Confirm it’s you",
        "New password",
        "8–128 characters",
        "Confirm new password",
        "Enter the same password again",
        "Your current session will stay open. Other sessions will be signed out.",
        "Cancel",
        "Update password",
      ],
    ],
    [
      zh,
      [
        "修改密码",
        "当前密码",
        "用于确认是账号本人",
        "新密码",
        "8–128 个字符",
        "确认新密码",
        "再次输入相同密码",
        "修改成功后保留当前会话，其他已有会话全部退出。",
        "取消",
        "确认修改",
      ],
    ],
  ] as const)(
    "keeps all password labels and shared identity helper aligned",
    (messages, expected) => {
      expect([
        messages.account.password,
        messages.auth.currentPassword,
        messages.account.confirmPasswordCopy,
        messages.auth.newPassword,
        messages.account.newPasswordCopy,
        messages.account.confirmNewPassword,
        messages.auth.confirmationHelper,
        messages.account.otherSessions,
        messages.common.cancel,
        messages.account.confirmChange,
      ]).toEqual(expected);
    },
  );
});
