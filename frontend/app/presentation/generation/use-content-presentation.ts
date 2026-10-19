import type { DeepReadonly, Ref } from "vue";
import type { ContentDraftStateModel } from "@application/shared/models";
import { paragraphTexts } from "@application/generation/draft-reducer";
import {
  browserFrameDriver,
  ContentTypingScheduler,
  IncrementalParagraphProjection,
  presentationDirective,
} from "./content-presentation";

export function useContentPresentation(
  draft: Ref<DeepReadonly<ContentDraftStateModel>>,
  terminal: Ref<boolean>,
  host?: Ref<HTMLElement | null>,
) {
  const displayed = ref(draft.value.published);
  const projector = new IncrementalParagraphProjection(paragraphTexts);
  const paragraphs = shallowRef(projector.update(displayed.value));
  const typing = ref(false);
  const reduced = ref(false);
  let scheduler: ContentTypingScheduler | null = null;
  let media: MediaQueryList | null = null;
  let motionListener: ((event: MediaQueryListEvent) => void) | null = null;
  let visibilityListener: (() => void) | null = null;
  let active = true;
  let sessionHost: HTMLElement | null = null;
  let presentedDraftId: string | null = null;

  const sync = () => {
    if (!scheduler) {
      displayed.value = draft.value.published;
      paragraphs.value = projector.update(displayed.value);
      return;
    }
    const directive = presentationDirective(
      presentedDraftId,
      draft.value,
      terminal.value,
    );
    presentedDraftId = draft.value.draftId;
    if (directive === "reset" || directive === "reset_type") {
      scheduler.cancel();
      sessionHost = null;
      displayed.value = "";
      paragraphs.value = projector.reset();
      typing.value = false;
      if (directive === "reset_type")
        scheduler.update(
          draft.value.published,
          reduced.value || terminal.value,
        );
    } else if (directive === "type")
      scheduler.update(draft.value.published, reduced.value);
    else {
      scheduler.update(draft.value.published, true);
      scheduler.flush();
    }
  };

  watch(
    () =>
      [
        draft.value.presentationRevision,
        draft.value.draftId,
        draft.value.mode,
      ] as const,
    sync,
    { flush: "sync" },
  );
  watch(
    terminal,
    (value) => {
      if (!value) return;
      scheduler?.update(draft.value.published, true);
      scheduler?.flush();
      typing.value = false;
    },
    { flush: "sync" },
  );

  onMounted(() => {
    media = matchMedia("(prefers-reduced-motion: reduce)");
    reduced.value = media.matches;
    const segmenter =
      typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
    scheduler = new ContentTypingScheduler(
      browserFrameDriver,
      segmenter
        ? (value) => [...segmenter.segment(value)].map((part) => part.segment)
        : null,
      (snapshot) => {
        const currentHost = host?.value ?? null;
        if (
          !active ||
          (sessionHost !== null &&
            (currentHost !== sessionHost || !sessionHost.isConnected)) ||
          (currentHost !== null && !currentHost.isConnected)
        )
          return;
        if (sessionHost === null && currentHost !== null)
          sessionHost = currentHost;
        displayed.value = snapshot.displayed;
        paragraphs.value = projector.update(snapshot.displayed);
        typing.value = snapshot.backlog;
      },
    );
    motionListener = (event: MediaQueryListEvent) => {
      reduced.value = event.matches;
      if (event.matches) {
        scheduler?.update(draft.value.published, true);
        scheduler?.flush();
      }
    };
    media.addEventListener("change", motionListener);
    visibilityListener = () => {
      if (document.hidden) scheduler?.pause();
      else scheduler?.resume(reduced.value);
    };
    document.addEventListener("visibilitychange", visibilityListener);
    if (document.hidden) scheduler.pause();
    sync();
    nextTick(() => {
      const currentHost = host?.value ?? null;
      if (active && currentHost?.isConnected) sessionHost = currentHost;
    });
  });
  onBeforeUnmount(() => {
    active = false;
    scheduler?.cancel();
    if (media && motionListener)
      media.removeEventListener("change", motionListener);
    if (visibilityListener)
      document.removeEventListener("visibilitychange", visibilityListener);
  });

  return {
    displayed: readonly(displayed),
    paragraphs: readonly(paragraphs),
    typing: readonly(typing),
    reduced,
  };
}
