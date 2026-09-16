<script setup lang="ts">
import type { AdminBatchReaderViewModel } from "@presentation/admin/admin-user-detail-presenter";
const props = defineProps<{ view: AdminBatchReaderViewModel }>();
const emit = defineEmits<{ close: []; retry: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const heading = ref<HTMLElement | null>(null);
function backdrop(event: MouseEvent) {
  const el = dialog.value;
  if (!el || event.target !== el) return;
  const bounds = el.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    emit("close");
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const targets = [
    ...(dialog.value?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex="0"]',
    ) ?? []),
  ];
  const first = targets[0],
    last = targets.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === heading.value)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function release() {
  dialog.value?.close();
  document.body.classList.remove("has-reader-dialog");
}
onMounted(() => {
  document.body.classList.add("has-reader-dialog");
  dialog.value?.showModal();
  heading.value?.focus();
});
onBeforeUnmount(release);
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="reader-dialog"
      aria-labelledby="reader-dialog-title"
      @cancel.prevent="emit('close')"
      @click="backdrop"
      @keydown="trapFocus"
    >
      <div class="reader-content">
        <header class="dialog-header reader-header">
          <div>
            <div class="reader-title-row">
              <h2 id="reader-dialog-title" ref="heading" tabindex="-1">
                {{ props.view.title }}
              </h2>
              <span class="status-badge status-info">{{
                props.view.badge
              }}</span>
            </div>
            <p
              v-if="props.view.username || props.view.saved"
              class="reader-context"
            >
              <span>{{ props.view.username }}</span
              ><time v-if="props.view.saved" :datetime="props.view.savedAt">{{
                props.view.saved
              }}</time>
            </p>
          </div>
          <button
            class="button button-quiet reader-close"
            type="button"
            :aria-label="props.view.closeLabel"
            @click="emit('close')"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <div
          class="dialog-body reader-body"
          tabindex="0"
          role="region"
          :aria-label="props.view.bodyLabel"
        >
          <div
            v-if="props.view.kind === 'loading'"
            class="reader-state"
            role="status"
            aria-busy="true"
          >
            <span class="spinner" aria-hidden="true" />
            <p>{{ props.view.loading }}</p>
            <div class="reader-skeleton" aria-hidden="true">
              <i /><i /><i /><i />
            </div>
          </div>
          <div
            v-else-if="
              props.view.kind === 'failed' || props.view.kind === 'unavailable'
            "
            class="reader-state"
            :role="props.view.kind === 'failed' ? 'alert' : 'status'"
          >
            <AppIcon name="info" />
            <h3>
              {{
                props.view.kind === "failed"
                  ? props.view.error
                  : props.view.unavailable
              }}
            </h3>
            <p>
              {{
                props.view.kind === "failed"
                  ? props.view.errorHint
                  : props.view.unavailableHint
              }}
            </p>
            <button
              v-if="props.view.kind === 'failed'"
              class="button button-secondary"
              @click="emit('retry')"
            >
              {{ props.view.retry }}
            </button>
          </div>
          <template v-else-if="props.view.kind === 'ready'">
            <dl class="reader-metadata">
              <div v-for="row in props.view.metadata" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
            <section class="reader-story" aria-labelledby="reader-story-title">
              <h3 id="reader-story-title">{{ props.view.bodyLabel }}</h3>
              <div class="passage-tags">
                <span class="passage-tags-label">{{
                  props.view.tagsLabel
                }}</span>
                <div class="chip-list">
                  <span
                    v-for="(tag, i) in props.view.tags"
                    :key="i"
                    class="tag tag-passage"
                    :lang="props.view.language"
                    >{{ tag }}</span
                  >
                </div>
              </div>
              <div class="reading-passage reader-passage" lang="en">
                <p
                  v-for="(paragraph, index) in props.view.paragraphs"
                  :key="index"
                  v-text="paragraph.text"
                />
              </div>
            </section>
            <section
              class="reader-resources"
              aria-labelledby="reader-words-title"
            >
              <h3 id="reader-words-title">{{ props.view.wordsLabel }}</h3>
              <dl class="reader-word-list">
                <div
                  v-for="word in props.view.words"
                  :key="word.entry"
                  class="reader-word"
                >
                  <dt lang="en">{{ word.entry }}</dt>
                  <dd>
                    <p :lang="props.view.language">{{ word.meaning }}</p>
                    <p class="reader-phrase" lang="en">{{ word.phrase }}</p>
                  </dd>
                </div>
              </dl>
            </section>
          </template>
        </div>
        <footer class="dialog-footer">
          <button
            type="button"
            class="button button-secondary"
            @click="emit('close')"
          >
            {{ props.view.close }}
          </button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>
