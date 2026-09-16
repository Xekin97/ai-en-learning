module.exports = {
  forbidden: [
    {
      name: "presentation-does-not-use-infrastructure",
      from: { path: "^app/(pages|layouts|presentation)/" },
      to: { path: "^app/infrastructure/" },
    },
    {
      name: "application-is-framework-free",
      from: { path: "^app/(application|domain)/" },
      to: {
        path: "(^app/(runtime|presentation|infrastructure)/)|node_modules/(vue|nuxt|zod|ofetch|@nuxt)",
      },
    },
    {
      name: "runtime-store-does-not-use-transport",
      from: { path: "^app/runtime/stores/" },
      to: {
        path: "^app/infrastructure/(http/(dto|schemas|transports)|stream)/",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
    },
  },
};
