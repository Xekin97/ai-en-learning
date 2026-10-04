<script setup lang="ts">
const session = useSessionStore(),
  route = useRoute();
const { copy } = useDesignCopy();
const modules = [
  { path: "/admin", key: "adminhome", icon: "layout-dashboard" },
  { path: "/admin/analytics", key: "metrics", icon: "chart-no-axes-combined" },
  { path: "/admin/models", key: "models", icon: "bot" },
  { path: "/admin/plans", key: "plans", icon: "layers" },
  { path: "/admin/users", key: "users", icon: "users" },
  { path: "/admin/growth", key: "operations", icon: "gift" },
  { path: "/admin/notices", key: "messages", icon: "megaphone" },
  { path: "/admin/presets", key: "presets", icon: "panels-top-left" },
] as const;
const current = (path: string) =>
  route.path === path ||
  (path !== "/admin" && route.path.startsWith(path + "/"));
async function logout() {
  await session.logout();
  await navigateTo("/");
}
</script>
<template>
  <div>
    <a class="skip-link" href="#admin-main">{{ $t("common.skipToContent") }}</a>
    <header class="topbar admin-topbar">
      <div class="container header-inner">
        <NuxtLink class="brand" to="/admin"
          ><BrandMark />{{ copy("brand")
          }}<small>{{ copy("admin") }}</small></NuxtLink
        >
        <div class="header-actions">
          <LocaleSwitch /><span class="pill">{{ copy("a.role.admin") }}</span
          ><button class="btn quiet" type="button" @click="logout">
            {{ copy("a.logout") }}
          </button>
        </div>
      </div>
    </header>
    <main class="container page">
      <div class="admin-layout">
        <nav class="admin-nav" :aria-label="copy('admin')">
          <NuxtLink
            v-for="item in modules"
            :key="item.path"
            :to="item.path"
            :class="{ selected: current(item.path) }"
            :aria-current="current(item.path) ? 'page' : undefined"
            ><AppIcon :name="item.icon" />{{ copy("a." + item.key) }}</NuxtLink
          >
        </nav>
        <div id="admin-main" class="admin-main" tabindex="-1"><slot /></div>
      </div>
    </main>
    <footer class="container footer">
      <span>{{ copy("footer") }}</span>
    </footer>
  </div>
</template>
