<script setup lang="ts">
const session = useSessionStore();
const account = useAccountStore();
const route = useRoute();
const { copy } = useDesignCopy();
const dropdown = ref<HTMLDetailsElement | null>(null);
let pendingAccountPath: string | null = null;
const navigation = [
  { path: "/", key: "home" },
  { path: "/explore", key: "explore" },
  { path: "/create", key: "create" },
  { path: "/review", key: "range" },
  { path: "/library", key: "library" },
];
const accountLinks = [
  { path: "/account", key: "profile", icon: "user" },
  { path: "/account/growth", key: "growth", icon: "trophy" },
  { path: "/account/items", key: "bag", icon: "shopping-bag" },
  { path: "/account/exchange", key: "shop", icon: "store" },
] as const;
const name = computed(() =>
  session.actor.value?.kind === "account"
    ? (account.state.value.account?.displayName ?? session.actor.value.username)
    : "",
);
function active(path: string) {
  if (path === "/explore" && route.path.startsWith("/trial/")) return "page";
  return route.path === path ||
    (path !== "/" && route.path.startsWith(path + "/"))
    ? "page"
    : undefined;
}
function closeDropdown() {
  if (dropdown.value) dropdown.value.open = false;
}
function closeFromOutside(event: Event) {
  if (
    dropdown.value?.open &&
    event.target instanceof Node &&
    !dropdown.value.contains(event.target)
  ) {
    closeDropdown();
  }
}
function escapeDropdown(event: KeyboardEvent) {
  if (!dropdown.value?.open) return;
  event.preventDefault();
  event.stopPropagation();
  closeDropdown();
  dropdown.value.querySelector("summary")?.focus();
}
async function focusAccountHeading(path: string) {
  await nextTick();
  if (!dropdown.value || route.path !== path) return;
  const heading = document.querySelector<HTMLElement>(".account-content h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}
function selectAccount(event: MouseEvent, path: string) {
  // NuxtLink owns navigation, including modified clicks that open another tab.
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  closeDropdown();
  pendingAccountPath = route.path === path ? null : path;
  if (route.path === path) void focusAccountHeading(path);
}
onMounted(() => {
  document.addEventListener("click", closeFromOutside);
  document.addEventListener("focusin", closeFromOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", closeFromOutside);
  document.removeEventListener("focusin", closeFromOutside);
});
watch(
  () => route.fullPath,
  () => {
    closeDropdown();
    const path = pendingAccountPath;
    pendingAccountPath = null;
    // Nuxt's route changes after the destination page has finished rendering.
    if (path === route.path) void focusAccountHeading(path);
  },
  { flush: "post" },
);
</script>
<template>
  <header class="topbar">
    <div class="container header-inner">
      <NuxtLink class="brand" to="/"><BrandMark />{{ copy("brand") }}</NuxtLink>
      <nav class="nav" :aria-label="copy('mainnav')">
        <NuxtLink
          v-for="item in navigation"
          :key="item.path"
          :to="item.path"
          :aria-current="active(item.path)"
          >{{ copy("nav." + item.key) }}</NuxtLink
        >
      </nav>
      <div class="header-actions">
        <LocaleSwitch />
        <template v-if="session.actor.value?.kind === 'account'">
          <NuxtLink
            v-if="session.isAdmin.value"
            class="btn quiet"
            to="/admin"
            >{{ copy("admin") }}</NuxtLink
          >
          <template v-else>
            <NuxtLink class="btn quiet" to="/notices">{{
              copy("notices")
            }}</NuxtLink>
            <details
              ref="dropdown"
              class="account-dropdown"
              @keydown.esc="escapeDropdown"
            >
              <summary :aria-label="copy('accountmenu')">
                <span class="avatar" aria-hidden="true">{{
                  name.slice(0, 1)
                }}</span
                ><span class="user-name">{{ name }}</span
                ><AppIcon name="chevron-down" class="dropdown-chevron" />
              </summary>
              <nav class="account-popover" :aria-label="copy('accountmenu')">
                <NuxtLink
                  v-for="item in accountLinks"
                  :key="item.path"
                  :to="item.path"
                  :aria-current="route.path === item.path ? 'page' : undefined"
                  @click="selectAccount($event, item.path)"
                  ><AppIcon :name="item.icon" />{{ copy(item.key) }}</NuxtLink
                >
              </nav>
            </details>
          </template>
        </template>
        <template v-else
          ><NuxtLink class="btn primary" to="/login">{{
            copy("login")
          }}</NuxtLink
          ><NuxtLink class="btn quiet" to="/register">{{
            copy("i.register")
          }}</NuxtLink></template
        >
      </div>
    </div>
  </header>
</template>
