import { feedbackFor } from "@runtime/feedback/service";
export function useFeedbackStore() {
  return feedbackFor(useNuxtApp());
}
