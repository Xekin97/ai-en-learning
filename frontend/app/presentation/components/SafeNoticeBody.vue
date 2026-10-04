<script setup lang="ts">
import type { NoticeModel } from "@application/notices/models";
defineProps<{ notice: NoticeModel }>();
</script>
<template>
  <!-- Backend allowlist-sanitized notice HTML; this is the sole authorized HTML sink. -->
  <!-- eslint-disable vue/no-v-html -->
  <!-- This sole HTML sink accepts the backend's sanitized notice projection, never user input or Markdown. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div
    class="notice-body markdown"
    :lang="notice.contentLocale"
    v-html="notice.safeBody"
  />
</template>
