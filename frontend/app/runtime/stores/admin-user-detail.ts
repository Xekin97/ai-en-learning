import {
  createAdminDetailActions,
  createAdminDetailState,
} from "@application/admin/user-detail";
import { registerPrivateState } from "@runtime/session/private-state";

export function useAdminUserDetailStore() {
  const app = useNuxtApp();
  const session = useSessionStore();
  const admin = useAdminStore();
  const state = useState("admin-user-detail", createAdminDetailState);
  registerPrivateState(app, "admin-user-detail", state, createAdminDetailState);
  const actions = createAdminDetailActions({
    state: () => state.value,
    replace: (value) => {
      state.value = value;
    },
    api: app.$api,
    sessionEpoch: () => session.epoch.value,
    refreshSecurity: session.refreshSecurityContext,
    authenticationRequired: () => {
      session.invalidate();
      void navigateTo("/login");
    },
    updateSummary: admin.updateUserSummary,
  });
  return { state: readonly(state), ...actions };
}
