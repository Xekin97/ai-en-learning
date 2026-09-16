import { describe, expect, it } from "vitest";
import {
  beginAdminUserAppend,
  beginAdminUserSearch,
  completeAdminUserSearch,
  createAdminUserSearchState,
  failAdminUserAppend,
  isInvalidAdminUserCursorFailure,
} from "@application/admin/user-search";
import type {
  AdminUserSummaryModel,
  AppFailure,
  PageModel,
} from "@application/shared/models";
import { presentAdminUserSearch } from "@presentation/admin/admin-user-search-presenter";

describe("admin user search state", () => {
  it("starts idle and keeps the backend result order unchanged", () => {
    const initial = createAdminUserSearchState();
    expect(initial).toMatchObject({
      resultStatus: "idle",
      appendStatus: "idle",
      items: [],
    });

    const started = beginAdminUserSearch(initial, "  learner  ");
    const exact = user("exact", "learner");
    const alphabetical = user("alpha", "a-learner");
    const result = completeAdminUserSearch(
      started.state,
      started.request,
      page([exact, alphabetical], "opaque.v2.next"),
    );
    expect(result.state.items.map((item) => item.id)).toEqual([
      "exact",
      "alpha",
    ]);
    expect(result.state.submittedQuery).toBe("learner");
  });

  it("appends three opaque-cursor pages without omissions or duplicates", () => {
    const first = beginAdminUserSearch(createAdminUserSearchState(), "learn");
    let state = completeAdminUserSearch(
      first.state,
      first.request,
      page([user("1", "learn"), user("2", "a-learn")], "opaque.page.2"),
    ).state;

    const second = beginAdminUserAppend(state);
    expect(second?.request.cursor).toBe("opaque.page.2");
    expect(second?.state.items).toHaveLength(2);
    expect(second?.state.appendStatus).toBe("loading");
    if (!second) throw new Error("second page did not start");
    state = completeAdminUserSearch(
      second.state,
      second.request,
      page([user("3", "b-learn"), user("4", "c-learn")], "opaque.page.3"),
    ).state;

    const third = beginAdminUserAppend(state);
    if (!third) throw new Error("third page did not start");
    state = completeAdminUserSearch(
      third.state,
      third.request,
      page([user("5", "d-learn"), user("6", "e-learn")]),
    ).state;
    expect(state.items.map((item) => item.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(state.pageInfo).toEqual({ nextCursor: null, hasMore: false });
  });

  it("ignores stale responses after a newer search starts", () => {
    const oldRequest = beginAdminUserSearch(
      createAdminUserSearchState(),
      "old",
    );
    const newRequest = beginAdminUserSearch(oldRequest.state, "new");
    const stale = completeAdminUserSearch(
      newRequest.state,
      oldRequest.request,
      page([user("old", "old")]),
    );
    expect(stale.applied).toBe(false);
    expect(stale.state.submittedQuery).toBe("new");
    expect(stale.state.items).toEqual([]);
  });

  it("keeps rows and cursor when an append fails", () => {
    const first = beginAdminUserSearch(createAdminUserSearchState(), "learn");
    const ready = completeAdminUserSearch(
      first.state,
      first.request,
      page([user("1", "learn")], "opaque.retry"),
    ).state;
    const append = beginAdminUserAppend(ready);
    if (!append) throw new Error("append did not start");
    const failed = failAdminUserAppend(
      append.state,
      append.request,
      networkFailure(),
    ).state;
    expect(failed.items.map((item) => item.id)).toEqual(["1"]);
    expect(failed.pageInfo.nextCursor).toBe("opaque.retry");
    expect(failed.appendStatus).toBe("failed");
  });

  it("rejects a duplicate append as a contract failure", () => {
    const first = beginAdminUserSearch(createAdminUserSearchState(), "learn");
    const ready = completeAdminUserSearch(
      first.state,
      first.request,
      page([user("1", "learn")], "opaque.duplicate"),
    ).state;
    const append = beginAdminUserAppend(ready);
    if (!append) throw new Error("append did not start");
    const duplicate = completeAdminUserSearch(
      append.state,
      append.request,
      page([user("1", "learn")]),
    ).state;
    expect(duplicate.appendStatus).toBe("failed");
    expect(duplicate.appendFailure?.kind).toBe("contract_violation");
    expect(duplicate.items).toHaveLength(1);
  });

  it("recognizes only the explicit invalid-cursor problem", () => {
    expect(
      isInvalidAdminUserCursorFailure({
        ...networkFailure(),
        kind: "validation",
        code: "validation_failed",
        status: 422,
        fields: { cursor: "invalid" },
      }),
    ).toBe(true);
    expect(
      isInvalidAdminUserCursorFailure({
        ...networkFailure(),
        kind: "validation",
        code: "validation_failed",
        status: 422,
        fields: { username: "invalid" },
      }),
    ).toBe(false);
  });
});

describe("admin user search presenter", () => {
  it("maps application models without exposing cursors or changing order", () => {
    const started = beginAdminUserSearch(
      createAdminUserSearchState(),
      "learner",
    );
    const state = completeAdminUserSearch(
      started.state,
      started.request,
      page(
        [user("exact", "learner"), user("other", "a-learner")],
        "opaque.private.cursor",
      ),
    ).state;
    const view = presentAdminUserSearch(state, {
      t: (key, parameters) =>
        parameters?.date ? `${key}:${parameters.date}` : key,
      formatDate: () => "Sep 4, 2026",
      formatGroup: (group) => group,
    });
    expect(view.rows.map((row) => row.id)).toEqual(["exact", "other"]);
    expect(view.rows[0]?.href.query.q).toBe("learner");
    expect(JSON.stringify(view)).not.toContain("opaque.private.cursor");
  });

  it("uses stable joined-date and plan copy without treating admin as Guest", () => {
    const started = beginAdminUserSearch(createAdminUserSearchState(), "all");
    const learner = user("learner", "learner");
    const administrator: AdminUserSummaryModel = {
      ...user("admin", "admin"),
      role: "admin",
      planCode: null,
    };
    const state = completeAdminUserSearch(
      started.state,
      started.request,
      page([learner, administrator]),
    ).state;
    const labels: Record<string, string> = {
      "admin.learner": "Learner",
      "admin.role": "Administrator",
      "admin.normal": "Active",
      "admin.notApplicable": "—",
    };
    const view = presentAdminUserSearch(state, {
      t: (key, parameters) =>
        key === "admin.createdAt"
          ? `Joined ${parameters?.date}`
          : (labels[key] ?? key),
      formatDate: (value) => value.slice(0, 10),
      formatGroup: () => "Basic",
    });

    expect(view.rows[0]).toMatchObject({
      meta: "Learner · Joined 2026-09-04",
      plan: "Basic",
      status: "Active",
    });
    expect(view.rows[1]).toMatchObject({
      meta: "Administrator · Joined 2026-09-04",
      plan: "—",
    });
  });
});

function user(id: string, username: string): AdminUserSummaryModel {
  return {
    id,
    username,
    role: "learner",
    planCode: "basic",
    status: "active",
    createdAt: "2026-09-04T00:00:00Z",
  };
}

function page(
  items: AdminUserSummaryModel[],
  nextCursor: string | null = null,
): PageModel<AdminUserSummaryModel> {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

function networkFailure(): AppFailure {
  return {
    kind: "network",
    code: "network_error",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  };
}
