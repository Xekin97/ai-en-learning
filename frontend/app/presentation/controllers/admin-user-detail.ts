import {
  safePathSegment,
  safeSearchQuery,
} from "@application/auth/return-intent";
import {
  presentAdminUserDetail,
  presentAdminBatchReader,
} from "@presentation/admin/admin-user-detail-presenter";

export function useAdminUserDetailController() {
  const detail = useAdminUserDetailStore(),
    session = useSessionStore();
  const route = useRoute(),
    router = useRouter(),
    f = useDisplayFormatters();
  const { t } = useI18n();
  const userId = safePathSegment(route.params.userId) ?? "";
  const query = computed(() => safeSearchQuery(route.query.q));
  const draft = ref(query.value);
  const libraryHeading = ref<HTMLElement | null>(null);
  const groupOpen = ref(false),
    passwordOpen = ref(false);
  const group = ref<"basic" | "pro" | "plus">("basic"),
    password = ref(""),
    confirmation = ref("");
  const batchId = computed(() => safePathSegment(route.query.batch));
  let mounted = false,
    pushedParent: string | null = null,
    openedPath: string | null = null;
  let returnFocus: HTMLElement | null = null,
    scrollY = 0,
    focusRevision = 0;
  const format = {
    ...f,
    date: f.adminDate,
    t: (key: string, parameters?: Record<string, string | number>) =>
      String(t(key, parameters ?? {})),
  };
  const view = computed(() =>
    presentAdminUserDetail(detail.state.value, format),
  );
  const reader = computed(() =>
    presentAdminBatchReader(
      detail.state.value.reader,
      view.value.username,
      format,
    ),
  );
  const backToResults = computed(() => ({
    path: "/admin/users",
    query: query.value ? { q: query.value, focus: userId } : {},
  }));
  watch(query, (value) => {
    draft.value = value;
  });
  async function initialize() {
    await usePageLoader("admin-user:" + userId, () => detail.load(userId));
  }
  async function search() {
    const q = safeSearchQuery(draft.value);
    if (q) await router.push({ path: "/admin/users", query: { q } });
  }
  async function openReader(id: string, target: EventTarget | null) {
    if (!safePathSegment(id)) return;
    focusRevision++;
    returnFocus = target instanceof HTMLElement ? target : null;
    scrollY = window.scrollY;
    if (!batchId.value) pushedParent = route.fullPath;
    const location = {
      path: route.path,
      query: { ...(query.value ? { q: query.value } : {}), batch: id },
    };
    openedPath = router.resolve(location).fullPath;
    if (batchId.value) await router.replace(location);
    else await router.push(location);
  }
  async function closeReader() {
    if (!batchId.value) return;
    if (pushedParent && openedPath === route.fullPath) router.back();
    else
      await router.replace({
        path: route.path,
        query: query.value ? { q: query.value } : {},
      });
  }
  async function restoreFocus() {
    const revision = ++focusRevision;
    await nextTick();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    if (
      revision !== focusRevision ||
      batchId.value ||
      safePathSegment(route.params.userId) !== userId
    )
      return;
    window.scrollTo({ top: scrollY, behavior: "instant" });
    (returnFocus?.isConnected ? returnFocus : libraryHeading.value)?.focus({
      preventScroll: true,
    });
  }
  function synchronizeReader() {
    if (!mounted || !session.isAdmin.value) return;
    if (batchId.value) {
      if (!openedPath) {
        scrollY = window.scrollY;
        pushedParent = null;
      }
      void detail.readBatch(userId, batchId.value);
    } else {
      detail.closeReader();
      openedPath = null;
      pushedParent = null;
      void restoreFocus();
    }
  }
  onMounted(() => {
    mounted = true;
    if (batchId.value) synchronizeReader();
  });
  watch(batchId, synchronizeReader);
  onBeforeRouteLeave(() => {
    focusRevision++;
    detail.dispose();
    groupOpen.value = false;
    passwordOpen.value = false;
  });
  onBeforeUnmount(() => {
    mounted = false;
    focusRevision++;
    if (detail.state.value.userId === userId) detail.dispose();
  });
  watch(session.epoch, () => {
    groupOpen.value = false;
    passwordOpen.value = false;
    detail.closeReader();
  });
  function openGroup() {
    group.value = detail.state.value.user?.planCode ?? "basic";
    groupOpen.value = true;
  }
  function closePassword() {
    passwordOpen.value = false;
    password.value = "";
    confirmation.value = "";
  }
  async function saveGroup() {
    if ((await detail.changeGroup(userId, group.value)).kind === "applied")
      groupOpen.value = false;
  }
  async function resetPassword() {
    if (
      (await detail.resetPassword(userId, password.value, confirmation.value))
        .kind === "applied"
    )
      closePassword();
  }
  return {
    view,
    reader,
    draft,
    query,
    batchId,
    backToResults,
    libraryHeading,
    groupOpen,
    passwordOpen,
    group,
    password,
    confirmation,
    initialize,
    search,
    openReader,
    closeReader,
    openGroup,
    closePassword,
    saveGroup,
    resetPassword,
    retry: () => detail.readUser(userId),
    retryLibrary: () => detail.readLibrary(userId),
    retryReader: () => {
      if (batchId.value) void detail.readBatch(userId, batchId.value);
    },
  };
}
