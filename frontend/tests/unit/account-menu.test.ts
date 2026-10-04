import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import AppHeader from "@presentation/components/AppHeader.vue";

let wrapper: VueWrapper;
let route: { path: string; fullPath: string };
let content: HTMLElement;
const link = (path = "/account") =>
  wrapper.get(`.account-popover a[href="${path}"]`);
const menu = () => wrapper.get("details").element as HTMLDetailsElement;
const summary = () => wrapper.get("summary").element as HTMLElement;
const heading = () => content.querySelector("h1")!;
async function settle() {
  await nextTick();
  await nextTick();
}

beforeEach(() => {
  route = reactive({ path: "/", fullPath: "/" });
  for (const [name, fn] of Object.entries({
    computed,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
    nextTick,
  }))
    vi.stubGlobal(name, fn);
  vi.stubGlobal("useSessionStore", () => ({
    actor: ref({ kind: "account", username: "learner" }),
    isAdmin: ref(false),
  }));
  vi.stubGlobal("useAccountStore", () => ({ state: ref({ account: null }) }));
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useDesignCopy", () => ({ copy: (key: string) => key }));
  vi.stubGlobal("useApplicationLocale", () => ({
    locale: ref("en-US"),
    change: vi.fn(),
  }));
  wrapper = mount(AppHeader, {
    attachTo: document.body,
    global: {
      stubs: {
        AppIcon: true,
        BrandMark: true,
        NuxtLink: defineComponent({
          props: { to: String },
          setup:
            (props, { slots }) =>
            () =>
              h("a", { href: props.to }, slots.default?.()),
        }),
      },
    },
  });
  content = document.createElement("section");
  content.className = "account-content";
  content.innerHTML = "<h1>Personal information</h1><button>Outside</button>";
  document.body.append(content);
});
afterEach(() => {
  wrapper.unmount();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("shared account menu interactions", () => {
  it("keeps internal focus open and closes on outside click or focus without stealing it", async () => {
    menu().open = true;
    (link().element as HTMLElement).focus();
    expect(menu().open).toBe(true);
    content.querySelector("button")!.focus();
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(content.querySelector("button"));
    menu().open = true;
    content.click();
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(content.querySelector("button"));
  });

  it("closes Escape from a menu link and restores the avatar trigger", async () => {
    menu().open = true;
    (link().element as HTMLElement).focus();
    await link().trigger("keydown", { key: "Escape" });
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(summary());
  });

  it("waits for the selected page before focusing its new heading", async () => {
    menu().open = true;
    await link().trigger("click", { button: 0 });
    expect(document.activeElement).not.toBe(heading());
    expect(menu().open).toBe(false);
    content.innerHTML = "<h1>Loaded personal information</h1>";
    Object.assign(route, { path: "/account", fullPath: "/account" });
    await settle();
    expect(document.activeElement).toBe(heading());
    expect(heading().tabIndex).toBe(-1);
  });

  it("focuses the current section when its link is selected again", async () => {
    Object.assign(route, { path: "/account", fullPath: "/account" });
    await settle();
    menu().open = true;
    await link().trigger("click", { button: 0 });
    await settle();
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(heading());
  });

  it.each(["ctrlKey", "metaKey"])(
    "preserves %s link activation without moving current-page focus",
    async (modifier) => {
      menu().open = true;
      (link().element as HTMLElement).focus();
      await link().trigger("click", { button: 0, [modifier]: true });
      await settle();
      expect(menu().open).toBe(true);
      expect(document.activeElement).toBe(link().element);
      Object.assign(route, { path: "/account", fullPath: "/account" });
      await settle();
      expect(document.activeElement).not.toBe(heading());
    },
  );

  it("discards pending focus if another route wins the navigation", async () => {
    menu().open = true;
    await link().trigger("click", { button: 0 });
    Object.assign(route, { path: "/library", fullPath: "/library" });
    await settle();
    Object.assign(route, { path: "/account", fullPath: "/account" });
    await settle();
    expect(document.activeElement).not.toBe(heading());
  });
});
