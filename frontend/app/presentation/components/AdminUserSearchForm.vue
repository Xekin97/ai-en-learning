<script setup lang="ts">
defineProps<{ draft: string; pending: boolean }>();
defineEmits<{ "update:draft": [value: string]; submit: [] }>();
</script>
<template>
  <form
    class="card admin-user-search"
    role="search"
    :aria-label="$t('admin.searchUsersLabel')"
    @submit.prevent="$emit('submit')"
  >
    <div class="card-body">
      <div class="toolbar">
        <div class="toolbar-search input-with-icon">
          <AppIcon name="search" />
          <input
            :value="draft"
            class="text-input"
            :placeholder="$t('admin.searchUsers')"
            :aria-label="$t('admin.searchUsers')"
            autocomplete="off"
            :disabled="pending"
            @input="
              $emit('update:draft', ($event.target as HTMLInputElement).value)
            "
          />
        </div>
        <button
          class="button button-primary"
          type="submit"
          :disabled="!draft.trim() || pending"
        >
          {{ pending ? $t("admin.searching") : $t("common.search") }}
        </button>
      </div>
    </div>
  </form>
</template>
