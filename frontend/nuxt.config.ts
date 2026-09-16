import { fileURLToPath } from "node:url";

const backendInternalOrigin =
  process.env.NUXT_BACKEND_INTERNAL_ORIGIN ?? "http://backend:8080";

export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  devtools: { enabled: false },
  modules: ["@nuxtjs/i18n", "@nuxt/eslint"],
  components: [{ path: "~/presentation/components", pathPrefix: false }],
  imports: {
    dirs: ["application/**", "runtime/loaders/**", "runtime/stores/**"],
  },
  css: ["~/assets/css/theme.css", "~/assets/css/application.css"],
  alias: {
    "@application": fileURLToPath(
      new URL("./app/application", import.meta.url),
    ),
    "@domain": fileURLToPath(new URL("./app/domain", import.meta.url)),
    "@infrastructure": fileURLToPath(
      new URL("./app/infrastructure", import.meta.url),
    ),
    "@presentation": fileURLToPath(
      new URL("./app/presentation", import.meta.url),
    ),
    "@runtime": fileURLToPath(new URL("./app/runtime", import.meta.url)),
  },
  runtimeConfig: {
    backendInternalOrigin,
    public: {},
  },
  routeRules: {
    "/**": { headers: { "cache-control": "private, no-store" } },
    "/_nuxt/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  },
  nitro: {
    preset: "node-server",
    devProxy: {
      "/api/v1": {
        target: `${backendInternalOrigin.replace(/\/$/, "")}/api/v1`,
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
      },
    },
  },
  i18n: {
    defaultLocale: "en-US",
    strategy: "no_prefix",
    detectBrowserLanguage: false,
    langDir: "locales",
    locales: [
      { code: "zh-CN", language: "zh-CN", name: "中文", file: "zh-CN.json" },
      { code: "en-US", language: "en-US", name: "English", file: "en-US.json" },
    ],
  },
  app: {
    head: {
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "theme-color", content: "#f4efe5" },
      ],
    },
  },
});
