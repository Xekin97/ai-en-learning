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
const { copy } = useDesignCopy(),
  admin = useAdminStore(),
  format = useDisplayFormatters();
</script>

<template>
  <div>
    <div class="section-head">
      <h1>{{ copy("a.users") }}</h1>
    </div>
    <form class="toolbar panel" @submit.prevent="search">
      <label class="field"
        ><span>{{ copy("a.username") }}</span
        ><input
          v-model="draftQuery"
          type="search"
          :disabled="view.isInitialLoading" /></label
      ><button class="btn primary" :disabled="view.isInitialLoading">
        {{ copy("a.search") }}
      </button>
    </form>
    <p v-if="!view.hasSearched" class="muted search-help">
      {{ copy("a.users.start") }}
    </p>
    <p v-else-if="view.isInitialLoading" role="status" aria-busy="true">
      {{ $t("common.loading") }}
    </p>
    <section v-else-if="view.showInitialFailure" class="panel">
      <p ref="resultHeading" class="notice error" tabindex="-1" role="alert">
        {{ copy("a.search.error") }}
      </p>
      <button class="btn" @click="retrySearch">{{ copy("a.retry") }}</button>
    </section>
    <section v-else-if="view.showResults" class="panel">
      <h2 ref="resultHeading" tabindex="-1">{{ copy("a.users.results") }}</h2>
      <div class="table-wrap" tabindex="0">
        <table class="data-table">
          <thead>
            <tr>
              <th
                v-for="key in [
                  'a.username',
                  'a.role',
                  'a.baseplan',
                  'a.created',
                  'a.actions',
                ]"
                :key="key"
              >
                {{ copy(key) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="user in admin.state.value.userSearch.items"
              :key="user.id"
              :data-result-id="user.id"
            >
              <td>
                <strong>{{ user.username }}</strong>
              </td>
              <td>{{ copy("a.role." + user.role) }}</td>
              <td>
                {{ user.planCode ? copy("a.plan." + user.planCode) : "—" }}
              </td>
              <td>{{ format.dateTime(user.createdAt) }}</td>
              <td>
                <NuxtLink
                  class="btn small"
                  :to="{
                    path: '/admin/users/' + user.id,
                    query: view.submittedQuery
                      ? { q: view.submittedQuery }
                      : { all: '1' },
                  }"
                  :data-user-id="user.id"
                  @click="rememberPosition(user.id)"
                  >{{ copy("a.view") }}</NuxtLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="view.showAppendFailure" class="notice error" role="alert">
        {{ copy("a.search.error") }}
      </p>
      <button
        v-if="view.showPagination"
        ref="loadMoreButton"
        class="btn"
        :disabled="view.isAppending"
        @click="loadMore"
      >
        {{ copy(view.showAppendFailure ? "a.retry" : "a.more") }}
      </button>
    </section>
    <p
      v-else-if="view.showEmpty"
      ref="resultHeading"
      class="notice"
      tabindex="-1"
    >
      {{ copy("a.users.empty") }}
    </p>
  </div>
</template>
