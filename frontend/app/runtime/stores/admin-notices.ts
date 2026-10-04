import type {
  AdminNoticeInput,
  AdminNoticeModel,
} from "@application/admin/notices";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useAdminNoticesStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState("admin-notices", () => ({
    items: [] as AdminNoticeModel[],
    nextCursor: null as string | null,
    request: 0,
    pending: false,
    failure: null as AppFailure | null,
  }));
  const saving = ref(false),
    failure = shallowRef<AppFailure | null>(null),
    safePreview = ref<string | null>(null);
  let previewRevision = 0;
  async function load(more = false) {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    try {
      const page = await api.listAdminNotices(
        more ? (state.value.nextCursor ?? undefined) : undefined,
      );
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.items = more
        ? [...state.value.items, ...page.items]
        : page.items;
      state.value.nextCursor = page.nextCursor;
      state.value.failure = null;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function save(
    id: string | null,
    input: AdminNoticeInput,
    revision: string | null,
  ) {
    if (saving.value) return null;
    const epoch = session.epoch.value;
    saving.value = true;
    failure.value = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return null;
      const value = await api.saveAdminNotice(id, input, revision);
      if (epoch !== session.epoch.value) return null;
      await load();
      if (epoch !== session.epoch.value) return null;
      feedback.show("saved");
      return value;
    } catch (error) {
      if (epoch === session.epoch.value) {
        failure.value = normalizeFailure(error);
        await load();
        if (epoch === session.epoch.value) feedback.show("failed");
      }
      return null;
    } finally {
      if (epoch === session.epoch.value) saving.value = false;
    }
  }
  async function preview(markdown: string) {
    const epoch = session.epoch.value,
      request = ++previewRevision;
    safePreview.value = null;
    failure.value = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const value = await api.previewNotice(markdown);
      if (epoch === session.epoch.value && request === previewRevision)
        safePreview.value = value;
    } catch (error) {
      if (epoch === session.epoch.value && request === previewRevision)
        failure.value = normalizeFailure(error);
    }
  }
  function closePreview() {
    previewRevision++;
    safePreview.value = null;
  }
  watch(session.epoch, () => {
    closePreview();
    failure.value = null;
    saving.value = false;
  });
  onBeforeUnmount(closePreview);
  return {
    state: readonly(state),
    saving: readonly(saving),
    failure: readonly(failure),
    safePreview: readonly(safePreview),
    load,
    read: async (id: string) => {
      const epoch = session.epoch.value;
      const value = await api.getAdminNotice(id);
      return epoch === session.epoch.value ? value : null;
    },
    save,
    preview,
    closePreview,
  };
}
