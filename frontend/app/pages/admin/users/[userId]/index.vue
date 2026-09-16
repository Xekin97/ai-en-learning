<script setup lang="ts">
import { useAdminUserDetailController } from "@presentation/controllers/admin-user-detail";
definePageMeta({
  middleware: "admin",
  layout: "admin",
  key: (route) => String(route.params.userId),
  scrollToTop: (to, from) => to.path !== from.path,
});
const {
  view,
  reader,
  draft,
  query,
  batchId,
  backToResults,
  libraryHeading,
  groupOpen,
  passwordOpen,
  group,
  password,
  confirmation,
  initialize,
  search,
  openReader,
  closeReader,
  openGroup,
  closePassword,
  saveGroup,
  resetPassword,
  retry,
  retryLibrary,
  retryReader,
} = useAdminUserDetailController();
const format = useDisplayFormatters();
const { t } = useI18n();
await initialize();
useHead({ title: () => view.value.username || String(t("admin.users")) });
</script>
<template>
  <div>
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ $t("admin.title") }}</p>
        <h1 class="page-title">{{ $t("admin.users") }}</h1>
        <p class="page-description">{{ $t("admin.usersCopy") }}</p>
      </div>
    </header>
    <AdminUserSearchForm
      v-model:draft="draft"
      :pending="false"
      @submit="search"
    />
    <div class="admin-user-detail-toolbar">
      <NuxtLink class="button button-quiet button-small" :to="backToResults">{{
        $t("admin.backToResults")
      }}</NuxtLink
      ><span v-if="query" class="helper">“{{ query }}”</span>
    </div>
    <AppError :failure="view.failure" />
    <button v-if="view.canRetry" class="button button-secondary" @click="retry">
      {{ $t("common.retry") }}
    </button>
    <div v-if="view.loading" role="status" aria-busy="true">
      {{ $t("common.loading") }}
    </div>
    <div v-if="view.ready" class="admin-grid admin-user-detail-grid">
      <section class="card">
        <header class="card-header">
          <div>
            <h2 class="card-title user-detail-name">{{ view.username }}</h2>
            <p class="card-subtitle">{{ view.meta }}</p>
          </div>
          <span class="status-badge status-success">{{
            $t("admin.normal")
          }}</span>
        </header>
        <div class="card-body">
          <dl class="definition-list">
            <div v-for="row in view.rows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </div>
        <footer v-if="view.canManage" class="card-footer">
          <button
            class="button button-secondary"
            :disabled="view.saving"
            @click="openGroup"
          >
            {{ $t("admin.changeGroup") }}</button
          ><button
            class="button button-danger-quiet"
            :disabled="view.saving"
            @click="passwordOpen = true"
          >
            {{ $t("admin.resetPassword") }}
          </button>
        </footer>
      </section>
      <section class="card">
        <header class="card-header">
          <div>
            <h2 ref="libraryHeading" class="card-title" tabindex="-1">
              {{ $t("admin.userContent") }}
            </h2>
            <p class="card-subtitle">{{ $t("admin.readonlyCopy") }}</p>
          </div>
          <span class="status-badge status-info">{{
            $t("admin.readonly")
          }}</span>
        </header>
        <div class="card-body">
          <div v-if="view.libraryLoading" role="status">
            {{ $t("common.loading") }}
          </div>
          <template v-else-if="view.libraryFailure"
            ><AppError :failure="view.libraryFailure" /><button
              v-if="view.libraryFailure.retryable"
              class="button button-secondary"
              @click="retryLibrary"
            >
              {{ $t("common.retry") }}
            </button></template
          >
          <div v-else-if="view.batches.length" class="model-list">
            <article
              v-for="batch in view.batches"
              :key="batch.id"
              class="model-row"
            >
              <div>
                <div class="model-name">{{ batch.title }}</div>
                <div class="model-description">{{ batch.meta }}</div>
              </div>
              <button
                class="button button-quiet button-small"
                :aria-label="batch.label"
                @click="openReader(batch.id, $event.currentTarget)"
              >
                {{ $t("admin.readonlyOpen") }}
              </button>
            </article>
          </div>
          <div v-else class="empty-state">
            <span class="empty-symbol" aria-hidden="true"
              ><AppIcon name="book"
            /></span>
            <p>{{ $t("common.empty") }}</p>
          </div>
        </div>
      </section>
    </div>
    <ClientOnly
      ><AdminBatchReaderDialog
        v-if="batchId"
        :view="reader"
        @close="closeReader"
        @retry="retryReader"
      /><template #fallback
        ><p v-if="batchId" role="status">
          {{ $t("reader.loading") }}
        </p></template
      ></ClientOnly
    >
    <AppDialog
      id="change-user-group"
      :open="groupOpen"
      :title="
        $t('admin.changeGroupTitle', {
          username: view.username,
        })
      "
      @close="groupOpen = false"
    >
      <AppError :failure="view.mutationFailure" />
      <form
        id="change-user-group-form"
        class="dialog-form"
        @submit.prevent="saveGroup"
      >
        <label class="field"
          ><span class="field-label">{{ $t("admin.newGroup") }}</span
          ><select v-model="group" class="select-input">
            <option value="basic">{{ format.group("basic") }}</option>
            <option value="pro">{{ format.group("pro") }}</option>
            <option value="plus">{{ format.group("plus") }}</option>
          </select></label
        >
        <div class="notice notice-warning">
          <AppIcon name="alert" />
          <div>{{ $t("admin.changeGroupCopy") }}</div>
        </div>
      </form>
      <template #footer
        ><button
          class="button button-secondary"
          type="button"
          @click="groupOpen = false"
        >
          {{ $t("common.cancel") }}</button
        ><button
          class="button button-primary"
          type="submit"
          form="change-user-group-form"
          :disabled="view.saving || !view.ready"
        >
          {{ $t("admin.changeGroup") }}
        </button></template
      >
    </AppDialog>

    <AppDialog
      id="reset-user-password"
      :open="passwordOpen"
      :title="$t('admin.resetPassword')"
      @close="closePassword"
    >
      <AppError :failure="view.mutationFailure" />
      <form
        id="reset-user-password-form"
        class="dialog-form"
        @submit.prevent="resetPassword"
      >
        <label class="field"
          ><span class="field-label">{{ $t("auth.newPassword") }}</span
          ><input
            v-model="password"
            class="text-input"
            type="password"
            minlength="8"
            required /></label
        ><label class="field"
          ><span class="field-label">{{ $t("auth.confirmPassword") }}</span
          ><input
            v-model="confirmation"
            class="text-input"
            type="password"
            minlength="8"
            required
        /></label>
        <div class="notice notice-warning">
          <AppIcon name="alert" />
          <div>{{ $t("admin.resetPasswordConfirm") }}</div>
        </div>
      </form>
      <template #footer
        ><button
          class="button button-secondary"
          type="button"
          @click="closePassword"
        >
          {{ $t("common.cancel") }}</button
        ><button
          class="button button-primary"
          type="submit"
          form="reset-user-password-form"
          :disabled="view.saving || !password || password !== confirmation"
        >
          {{ $t("admin.resetPassword") }}
        </button></template
      >
    </AppDialog>
  </div>
</template>
