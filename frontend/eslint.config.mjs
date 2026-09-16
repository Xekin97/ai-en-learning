import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "vue/no-v-html": "error",
      "vue/html-self-closing": [
        "error",
        {
          html: { void: "always", normal: "always", component: "always" },
          svg: "always",
          math: "always",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**"],
              message:
                "UI and pages consume application models through runtime stores, never transport modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/infrastructure/**/*.{ts,vue}",
      "app/plugins/**/*.ts",
      "tests/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
