import { adminSearchNavigation } from "@runtime/session/admin-navigation";
import { computed, nextTick, onMounted, ref } from "vue";
import { presentAdminUserSearch } from "@presentation/admin/admin-user-search-presenter";

export function restoreAdminUserSearchPosition(
  scrollY: number,
  target: HTMLElement | null,
): void {
  window.scrollTo({ top: scrollY, behavior: "instant" });
  target?.focus({ preventScroll: true });
}

async function waitForAdminUserSearchLayout(): Promise<void> {
  await document.fonts.ready;
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function useAdminUserSearchController() {
  const admin = useAdminStore();
  const format = useDisplayFormatters();
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const initialQuery =
    typeof route.query.q === "string" ? route.query.q.trim() : "";
  const draftQuery = ref(initialQuery);
  const resultHeading = ref<HTMLElement | null>(null);
  const loadMoreButton = ref<HTMLButtonElement | null>(null);
  const navigation = adminSearchNavigation(useNuxtApp());

  const view = computed(() =>
    presentAdminUserSearch(admin.state.value.userSearch, {
      t: (key, parameters) => String(t(key, parameters ?? {})),
      formatDate: format.adminDate,
      formatGroup: format.group,
    }),
  );

  onMounted(async () => {
    const focusId =
      typeof route.query.focus === "string"
        ? route.query.focus
        : navigation.value.focusedUserId;
    if (!focusId) return;
    await nextTick();
    await waitForAdminUserSearchLayout();
    restoreAdminUserSearchPosition(
      navigation.value.scrollY,
      findUserFocusTarget(focusId),
    );
  });

  if (
    !initialQuery &&
    route.query.all !== "1" &&
    !navigation.value.focusedUserId
  ) {
    admin.resetUserSearch();
  } else if (
    admin.state.value.userSearch.submittedQuery !== initialQuery ||
    admin.state.value.userSearch.resultStatus === "idle"
  ) {
    await usePageLoader(`admin-users:${initialQuery}`, async () => {
      await admin.loadUsers(initialQuery);
    });
  }

  async function search(): Promise<void> {
    const query = draftQuery.value.trim();
    if (view.value.isInitialLoading) return;
    await router.replace({
      path: "/admin/users",
      query: query ? { q: query } : { all: "1" },
    });
    const outcome = await admin.loadUsers(query);
    if (outcome.kind !== "applied") return;
    await nextTick();
    resultHeading.value?.focus();
  }

  async function retrySearch(): Promise<void> {
    draftQuery.value = view.value.submittedQuery;
    await search();
  }

  async function loadMore(): Promise<void> {
    const outcome = await admin.loadMoreUsers();
    if (outcome.kind !== "applied") return;
    await nextTick();
    if (outcome.mode === "recovery") {
      resultHeading.value?.focus();
    } else if (outcome.hasMore) {
      loadMoreButton.value?.focus();
    } else if (outcome.firstNewUserId) {
      focusUser(outcome.firstNewUserId);
    } else {
      resultHeading.value?.focus();
    }
  }

  function rememberPosition(userId: string): void {
    navigation.value = {
      scrollY: window.scrollY,
      focusedUserId: userId,
    };
  }

  function focusUser(userId: string): void {
    findUserFocusTarget(userId)?.focus();
  }

  function findUserFocusTarget(userId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `[data-user-id="${CSS.escape(userId)}"]`,
    );
  }

  return {
    draftQuery,
    loadMoreButton,
    resultHeading,
    view,
    loadMore,
    rememberPosition,
    retrySearch,
    search,
  };
}
