import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreAdminUserSearchPosition } from "@presentation/controllers/admin-user-search";

describe("admin user search position restoration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("restores immediately before focusing without another browser scroll", () => {
    const target = document.createElement("a");
    document.body.append(target);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const focus = vi.spyOn(target, "focus").mockImplementation(() => {});

    restoreAdminUserSearchPosition(5_405, target);

    expect(scrollTo).toHaveBeenCalledWith({
      top: 5_405,
      behavior: "instant",
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollTo.mock.invocationCallOrder[0]).toBeLessThan(
      focus.mock.invocationCallOrder[0],
    );
    target.remove();
  });

  it("still restores when the original focus target no longer exists", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    restoreAdminUserSearchPosition(900, null);

    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "instant" });
  });
});
