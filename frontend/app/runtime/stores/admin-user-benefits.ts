import type {
  UserBenefitsModel,
  PointsLedgerRow,
} from "@application/admin/user-benefits";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useAdminUserBenefitsStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState("admin-user-benefits", () => ({
    userId: null as string | null,
    benefits: null as UserBenefitsModel | null,
    ledger: [] as PointsLedgerRow[],
    balance: null as string | null,
    nextCursor: null as string | null,
    failure: null as AppFailure | null,
    pending: false,
    request: 0,
  }));
  const intent = shallowRef<{
      userId: string;
      points: string;
      reason: string;
      key: string;
    } | null>(null),
    saving = ref(false),
    grantFailure = shallowRef<AppFailure | null>(null);
  async function load(id: string, more = false) {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    if (state.value.userId !== id) {
      state.value.userId = id;
      state.value.benefits = null;
      state.value.ledger = [];
      state.value.nextCursor = null;
    }
    state.value.pending = true;
    state.value.failure = null;
    try {
      const [benefits, page] = await Promise.all([
        api.getUserBenefits(id),
        api.listUserPoints(
          id,
          more ? (state.value.nextCursor ?? undefined) : undefined,
        ),
      ]);
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.benefits = benefits;
      state.value.balance = page.balance;
      state.value.ledger = more
        ? [...state.value.ledger, ...page.items]
        : page.items;
      state.value.nextCursor = page.nextCursor;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  function preview(id: string, points: string, reason: string) {
    if (saving.value) return;
    intent.value = { userId: id, points, reason, key: crypto.randomUUID() };
    grantFailure.value = null;
  }
  function close() {
    if (!saving.value) {
      intent.value = null;
      grantFailure.value = null;
    }
  }
  async function confirm() {
    const value = intent.value;
    if (!value || saving.value) return false;
    const epoch = session.epoch.value;
    saving.value = true;
    grantFailure.value = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return false;
      await api.grantUserPoints(
        value.userId,
        value.points,
        value.reason,
        value.key,
      );
      if (epoch !== session.epoch.value) return false;
      intent.value = null;
      feedback.show("saved");
      await load(value.userId);
      return true;
    } catch (error) {
      if (epoch === session.epoch.value) {
        grantFailure.value = normalizeFailure(error);
        await load(value.userId);
        feedback.show("failed");
      }
      return false;
    } finally {
      if (epoch === session.epoch.value) saving.value = false;
    }
  }
  watch(session.epoch, () => {
    intent.value = null;
    grantFailure.value = null;
    saving.value = false;
  });
  onBeforeUnmount(() => {
    state.value.request++;
    intent.value = null;
  });
  return {
    state: readonly(state),
    intent: readonly(intent),
    saving: readonly(saving),
    grantFailure: readonly(grantFailure),
    load,
    preview,
    close,
    confirm,
  };
}
