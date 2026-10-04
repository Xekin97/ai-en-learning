<script setup lang="ts">
const session = useSessionStore(),
  notices = useNoticesStore();
const { copy, language } = useDesignCopy();
const format = useDisplayFormatters();
await session.load();
if (session.actor.value?.kind === "account")
  await usePageLoader("notices", () => notices.load());
watch(language, () => {
  if (session.actor.value?.kind === "account") void notices.load();
});
function openNotice(id: string, event: MouseEvent) {
  // Safari does not focus buttons on pointer activation. Preserve the return target.
  (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  void notices.open(id);
}
useHead({ title: () => copy("notices.title") });
</script>
<template>
  <div class="notices-page">
    <div class="page-head">
      <h1>{{ copy("notices.title") }}</h1>
    </div>
    <template v-if="session.actor.value?.kind === 'account'"
      ><AppError :failure="notices.state.value.failure" /><button
        v-if="notices.state.value.failure"
        class="btn"
        type="button"
        @click="notices.load()"
      >
        {{ copy("retry") }}
      </button>
      <ul class="notice-list">
        <li v-for="notice in notices.state.value.items" :key="notice.id">
          <button
            class="notice-entry"
            type="button"
            @click="openNotice(notice.id, $event)"
          >
            <time class="notice-entry-date" :datetime="notice.publishedAt">{{
              format.calendarDate(notice.publishedAt)
            }}</time
            ><span class="notice-entry-copy"
              ><span class="notice-entry-title">{{ notice.title }}</span></span
            ><AppIcon class="notice-entry-arrow" name="arrow-right" />
          </button>
        </li>
      </ul>
      <p
        v-if="
          !notices.state.value.items.length &&
          !notices.state.value.pending &&
          !notices.state.value.failure
        "
        class="empty"
      >
        {{ copy("empty") }}
      </p>
      <button
        v-if="notices.state.value.nextCursor"
        class="btn"
        type="button"
        :disabled="notices.state.value.pending"
        @click="notices.load(true)"
      >
        {{ $t("common.loadMore") }}
      </button></template
    ><NuxtLink v-else class="btn primary" to="/login?redirect=/notices">{{
      copy("login")
    }}</NuxtLink>
  </div>
</template>
