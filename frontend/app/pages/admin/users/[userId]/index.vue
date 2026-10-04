<script setup lang="ts">
import { useAdminUserBenefitsStore } from "@runtime/stores/admin-user-benefits";
import { useAdminUserDetailController } from "@presentation/controllers/admin-user-detail";
import type { QuotaModel } from "@application/shared/models";
definePageMeta({
  middleware: "admin",
  layout: "admin",
  key: (route) => String(route.params.userId),
  scrollToTop: (to, from) => to.path !== from.path,
});
const {
  detail,
  userId,
  view,
  batchId,
  backToResults,
  libraryHeading,
  groupOpen,
  passwordOpen,
  group,
  password,
  confirmation,
  initialize,
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
const extra = useAdminUserBenefitsStore(),
  format = useDisplayFormatters(),
  { copy } = useDesignCopy();
const route = useRoute();
const tab = ref<"identity" | "growth" | "points" | "learning">("identity"),
  points = ref(""),
  reason = ref("");
onMounted(() => {
  if (route.hash === "#points") tab.value = "points";
});
watch(
  () => route.hash,
  (hash) => {
    if (hash === "#points") tab.value = "points";
  },
);
const user = computed(() => detail.state.value.user),
  reading = computed(() =>
    detail.state.value.reader.kind === "ready"
      ? detail.state.value.reader.batch
      : null,
  );
const ledgerLabels: Record<string, string> = {
  admin_grant: "a.source.manual",
  checkin: "a.source.signin",
  exchange: "a.source.redeem",
  level_reward: "levelrewards",
  achievement_reward: "achievements",
  retirement_refund: "refund",
  item_refund: "refund",
  makeup: "makeup",
};
const ledgerLabel = (kind: string) => copy(ledgerLabels[kind] ?? "a.source");
const quota = (value: QuotaModel | null | undefined) =>
  !value
    ? "—"
    : value.kind === "unlimited"
      ? copy("a.plan.unlimited")
      : String(value.remaining);
await initialize();
if (user.value?.role === "learner")
  await usePageLoader("user-benefits:" + userId, () => extra.load(userId));
useHead({ title: () => user.value?.username ?? copy("a.users") });
function previewGrant() {
  if (
    !/^[1-9]\d*$/.test(points.value) ||
    BigInt(points.value) > 9223372036854775807n ||
    !reason.value.trim() ||
    Array.from(reason.value).length > 200
  )
    return;
  extra.preview(userId, points.value, reason.value);
}
async function confirmGrant() {
  if (await extra.confirm()) {
    points.value = "";
    reason.value = "";
    await detail.readUser(userId);
  }
}
async function changeGroup() {
  await saveGroup();
  if (!groupOpen.value) await extra.load(userId);
}
</script>
<template>
  <div>
    <div class="section-head">
      <h1>{{ copy("a.users") }}</h1>
      <NuxtLink class="btn" :to="backToResults">{{
        copy("a.users.back")
      }}</NuxtLink>
    </div>
    <AppError :failure="view.failure" /><button
      v-if="view.canRetry"
      class="btn"
      @click="retry"
    >
      {{ copy("a.retry") }}
    </button>
    <p v-if="view.loading" role="status">{{ $t("common.loading") }}</p>
    <template v-if="view.ready && user"
      ><div class="admin-user-banner">
        <div>
          <span class="avatar">{{
            (user.nickname || user.username).slice(0, 1)
          }}</span
          ><strong>{{ user.nickname || user.username }}</strong
          ><span>@{{ user.username }}</span>
        </div>
        <span class="pill">{{ copy("a.role." + user.role) }}</span>
      </div>
      <div class="tabs">
        <button
          v-for="key in user.role === 'learner'
            ? (['identity', 'growth', 'points', 'learning'] as const)
            : (['identity'] as const)"
          :key="key"
          class="btn"
          :class="{ selected: tab === key }"
          @click="tab = key"
        >
          {{ copy("a.user." + key) }}
        </button>
      </div>
      <section v-if="tab === 'identity'" class="panel">
        <dl class="admin-facts">
          <div>
            <dt>{{ copy("a.username") }}</dt>
            <dd>{{ user.username }}</dd>
          </div>
          <div>
            <dt>{{ copy("a.role") }}</dt>
            <dd>{{ copy("a.role." + user.role) }}</dd>
          </div>
          <div>
            <dt>{{ copy("a.baseplan") }}</dt>
            <dd>{{ user.planCode ? copy("a.plan." + user.planCode) : "—" }}</dd>
          </div>
          <div>
            <dt>{{ copy("a.created") }}</dt>
            <dd>{{ format.dateTime(user.createdAt) }}</dd>
          </div>
          <div>
            <dt>{{ copy("a.lastlogin") }}</dt>
            <dd>
              {{ user.lastLoginAt ? format.dateTime(user.lastLoginAt) : "—" }}
            </dd>
          </div>
          <div>
            <dt>{{ copy("a.lastlearn") }}</dt>
            <dd>
              {{
                user.lastLearningAt ? format.dateTime(user.lastLearningAt) : "—"
              }}
            </dd>
          </div>
          <div v-if="user.role === 'learner'">
            <dt>{{ copy("a.quota") }}</dt>
            <dd>{{ quota(extra.state.value.benefits?.basePlan.quota) }}</dd>
          </div>
        </dl>
        <AppError :failure="extra.state.value.failure" /><button
          v-if="extra.state.value.failure"
          class="btn"
          @click="extra.load(userId)"
        >
          {{ copy("retry") }}
        </button>
        <div v-if="view.canManage" class="actions">
          <button class="btn" :disabled="view.saving" @click="openGroup">
            {{ copy("a.user.plan") }}</button
          ><button
            class="btn danger"
            :disabled="view.saving"
            @click="passwordOpen = true"
          >
            {{ copy("a.user.password") }}
          </button>
        </div>
        <p v-else class="notice">{{ copy("a.user.adminreadonly") }}</p>
      </section>
      <section v-else-if="tab === 'growth' && user.growth" class="panel">
        <dl class="admin-facts">
          <div
            v-for="row in [
              { label: 'a.level', value: user.growth.levelNumber },
              { label: 'a.xp', value: user.growth.experience },
              { label: 'a.mastered', value: user.growth.masteredTotal },
              { label: 'a.saved', value: user.growth.savedTotal },
            ]"
            :key="row.label"
          >
            <dt>{{ copy(row.label) }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <p class="notice">{{ copy("a.growth.readonly") }}</p>
        <NuxtLink to="/admin/growth" class="btn">{{
          copy("a.growth.rules")
        }}</NuxtLink>
      </section>
      <section v-else-if="tab === 'points'" class="panel">
        <p>
          <strong>{{ user.username }}</strong> ·
          {{
            copy("pricevalue", {
              count: extra.state.value.balance ?? user.growth?.points ?? "—",
            })
          }}
        </p>
        <p class="notice">{{ copy("credit.rule") }}</p>
        <AppError :failure="extra.state.value.failure" />
        <form @submit.prevent="previewGrant">
          <div class="form-grid">
            <label class="field"
              ><span>{{ copy("amount") }}</span
              ><input
                v-model="points"
                inputmode="numeric"
                pattern="[1-9][0-9]*"
                required
                :disabled="extra.saving.value" /></label
            ><label class="field"
              ><span>{{ copy("reason") }}</span
              ><input v-model="reason" required :disabled="extra.saving.value"
            /></label>
          </div>
          <button
            class="btn primary"
            :disabled="
              extra.saving.value ||
              !reason.trim() ||
              Array.from(reason).length > 200
            "
          >
            {{ copy("a.supplement") }}
          </button>
        </form>
        <h2 class="section">{{ copy("a.ledger") }}</h2>
        <div class="table-wrap" tabindex="0">
          <table class="data-table">
            <thead>
              <tr>
                <th
                  v-for="key in ['a.time', 'a.source', 'a.amount', 'a.balance']"
                  :key="key"
                >
                  {{ copy(key) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in extra.state.value.ledger" :key="row.id">
                <td>{{ format.dateTime(row.createdAt) }}</td>
                <td>
                  {{ ledgerLabel(row.kind)
                  }}<small v-if="row.adminUsername" class="admin-cell-copy">{{
                    row.adminUsername
                  }}</small>
                </td>
                <td>{{ row.delta }}</td>
                <td>{{ row.balanceAfter }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <button
          v-if="extra.state.value.nextCursor"
          class="btn"
          :disabled="extra.state.value.pending"
          @click="extra.load(userId, true)"
        >
          {{ copy("a.more") }}
        </button>
      </section>
      <section v-else-if="tab === 'learning'" class="panel">
        <div class="section-head">
          <h2 ref="libraryHeading" tabindex="-1">{{ copy("a.learning") }}</h2>
          <span class="pill">{{ copy("a.readonly") }}</span>
        </div>
        <AppError :failure="view.libraryFailure" /><button
          v-if="view.libraryFailure"
          class="btn"
          @click="retryLibrary"
        >
          {{ copy("retry") }}
        </button>
        <p v-if="view.libraryLoading" role="status">
          {{ $t("common.loading") }}
        </p>
        <p v-else-if="!detail.state.value.library.items.length" class="notice">
          {{ copy("empty") }}
        </p>
        <article
          v-for="batch in detail.state.value.library.items"
          :key="batch.id"
          class="admin-library-row"
        >
          <div>
            <h3>{{ batch.title }}</h3>
            <p>{{ batch.entries.join(" · ") }}</p>
            <small
              >{{ copy("a.savedat") }} {{ format.dateTime(batch.savedAt) }} ·
              {{ batch.tags.join(" · ") }} ·
              {{
                copy(
                  batch.participatesInRangeReview ? "a.included" : "a.paused",
                )
              }}</small
            >
          </div>
          <button
            class="btn small"
            @click="openReader(batch.id, $event.currentTarget)"
          >
            {{ copy("a.reader") }}
          </button>
        </article>
        <button
          v-if="detail.state.value.library.hasMore"
          class="btn"
          :disabled="view.libraryLoading"
          @click="detail.readLibrary(userId, true)"
        >
          {{ copy("a.more") }}
        </button>
      </section>
    </template>
    <AppDialog
      id="admin-user-reader"
      :open="batchId !== null"
      :title="copy('a.reader')"
      @close="closeReader"
      ><span class="pill">{{ copy("a.readonly") }}</span>
      <p>
        {{ user?.username
        }}<template v-if="reading">
          · {{ copy("a.savedat") }}
          {{ format.dateTime(reading.savedAt) }}</template
        >
      </p>
      <template v-if="reading"
        ><h3 class="admin-reader-title">{{ reading.title }}</h3>
        <p class="story-text" lang="en">{{ reading.passage }}</p>
        <GenerationSettings :configuration="reading.configuration" />
        <h3>{{ copy("a.tags") }}</h3>
        <p>{{ reading.tags.join(" · ") }}</p>
        <h3>{{ copy("words") }}</h3>
        <div
          v-for="word in reading.targets"
          :key="word.entry"
          class="answer-row"
        >
          <div>
            <strong>{{ word.entry }}</strong>
            <p>{{ word.entryMeaning }}</p>
            <p>{{ word.hintPhrase }}</p>
          </div>
        </div></template
      >
      <p v-else-if="detail.state.value.reader.kind === 'loading'" role="status">
        {{ $t("common.loading") }}
      </p>
      <template v-else
        ><p class="notice">{{ copy("a.reader.unavailable") }}</p>
        <button
          v-if="detail.state.value.reader.kind === 'failed'"
          class="btn"
          @click="retryReader"
        >
          {{ copy("a.retry") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="admin-user-plan"
      :open="groupOpen"
      :title="copy('a.user.plan')"
      @close="!view.saving && (groupOpen = false)"
      ><AppError :failure="view.mutationFailure" /><label class="field"
        ><span>{{ copy("a.baseplan") }}</span
        ><AppSelect v-model="group" :disabled="view.saving">
          <option
            v-for="code in ['basic', 'pro', 'plus']"
            :key="code"
            :value="code"
          >
            {{ copy("a.plan." + code) }}
          </option>
        </AppSelect></label
      >
      <p class="notice warn">{{ copy("base.resetnote") }}</p>
      <template #footer
        ><button class="btn" :disabled="view.saving" @click="groupOpen = false">
          {{ copy("cancel") }}</button
        ><button
          class="btn primary"
          :disabled="view.saving || !view.ready"
          @click="changeGroup"
        >
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="admin-user-password"
      :open="passwordOpen"
      :title="copy('a.user.password')"
      @close="!view.saving && closePassword()"
      ><AppError :failure="view.mutationFailure" />
      <form id="admin-password-form" @submit.prevent="resetPassword">
        <fieldset :disabled="view.saving">
          <label class="field"
            ><span>{{ copy("newpassword") }}</span
            ><input
              v-model="password"
              type="password"
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              required /></label
          ><label class="field"
            ><span>{{ copy("a.password.confirm") }}</span
            ><input
              v-model="confirmation"
              type="password"
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              required
          /></label>
        </fieldset>
        <p
          v-if="confirmation && password !== confirmation"
          class="notice error"
        >
          {{ copy("a.password.mismatch") }}
        </p>
        <p class="notice warn">{{ copy("a.password.effect") }}</p>
      </form>
      <template #footer
        ><button class="btn" :disabled="view.saving" @click="closePassword">
          {{ copy("cancel") }}</button
        ><button
          class="btn danger"
          form="admin-password-form"
          type="submit"
          :disabled="view.saving || password !== confirmation"
        >
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="admin-user-grant"
      :open="extra.intent.value !== null"
      :title="copy('a.supplement')"
      @close="extra.close"
      ><AppError :failure="extra.grantFailure.value" />
      <p>{{ user?.username }} · +{{ extra.intent.value?.points }}</p>
      <p>{{ extra.intent.value?.reason }}</p>
      <p class="notice">{{ copy("credit.rule") }}</p>
      <template #footer
        ><button
          class="btn"
          :disabled="extra.saving.value"
          @click="extra.close"
        >
          {{ copy("cancel") }}</button
        ><button
          class="btn primary"
          :disabled="extra.saving.value"
          @click="confirmGrant"
        >
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
  </div>
</template>
