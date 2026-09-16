<script setup lang="ts">
import { useAdminUserSearchController } from "@presentation/controllers/admin-user-search";

definePageMeta({
  middleware: "admin",
  layout: "admin",
  scrollToTop: (to, from) =>
    !(
      to.path === "/admin/users" &&
      typeof to.query.focus === "string" &&
      to.query.focus.length > 0 &&
      /^\/admin\/users\/[^/]+$/u.test(from.path)
    ),
});
const {
  draftQuery,
  loadMoreButton,
  resultHeading,
  view,
  loadMore,
  rememberPosition,
  retrySearch,
  search,
} = await useAdminUserSearchController();
useLocalizedHead("admin.users");
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
      v-model:draft="draftQuery"
      :pending="view.isInitialLoading"
      @submit="search"
    />

    <section
      v-if="!view.hasSearched"
      class="empty-state card admin-user-empty"
      aria-labelledby="user-search-start-title"
    >
      <span class="empty-symbol" aria-hidden="true">
        <AppIcon name="search" />
      </span>
      <h2 id="user-search-start-title">{{ $t("admin.searchStartTitle") }}</h2>
      <p>{{ $t("admin.searchStartCopy") }}</p>
    </section>

    <section
      v-else-if="view.isInitialLoading"
      class="card admin-user-results"
      aria-busy="true"
      aria-live="polite"
    >
      <header class="card-header">
        <div>
          <h2 class="card-title">{{ $t("admin.searchingTitle") }}</h2>
          <p class="card-subtitle">{{ $t("admin.searchingCopy") }}</p>
        </div>
        <span class="spinner" aria-hidden="true" />
      </header>
      <div class="card-body">
        <div
          v-for="index in 3"
          :key="index"
          class="user-skeleton"
          aria-hidden="true"
        >
          <span /><span /><span />
        </div>
      </div>
    </section>

    <section
      v-else-if="view.showInitialFailure"
      class="card"
      aria-live="polite"
    >
      <div class="card-body">
        <div class="notice notice-danger" role="alert">
          <AppIcon name="alert" />
          <div>
            <strong ref="resultHeading" class="notice-title" tabindex="-1">{{
              $t("admin.searchError")
            }}</strong>
            <span>{{ $t("admin.searchErrorCopy") }}</span>
            <div class="admin-user-retry">
              <button
                class="button button-secondary button-small"
                type="button"
                @click="retrySearch"
              >
                {{ $t("admin.retrySearch") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      v-else-if="view.showResults"
      class="card admin-user-results"
      :aria-busy="view.isAppending"
      aria-labelledby="admin-user-results-title"
    >
      <header class="card-header">
        <div>
          <h2
            id="admin-user-results-title"
            ref="resultHeading"
            class="card-title"
            tabindex="-1"
          >
            {{ $t("admin.searchResults") }}
          </h2>
          <p class="card-subtitle" aria-live="polite">
            {{ view.resultCount }}
          </p>
        </div>
        <span class="helper">{{ $t("admin.sortedByUsername") }}</span>
      </header>
      <div class="admin-user-result-list" role="list">
        <article
          v-for="row in view.rows"
          :key="row.id"
          class="admin-user-result"
          role="listitem"
          :data-result-id="row.id"
        >
          <div class="admin-user-identity">
            <span class="admin-avatar" aria-hidden="true">{{
              row.initial
            }}</span>
            <div>
              <h3 class="user-name">{{ row.username }}</h3>
              <p class="user-meta">{{ row.meta }}</p>
            </div>
          </div>
          <div class="admin-user-plan">
            <span class="helper">{{ $t("admin.group") }}</span>
            <strong>{{ row.plan }}</strong>
          </div>
          <span class="status-badge status-success">{{ row.status }}</span>
          <NuxtLink
            class="button button-secondary button-small"
            :to="row.href"
            :aria-label="row.openLabel"
            :data-user-id="row.id"
            @click="rememberPosition(row.id)"
          >
            {{ $t("admin.view") }}
          </NuxtLink>
        </article>
      </div>
      <footer
        v-if="view.showPagination"
        class="card-footer admin-user-pagination"
      >
        <div>
          <span class="helper">{{ view.shownCount }}</span>
          <p
            v-if="view.showAppendFailure"
            class="admin-user-append-error"
            role="alert"
          >
            {{ $t("admin.appendError") }}
          </p>
        </div>
        <button
          ref="loadMoreButton"
          class="button button-secondary"
          :class="{ 'button-loading': view.isAppending }"
          type="button"
          :disabled="view.isAppending"
          @click="loadMore"
        >
          <span v-if="view.isAppending" class="spinner" aria-hidden="true" />
          {{ view.appendButtonLabel }}
        </button>
      </footer>
    </section>

    <section
      v-else-if="view.showEmpty"
      class="empty-state card admin-user-empty"
      aria-live="polite"
    >
      <span class="empty-symbol" aria-hidden="true">0</span>
      <h2 ref="resultHeading" tabindex="-1">
        {{ $t("admin.noUsers") }}
      </h2>
      <p>{{ $t("admin.noUsersCopy") }}</p>
    </section>
  </div>
</template>
