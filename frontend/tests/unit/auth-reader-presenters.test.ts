import { describe, expect, it } from "vitest";
import {
  safeReturnIntent,
  authenticationDestination,
} from "@application/auth/return-intent";
import { presentAuthGate } from "@presentation/auth/auth-gate-presenter";
import { splitReaderParagraphs } from "@presentation/admin/admin-user-detail-presenter";
import en from "../../i18n/locales/en-US.json";
import zh from "../../i18n/locales/zh-CN.json";

describe("semantic authentication targets", () => {
  it.each([en, zh])(
    "uses a whole translated sentence for every entry path",
    (messages) => {
      const translate = (key: string) => {
        const value = key
          .split(".")
          .reduce<unknown>(
            (v, part) => (v as Record<string, unknown>)[part],
            messages,
          );
        if (typeof value !== "string")
          throw new Error("Missing translation: " + key);
        return value;
      };
      for (const [path, target] of [
        ["/review", "review"],
        ["/review/session-1?batch=batch-1", "review"],
        ["/library", "library"],
        ["/library/batch-1", "story"],
        ["/account", "account"],
      ] as const) {
        const intent = safeReturnIntent(path)!;
        expect(intent.target).toBe(target);
        const gate = presentAuthGate(intent, translate);
        expect(gate.title).toBe(messages.auth.targets[target]);
        expect(gate.description).toBe(messages.auth.descriptions[target]);
        expect(gate.title).not.toMatch(/PAGE-|范围|批次详情|\{target\}/u);
        expect(gate.loginTo).toEqual({
          path: "/login",
          query: { redirect: path },
        });
        expect(gate.registerTo).toEqual({
          path: "/register",
          query: { redirect: path },
        });
      }
    },
  );
  it("drops unapproved query/hash fields and gives administrator routing priority", () => {
    const intent = safeReturnIntent(
      "/review/session-1?batch=batch-1&prompt=anything&redirect=//outside#private",
    )!;
    expect(intent.href).toBe("/review/session-1?batch=batch-1");
    expect(authenticationDestination(false, intent)).toEqual({
      path: "/review/session-1",
      query: { batch: "batch-1" },
    });
    expect(authenticationDestination(true, intent)).toEqual({
      path: "/admin",
      query: {},
    });
    expect(authenticationDestination(false, null)).toEqual({
      path: "/library",
      query: {},
    });
    expect(safeReturnIntent(["/review", "/account"])).toBeNull();
  });
});

describe("read-only story paragraph projection", () => {
  it.each([
    "",
    "A single paragraph.",
    "One\nsoft break.\n\nSecond paragraph.",
    "\n\nLeading\r\n \r\nMixed separators\n\n\n",
    "<script>alert(1)</script> & café\n\n文字 and emojis 🌱.",
  ])(
    "preserves every source character without rewriting content: %s",
    (source) => {
      const paragraphs = splitReaderParagraphs(source);
      expect(paragraphs.map((p) => p.separator + p.text).join("")).toBe(source);
      expect(paragraphs.every((p) => typeof p.text === "string")).toBe(true);
    },
  );
});
