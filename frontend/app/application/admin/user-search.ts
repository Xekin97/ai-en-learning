import type {
  AdminUserSummaryModel,
  AppFailure,
  PageModel,
} from "@application/shared/models";

export type AdminUserResultStatus =
  "idle" | "loading" | "ready" | "empty" | "failed";
export type AdminUserAppendStatus = "idle" | "loading" | "failed";

export interface AdminUserSearchState {
  submittedQuery: string;
  resultStatus: AdminUserResultStatus;
  appendStatus: AdminUserAppendStatus;
  items: readonly AdminUserSummaryModel[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
  resultFailure: AppFailure | null;
  appendFailure: AppFailure | null;
  requestEpoch: number;
}

export interface AdminUserSearchRequest {
  mode: "initial" | "append";
  query: string;
  cursor: string | null;
  epoch: number;
}

export interface AdminUserSearchTransition {
  state: AdminUserSearchState;
  applied: boolean;
}

export function createAdminUserSearchState(): AdminUserSearchState {
  return {
    submittedQuery: "",
    resultStatus: "idle",
    appendStatus: "idle",
    items: [],
    pageInfo: { nextCursor: null, hasMore: false },
    resultFailure: null,
    appendFailure: null,
    requestEpoch: 0,
  };
}

export function beginAdminUserSearch(
  current: AdminUserSearchState,
  query: string,
): { state: AdminUserSearchState; request: AdminUserSearchRequest } {
  const epoch = current.requestEpoch + 1;
  const submittedQuery = query.trim();
  return {
    state: {
      submittedQuery,
      resultStatus: "loading",
      appendStatus: "idle",
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
      resultFailure: null,
      appendFailure: null,
      requestEpoch: epoch,
    },
    request: {
      mode: "initial",
      query: submittedQuery,
      cursor: null,
      epoch,
    },
  };
}

export function beginAdminUserAppend(
  current: AdminUserSearchState,
): { state: AdminUserSearchState; request: AdminUserSearchRequest } | null {
  const cursor = current.pageInfo.nextCursor;
  if (
    !cursor ||
    !current.pageInfo.hasMore ||
    current.resultStatus !== "ready" ||
    current.appendStatus === "loading"
  )
    return null;

  const epoch = current.requestEpoch + 1;
  return {
    state: {
      ...current,
      appendStatus: "loading",
      appendFailure: null,
      requestEpoch: epoch,
    },
    request: {
      mode: "append",
      query: current.submittedQuery,
      cursor,
      epoch,
    },
  };
}

export function completeAdminUserSearch(
  current: AdminUserSearchState,
  request: AdminUserSearchRequest,
  page: PageModel<AdminUserSummaryModel>,
): AdminUserSearchTransition {
  if (!isCurrentAdminUserRequest(current, request))
    return { state: current, applied: false };

  const contractFailure = validatePage(
    page,
    request.mode === "append" ? current.items : [],
  );
  if (contractFailure) {
    return request.mode === "append"
      ? failAdminUserAppend(current, request, contractFailure)
      : failAdminUserSearch(current, request, contractFailure);
  }

  const items =
    request.mode === "append" ? [...current.items, ...page.items] : page.items;
  return {
    state: {
      ...current,
      submittedQuery: request.query,
      resultStatus: items.length ? "ready" : "empty",
      appendStatus: "idle",
      items,
      pageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore },
      resultFailure: null,
      appendFailure: null,
    },
    applied: true,
  };
}

export function failAdminUserSearch(
  current: AdminUserSearchState,
  request: AdminUserSearchRequest,
  failure: AppFailure,
): AdminUserSearchTransition {
  if (!isCurrentAdminUserRequest(current, request))
    return { state: current, applied: false };
  return {
    state: {
      ...current,
      resultStatus: "failed",
      appendStatus: "idle",
      items: [],
      pageInfo: { nextCursor: null, hasMore: false },
      resultFailure: failure,
      appendFailure: null,
    },
    applied: true,
  };
}

export function failAdminUserAppend(
  current: AdminUserSearchState,
  request: AdminUserSearchRequest,
  failure: AppFailure,
): AdminUserSearchTransition {
  if (!isCurrentAdminUserRequest(current, request))
    return { state: current, applied: false };
  return {
    state: {
      ...current,
      appendStatus: "failed",
      appendFailure: failure,
    },
    applied: true,
  };
}

export function isCurrentAdminUserRequest(
  current: AdminUserSearchState,
  request: AdminUserSearchRequest,
): boolean {
  return (
    current.requestEpoch === request.epoch &&
    current.submittedQuery === request.query &&
    (request.mode === "initial" ||
      current.pageInfo.nextCursor === request.cursor)
  );
}

export function isInvalidAdminUserCursorFailure(failure: AppFailure): boolean {
  return (
    failure.status === 422 &&
    failure.code === "validation_failed" &&
    failure.fields.cursor === "invalid"
  );
}

function validatePage(
  page: PageModel<AdminUserSummaryModel>,
  existingItems: readonly AdminUserSummaryModel[],
): AppFailure | null {
  if (page.hasMore !== (page.nextCursor !== null)) return contractFailure();
  const ids = new Set(existingItems.map((item) => item.id));
  for (const item of page.items) {
    if (ids.has(item.id)) return contractFailure();
    ids.add(item.id);
  }
  return null;
}

function contractFailure(): AppFailure {
  return {
    kind: "contract_violation",
    code: "contract_violation",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  };
}
