<script setup lang="ts">
import { mergeEdited } from "@application/admin/growth-drafts";
import type { DeepReadonly } from "vue";
import { useAdminNoticesStore } from "@runtime/stores/admin-notices";
import type {
  AdminNoticeInput,
  AdminNoticeModel,
} from "@application/admin/notices";
definePageMeta({ middleware: "admin", layout: "admin" });
const notices = useAdminNoticesStore(),
  session = useSessionStore(),
  { copy, language } = useDesignCopy(),
  format = useDisplayFormatters();
const selected = ref<string | null>(null),
  revision = ref<string | null>(null);
const blank = (): AdminNoticeInput => ({
  title: { zh: null, en: null },
  bodyMarkdown: { zh: null, en: null },
  visible: false,
  remind: false,
  remindOnce: false,
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const fields = (item: DeepReadonly<AdminNoticeInput>): AdminNoticeInput => ({
  title: { ...item.title },
  bodyMarkdown: { ...item.bodyMarkdown },
  visible: item.visible,
  remind: item.remind,
  remindOnce: item.remindOnce,
});
const draft = ref(blank()),
  baseline = ref(blank()),
  remote = ref<AdminNoticeModel | null>(null),
  unknownCreate = ref(false),
  reconciling = ref(false);
const drafts = new Map<
  string,
  {
    value: AdminNoticeInput;
    baseline: AdminNoticeInput;
    revision: string | null;
    remote: AdminNoticeModel | null;
    unknownCreate: boolean;
  }
>();
const previewTitle = ref("");
const previewLocale = ref<"zh-CN" | "en-US">("en-US");
await usePageLoader("admin-notices", () => notices.load());
function select(item?: DeepReadonly<AdminNoticeModel>) {
  drafts.set(selected.value ?? "new", {
    value: clone(draft.value),
    baseline: clone(baseline.value),
    revision: revision.value,
    remote: clone(remote.value),
    unknownCreate: unknownCreate.value,
  });
  selected.value = item?.id ?? null;
  const saved = drafts.get(selected.value ?? "new");
  draft.value = saved ? clone(saved.value) : item ? fields(item) : blank();
  baseline.value = saved ? clone(saved.baseline) : clone(draft.value);
  revision.value = saved?.revision ?? item?.revision ?? null;
  remote.value = saved ? clone(saved.remote) : null;
  unknownCreate.value = saved?.unknownCreate ?? false;
  reconciling.value = false;
  notices.closePreview();
}
async function reread() {
  const id = selected.value,
    epoch = session.epoch.value;
  reconciling.value = true;
  try {
    const current = id ? await notices.read(id) : null;
    if (epoch !== session.epoch.value || id !== selected.value) return;
    remote.value = current;
    reconciling.value = false;
  } catch {
    /* Retain the original failure and draft until a successful reread. */
  }
}
if (notices.state.value.items[0]) select(notices.state.value.items[0]);
const valid = computed(() => {
  const d = draft.value;
  return (
    (["zh", "en"] as const).some(
      (l) => d.title[l]?.trim() && d.bodyMarkdown[l]?.trim(),
    ) &&
    (["zh", "en"] as const).every(
      (l) =>
        Array.from(d.title[l] ?? "").length <= 200 &&
        new TextEncoder().encode(d.bodyMarkdown[l] ?? "").length <= 65536,
    )
  );
});
async function save() {
  if (!valid.value || unknownCreate.value || reconciling.value) return;
  if (remote.value) {
    draft.value = mergeEdited(
      baseline.value,
      clone(draft.value),
      fields(remote.value),
    );
    baseline.value = fields(remote.value);
    revision.value = remote.value.revision;
    remote.value = null;
  }
  const epoch = session.epoch.value;
  const value: AdminNoticeInput = {
    title: {
      zh: draft.value.title.zh?.trim() || null,
      en: draft.value.title.en?.trim() || null,
    },
    bodyMarkdown: {
      zh: draft.value.bodyMarkdown.zh?.trim()
        ? draft.value.bodyMarkdown.zh
        : null,
      en: draft.value.bodyMarkdown.en?.trim()
        ? draft.value.bodyMarkdown.en
        : null,
    },
    visible: draft.value.visible,
    remind: draft.value.remind,
    remindOnce: draft.value.remindOnce,
  };
  const saved = await notices.save(selected.value, value, revision.value);
  if (epoch !== session.epoch.value) return;
  if (saved) {
    drafts.delete(selected.value ?? "new");
    drafts.delete(saved.id);
    selected.value = saved.id;
    revision.value = saved.revision;
    draft.value = {
      title: { ...saved.title },
      bodyMarkdown: { ...saved.bodyMarkdown },
      visible: saved.visible,
      remind: saved.remind,
      remindOnce: saved.remindOnce,
    };
    baseline.value = clone(draft.value);
  } else if (selected.value) {
    await reread();
  } else if (
    notices.failure.value?.status === null ||
    (notices.failure.value?.status ?? 0) >= 500
  )
    unknownCreate.value = true;
}
async function preview(event: MouseEvent) {
  (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  const locale = language.value === "zh" ? "zh" : "en",
    other = locale === "zh" ? "en" : "zh";
  const chosen = draft.value.bodyMarkdown[locale]?.trim() ? locale : other;
  previewTitle.value = draft.value.title[chosen]?.trim() || copy("preview");
  previewLocale.value = chosen === "zh" ? "zh-CN" : "en-US";
  await notices.preview(draft.value.bodyMarkdown[chosen] ?? "");
}
watch(session.epoch, () => {
  drafts.clear();
  draft.value = blank();
  selected.value = null;
  revision.value = null;
  baseline.value = blank();
  remote.value = null;
  unknownCreate.value = false;
  reconciling.value = false;
});
</script>
<template>
  <div>
    <div class="section-head">
      <div>
        <h1>{{ copy("a.messages") }}</h1>
        <p class="muted">{{ copy("a.messages.desc") }}</p>
      </div>
      <button
        class="btn primary"
        :disabled="notices.saving.value"
        @click="select()"
      >
        {{ copy("newmessage") }}
      </button>
    </div>
    <AppError :failure="notices.state.value.failure" />
    <div class="admin-master-detail">
      <section class="panel admin-records">
        <h2>{{ copy("a.message.list") }}</h2>
        <button
          v-for="item in notices.state.value.items"
          :key="item.id"
          class="admin-record"
          :class="{ selected: selected === item.id }"
          :disabled="notices.saving.value"
          @click="select(item)"
        >
          <strong>{{
            item.title[language] ||
            item.title[language === "zh" ? "en" : "zh"] ||
            copy("a.untitled")
          }}</strong
          ><span
            >{{ format.dateTime(item.publishedAt) }} ·
            {{ copy(item.visible ? "visible" : "a.hidden")
            }}{{ item.remind ? " · " + copy("remind") : "" }}</span
          ></button
        ><button
          v-if="notices.state.value.nextCursor"
          class="btn"
          :disabled="notices.state.value.pending"
          @click="notices.load(true)"
        >
          {{ copy("a.more") }}
        </button>
      </section>
      <form class="panel" @submit.prevent="save">
        <AppError :failure="notices.failure.value" />
        <dl v-if="remote" class="admin-facts notice">
          <template v-for="locale in ['zh', 'en'] as const" :key="locale"
            ><div>
              <dt>{{ copy("name." + locale) }}</dt>
              <dd>{{ remote.title[locale] || "—" }}</dd>
            </div>
            <div>
              <dt>{{ copy("markdown") }}</dt>
              <dd style="white-space: pre-wrap">
                {{ remote.bodyMarkdown[locale] || "—" }}
              </dd>
            </div></template
          >
          <div>
            <dt>{{ copy("visible") }}</dt>
            <dd>{{ copy(remote.visible ? "visible" : "a.hidden") }}</dd>
          </div>
          <div>
            <dt>{{ copy("remind") }}</dt>
            <dd>{{ copy(remote.remind ? "enabled" : "disabled") }}</dd>
          </div>
          <div>
            <dt>{{ copy("remind.once") }}</dt>
            <dd>{{ copy(remote.remindOnce ? "enabled" : "disabled") }}</dd>
          </div>
        </dl>
        <button v-if="reconciling" class="btn" type="button" @click="reread">
          {{ copy("retry") }}
        </button>
        <button
          v-if="unknownCreate"
          class="btn"
          type="button"
          @click="
            unknownCreate = false;
            drafts.delete('new');
            draft = blank();
            baseline = blank();
          "
        >
          {{ copy("cancel") }}
        </button>
        <fieldset :disabled="notices.saving.value">
          <div class="form-grid">
            <label
              v-for="locale in ['zh', 'en'] as const"
              :key="locale"
              class="field"
              ><span>{{ copy("name." + locale) }}</span
              ><input v-model="draft.title[locale]"
            /></label>
          </div>
          <div class="form-grid">
            <label
              v-for="locale in ['zh', 'en'] as const"
              :key="locale"
              class="field"
              ><span>{{ copy("markdown") }} · {{ locale }}</span
              ><textarea v-model="draft.bodyMarkdown[locale]" />
            </label>
          </div>
          <div class="actions">
            <label class="check"
              ><input v-model="draft.visible" type="checkbox" />{{
                copy("visible")
              }}</label
            ><label class="check"
              ><input v-model="draft.remind" type="checkbox" />{{
                copy("remind")
              }}</label
            >
            <label class="check"
              ><input v-model="draft.remindOnce" type="checkbox" />{{
                copy("remind.once")
              }}</label
            >
          </div>
          <p class="muted">{{ copy("remind.once.help") }}</p>
          <p class="muted">{{ copy("a.message.rule") }}</p>
          <div class="actions form-footer">
            <button class="btn" type="button" @click="preview">
              {{ copy("preview") }}</button
            ><button
              class="btn primary"
              :disabled="!valid || unknownCreate || reconciling"
            >
              {{ copy("save") }}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
    <NoticeReadingDialog
      id="admin-notice-preview"
      :open="notices.safePreview.value !== null"
      :title="previewTitle"
      @close="notices.closePreview"
      ><SafeNoticeBody
        v-if="notices.safePreview.value !== null"
        :notice="{
          id: 'preview',
          title: '',
          safeBody: notices.safePreview.value,
          contentLocale: previewLocale,
          remind: false,
          remindOnce: false,
          publishedAt: '',
          revision: '',
        }"
    /></NoticeReadingDialog>
  </div>
</template>
