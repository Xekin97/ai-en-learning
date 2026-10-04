import type {
  ItemDefinitionInput,
  ItemDefinitionModel,
  ItemReferenceModel,
} from "@application/admin/items";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useAdminItemsStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState("admin-items", () => ({
    items: [] as ItemDefinitionModel[],
    request: 0,
    pending: false,
    failure: null as AppFailure | null,
  }));
  const failure = shallowRef<AppFailure | null>(null),
    busy = ref(false),
    references = shallowRef<{
      id: string;
      items: ItemReferenceModel[];
      everIssued: boolean;
      nextCursor: string | null;
    } | null>(null);
  async function load() {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.failure = null;
    try {
      let cursor: string | undefined;
      const items: ItemDefinitionModel[] = [],
        seen = new Set<string>();
      do {
        const page = await api.listItemDefinitions(cursor ? { cursor } : {});
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        items.push(...page.items);
        cursor = page.nextCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw new Error("Repeated item cursor");
        if (cursor) seen.add(cursor);
      } while (cursor);
      state.value.items = items;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function execute<T>(operation: () => Promise<T>) {
    if (busy.value) return null;
    const epoch = session.epoch.value;
    busy.value = true;
    failure.value = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return null;
      const result = await operation();
      if (epoch !== session.epoch.value) return null;
      await load();
      if (epoch !== session.epoch.value) return null;
      feedback.show("saved");
      return result;
    } catch (error) {
      if (epoch === session.epoch.value) {
        failure.value = normalizeFailure(error);
        await load();
        if (epoch === session.epoch.value) feedback.show("failed");
      }
      return null;
    } finally {
      if (epoch === session.epoch.value) busy.value = false;
    }
  }
  let referencesRequest = 0;
  async function readReferences(id: string, more = false) {
    const epoch = session.epoch.value,
      request = ++referencesRequest;
    try {
      const page = await api.listItemReferences(
        id,
        more ? (references.value?.nextCursor ?? undefined) : undefined,
      );
      if (epoch === session.epoch.value && request === referencesRequest)
        references.value = {
          id,
          items:
            more && references.value?.id === id
              ? [...references.value.items, ...page.items]
              : page.items,
          everIssued: page.everIssued,
          nextCursor: page.nextCursor,
        };
    } catch (error) {
      if (epoch === session.epoch.value)
        failure.value = normalizeFailure(error);
    }
  }
  function closeReferences() {
    referencesRequest++;
    references.value = null;
  }
  watch(session.epoch, () => {
    references.value = null;
    failure.value = null;
    busy.value = false;
  });
  return {
    state: readonly(state),
    failure: readonly(failure),
    busy: readonly(busy),
    references: readonly(references),
    load,
    readReferences,
    closeReferences,
    save: (
      id: string | null,
      input: ItemDefinitionInput,
      revision: string | null,
    ) => execute(() => api.saveItemDefinition(id, input, revision)),
    listing: (id: string, listed: boolean, revision: string) =>
      execute(() => api.setItemListing(id, listed, revision)),
    remove: (id: string, revision: string) =>
      execute(async () => {
        await api.deleteItemDefinition(id, revision);
        return true;
      }),
  };
}
