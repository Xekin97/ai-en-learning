import { shallowRef } from "vue";
import { registerPrivateState } from "./private-state";

const navigation = new WeakMap<object, ReturnType<typeof createNavigation>>();
function createNavigation() {
  return shallowRef({ scrollY: 0, focusedUserId: "" });
}
export function adminSearchNavigation(app: object) {
  let current = navigation.get(app);
  if (!current) {
    current = createNavigation();
    navigation.set(app, current);
    registerPrivateState(app, "admin-navigation", current, () => ({
      scrollY: 0,
      focusedUserId: "",
    }));
  }
  return current;
}
