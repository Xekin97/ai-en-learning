import type { DeepReadonly } from "vue";
import type {
  AdminDetailState,
  ReaderState,
} from "@application/admin/user-detail";
import type {
  GroupCode,
  MeaningLanguage,
  PassageLength,
  Scenario,
} from "@application/shared/models";
import type { Translate } from "@presentation/auth/auth-gate-presenter";
export interface AdminDetailFormat {
  t: Translate;
  date: (value: string) => string;
  integer: (value: number) => string;
  group: (value: GroupCode) => string;
  meaning: (value: MeaningLanguage) => string;
  scenario: (value: Scenario) => string;
  length: (value: PassageLength) => string;
}
export function presentAdminUserDetail(
  state: DeepReadonly<AdminDetailState>,
  f: AdminDetailFormat,
) {
  const user = state.status === "ready" ? state.user : null;
  return {
    username: user?.username ?? "",
    ready: !!user,
    loading: state.status === "loading",
    failure: state.failure,
    canRetry: state.failure?.retryable === true,
    mutationFailure: state.mutationFailure,
    saving: state.mutation === "saving",
    canManage: user?.role === "learner",
    meta: user
      ? f.t(user.role === "learner" ? "admin.learner" : "admin.role") +
        " · " +
        f.t("admin.createdAt", { date: f.date(user.createdAt) })
      : "",
    rows: user
      ? [
          {
            label: f.t("admin.group"),
            value: user.planCode
              ? f.group(user.planCode)
              : f.t("admin.notApplicable"),
          },
          {
            label: f.t("admin.availableQuota"),
            value:
              user.generationQuota.kind === "limited"
                ? f.integer(user.generationQuota.remaining)
                : f.t(
                    user.generationQuota.kind === "unlimited"
                      ? "admin.quotaUnlimited"
                      : "admin.notApplicable",
                  ),
          },
          {
            label: f.t("admin.learningCount"),
            value: f.integer(user.learningBatchCount),
          },
          {
            label: f.t("admin.loginMethod"),
            value: f.t("admin.usernamePassword"),
          },
        ]
      : [],
    libraryLoading: state.libraryStatus === "loading",
    libraryFailure: state.libraryFailure,
    batches: state.library.items.map((batch) => ({
      id: batch.id,
      title: batch.entries.join(" · "),
      meta:
        f.t("library.joinedAt", { date: f.date(batch.savedAt) }) +
        " · " +
        f.scenario(batch.scenario) +
        " · " +
        f.t(
          batch.participatesInRangeReview
            ? "library.included"
            : "library.paused",
        ),
      label: f.t("admin.readonlyOpen") + " " + batch.entries.join(", "),
    })),
  };
}
export function splitReaderParagraphs(passage: string) {
  const parts = passage.split(/(\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*)/u);
  return parts.flatMap((text, index) =>
    index % 2 ? [] : [{ text, separator: index ? parts[index - 1]! : "" }],
  );
}

export function presentAdminBatchReader(
  reader: DeepReadonly<ReaderState>,
  username: string,
  f: AdminDetailFormat,
) {
  const batch = reader.kind === "ready" ? reader.batch : null;
  return {
    kind: reader.kind,
    title: f.t("reader.title"),
    badge: f.t("admin.readonly"),
    close: f.t("common.close"),
    closeLabel: f.t("reader.close"),
    username,
    saved: batch ? f.t("reader.saved") + " " + f.date(batch.savedAt) : "",
    savedAt: batch?.savedAt ?? "",
    bodyLabel: f.t("reader.story"),
    wordsLabel: f.t("reader.words"),
    tagsLabel: f.t("reader.themes"),
    loading: f.t("reader.loading"),
    error: f.t("reader.error"),
    errorHint: f.t("reader.retryHint"),
    unavailable: f.t("reader.unavailable"),
    unavailableHint: f.t("reader.unavailableHint"),
    retry: f.t("reader.retry"),
    language: batch
      ? ({ zh: "zh-CN", en: "en", ja: "ja" } as const)[
          batch.configuration.meaningLanguage
        ]
      : "en",
    metadata: batch
      ? [
          { label: f.t("create.model"), value: batch.configuration.modelName },
          {
            label: f.t("create.meaningLanguage"),
            value: f.meaning(batch.configuration.meaningLanguage),
          },
          {
            label: f.t("create.scenario"),
            value: f.scenario(batch.configuration.scenario),
          },
          {
            label: f.t("create.length"),
            value: f.length(batch.configuration.length),
          },
        ]
      : [],
    tags: batch?.tags ?? [],
    paragraphs: splitReaderParagraphs(batch?.passage ?? ""),
    words:
      batch?.targets.map((word) => ({
        entry: word.entry,
        meaning: word.entryMeaning,
        phrase: word.hintPhrase,
      })) ?? [],
  };
}
export type AdminBatchReaderViewModel = ReturnType<
  typeof presentAdminBatchReader
>;
