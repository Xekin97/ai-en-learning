import type { AdminUserSearchState } from "@application/admin/user-search";
import type { GroupCode } from "@application/shared/models";

type Translate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string;

export interface AdminUserSearchRowViewModel {
  id: string;
  username: string;
  initial: string;
  meta: string;
  plan: string;
  status: string;
  href: { path: string; query: { q: string } };
  openLabel: string;
}

export interface AdminUserSearchViewModel {
  submittedQuery: string;
  hasSearched: boolean;
  isBusy: boolean;
  isInitialLoading: boolean;
  isAppending: boolean;
  showInitialFailure: boolean;
  showEmpty: boolean;
  showResults: boolean;
  showPagination: boolean;
  showAppendFailure: boolean;
  resultCount: string;
  shownCount: string;
  appendButtonLabel: string;
  rows: AdminUserSearchRowViewModel[];
}

export function presentAdminUserSearch(
  state: AdminUserSearchState,
  dependencies: {
    t: Translate;
    formatDate: (value: string) => string;
    formatGroup: (value: GroupCode) => string;
  },
): AdminUserSearchViewModel {
  const rows = state.items.map((user) => ({
    id: user.id,
    username: user.username,
    initial: user.username.charAt(0).toUpperCase(),
    meta: `${dependencies.t(user.role === "learner" ? "admin.learner" : "admin.role")} · ${dependencies.t("admin.createdAt", { date: dependencies.formatDate(user.createdAt) })}`,
    plan: user.planCode
      ? dependencies.formatGroup(user.planCode)
      : dependencies.t("admin.notApplicable"),
    status: dependencies.t("admin.normal"),
    href: {
      path: `/admin/users/${user.id}`,
      query: { q: state.submittedQuery },
    },
    openLabel: dependencies.t("admin.openUser", {
      username: user.username,
    }),
  }));
  const isInitialLoading = state.resultStatus === "loading";
  const isAppending = state.appendStatus === "loading";
  const showResults = state.resultStatus === "ready" && rows.length > 0;

  return {
    submittedQuery: state.submittedQuery,
    hasSearched: state.resultStatus !== "idle",
    isBusy: isInitialLoading || isAppending,
    isInitialLoading,
    isAppending,
    showInitialFailure: state.resultStatus === "failed",
    showEmpty: state.resultStatus === "empty",
    showResults,
    showPagination:
      showResults &&
      (state.pageInfo.hasMore || state.appendStatus === "failed"),
    showAppendFailure: state.appendStatus === "failed",
    resultCount: dependencies.t("admin.resultsCount", { count: rows.length }),
    shownCount: dependencies.t("admin.shownCount", { count: rows.length }),
    appendButtonLabel: dependencies.t(
      isAppending
        ? "admin.loadingMore"
        : state.appendStatus === "failed"
          ? "admin.retryLoadMore"
          : "admin.loadMore",
    ),
    rows,
  };
}
