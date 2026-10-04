import type {
  ShopItemModel,
  OwnedItemModel,
  ActivationPreviewModel,
  RefundPreviewModel,
  MakeupPreviewModel,
} from "@application/benefits/models";
import type { CheckinModel } from "@application/growth/models";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
type Preview =
  | { kind: "exchange"; item: ShopItemModel }
  | { kind: "activate"; item: OwnedItemModel; value: ActivationPreviewModel }
  | { kind: "refund"; item: OwnedItemModel; value: RefundPreviewModel }
  | {
      kind: "makeup";
      item: OwnedItemModel;
      day: string | null;
      calendar: CheckinModel;
      value: MakeupPreviewModel | null;
    };
export function useBenefitsStore() {
  const api = useNuxtApp().$api,
    identity = useSessionStore(),
    feedback = useFeedbackStore(),
    account = useAccountStore();
  const state = usePrivateState("benefits", () => ({
    shop: [] as ShopItemModel[],
    items: [] as OwnedItemModel[],
    balance: null as string | null,
    nextShop: null as string | null,
    nextItems: null as string | null,
    pending: false,
    failure: null as AppFailure | null,
    request: 0,
  }));
  const preview = shallowRef<Preview | null>(null),
    busy = ref(false),
    previewFailure = shallowRef<AppFailure | null>(null);
  const intentKey = ref<string | null>(null);
  let previewRevision = 0,
    disposed = false;
  onScopeDispose(() => {
    disposed = true;
    previewRevision++;
    if (preview.value) api.clearBenefitPreview(preview.value.item.id);
    preview.value = null;
    intentKey.value = null;
  });
  watch(identity.epoch, () => {
    previewRevision++;
    preview.value = null;
    intentKey.value = null;
    busy.value = false;
    previewFailure.value = null;
  });
  async function load(shop: boolean, more = false) {
    const epoch = identity.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.failure = null;
    try {
      if (shop) {
        const page = await api.listShop(
          more ? (state.value.nextShop ?? undefined) : undefined,
        );
        if (epoch !== identity.epoch.value || request !== state.value.request)
          return;
        state.value.shop = more
          ? [...state.value.shop, ...page.items]
          : page.items;
        state.value.nextShop = page.nextCursor;
        state.value.balance = page.balance;
      } else {
        const [page, growth] = await Promise.all([
          api.listItems(
            more ? (state.value.nextItems ?? undefined) : undefined,
          ),
          api.getGrowth(),
        ]);
        if (epoch !== identity.epoch.value || request !== state.value.request)
          return;
        state.value.items = more
          ? [...state.value.items, ...page.items]
          : page.items;
        state.value.nextItems = page.nextCursor;
        state.value.balance = growth.points;
      }
    } catch (error) {
      if (epoch === identity.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === identity.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  function close() {
    if (busy.value) return;
    if (preview.value) api.clearBenefitPreview(preview.value.item.id);
    previewRevision++;
    preview.value = null;
    intentKey.value = null;
    previewFailure.value = null;
  }
  async function open(id: string, shop = false) {
    if (busy.value) return;
    const epoch = identity.epoch.value,
      version = ++previewRevision;
    previewFailure.value = null;
    intentKey.value = crypto.randomUUID();
    if (shop) {
      const item = state.value.shop.find((i) => i.id === id);
      if (item?.available) preview.value = { kind: "exchange", item };
      return;
    }
    const item = state.value.items.find((i) => i.id === id);
    if (!item) return;
    busy.value = true;
    try {
      await identity.refreshSecurityContext();
      if (disposed || epoch !== identity.epoch.value) return;
      let value: Preview;
      if (item.state === "refundable")
        value = { kind: "refund", item, value: await api.previewRefund(id) };
      else if (item.kind === "makeup") {
        const growth = await api.getGrowth(),
          date = new Date(growth.learningDay + "T00:00:00Z");
        date.setUTCDate(date.getUTCDate() - 30);
        value = {
          kind: "makeup",
          item,
          day: null,
          value: null,
          calendar: await api.getCheckins(
            date.toISOString().slice(0, 10),
            growth.learningDay,
          ),
        };
      } else
        value = {
          kind: "activate",
          item,
          value: await api.previewActivation(id),
        };
      if (epoch === identity.epoch.value && version === previewRevision)
        preview.value = value;
    } catch (error) {
      if (epoch === identity.epoch.value && version === previewRevision)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === identity.epoch.value) busy.value = false;
    }
  }
  async function chooseDay(day: string) {
    const current = preview.value;
    if (
      current?.kind !== "makeup" ||
      !current.calendar.days.some((d) => d.day === day && d.canMakeup) ||
      busy.value
    )
      return;
    const epoch = identity.epoch.value,
      version = ++previewRevision;
    busy.value = true;
    previewFailure.value = null;
    try {
      const value = await api.previewMakeup(current.item.id, day);
      if (epoch === identity.epoch.value && version === previewRevision) {
        preview.value = { ...current, day, value };
        intentKey.value = crypto.randomUUID();
      }
    } catch (error) {
      if (epoch === identity.epoch.value)
        previewFailure.value = normalizeFailure(error);
    } finally {
      if (epoch === identity.epoch.value) busy.value = false;
    }
  }
  async function confirm() {
    const current = preview.value;
    if (!current || busy.value || !intentKey.value) return;
    const epoch = identity.epoch.value;
    busy.value = true;
    previewFailure.value = null;
    try {
      await identity.refreshSecurityContext();
      if (disposed || epoch !== identity.epoch.value) return;
      if (current.kind === "exchange")
        await api.exchangeItem(current.item.id, 1, intentKey.value);
      else if (current.kind === "activate")
        await api.activateItem(
          current.item.id,
          current.value.discardedTrial !== null,
          intentKey.value,
        );
      else if (current.kind === "refund")
        await api.refundItem(current.item.id, intentKey.value);
      else if (current.day && current.value?.canUse)
        await api.makeupDay(current.item.id, current.day, intentKey.value);
      else return;
      if (disposed || epoch !== identity.epoch.value) return;
      api.clearBenefitPreview(current.item.id);
      preview.value = null;
      intentKey.value = null;
      feedback.show(
        current.kind === "exchange"
          ? "card.redeemed"
          : current.kind === "refund"
            ? "card.refundok"
            : current.kind === "makeup"
              ? "makeup.done"
              : "card.used",
      );
      await load(current.kind === "exchange");
      await account.load(true);
    } catch (error) {
      if (disposed || epoch !== identity.epoch.value) return;
      const failure = normalizeFailure(error);
      await load(current.kind === "exchange");
      if (disposed || epoch !== identity.epoch.value) return;
      previewFailure.value = failure;
      if (failure.code === "preview_stale") {
        api.clearBenefitPreview(current.item.id);
        intentKey.value = null;
      }
    } finally {
      if (epoch === identity.epoch.value) busy.value = false;
    }
  }
  async function repreview() {
    const current = preview.value;
    if (!current) return;
    const id = current.item.id,
      shop = current.kind === "exchange";
    close();
    await open(id, shop);
  }
  return {
    state: readonly(state),
    preview: readonly(preview),
    busy: readonly(busy),
    previewFailure: readonly(previewFailure),
    needsPreview: computed(
      () => preview.value !== null && intentKey.value === null,
    ),
    load,
    open,
    close,
    chooseDay,
    confirm,
    repreview,
  };
}
