import {
  createReviewSetupActions,
  createReviewSetupState,
} from "@application/review/range-setup";

const coordinators = new WeakMap<
  object,
  ReturnType<typeof createReviewSetupActions>
>();

export function useReviewSetupStore() {
  const app = useNuxtApp();
  const session = useSessionStore();
  const state = usePrivateState("review-setup", createReviewSetupState);
  let actions = coordinators.get(app);
  if (!actions) {
    actions = createReviewSetupActions({
      state: () => state.value,
      api: app.$api,
      epoch: () => session.epoch.value,
      isLearner: () => session.isLearner.value,
      refreshSecurity: session.refreshSecurityContext,
      authenticationRequired: session.invalidate,
    });
    coordinators.set(app, actions);
  }
  return { state: readonly(state), ...actions };
}
