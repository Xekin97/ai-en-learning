<script setup lang="ts">
const props = defineProps<{ shop?: boolean }>(),
  benefits = useBenefitsStore(),
  session = useSessionStore(),
  { copy, language } = useDesignCopy(),
  format = useDisplayFormatters();
const icons = {
  makeup: "calendar-check",
  extra_credit: "ticket",
  model_trial: "bot",
  plan_trial: "gem",
} as const;
const classes = {
  makeup: "makeup",
  extra_credit: "count",
  model_trial: "model",
  plan_trial: "plan",
} as const;
const rules = {
  makeup: "makeup.desc",
  extra_credit: "card.countnote",
  model_trial: "card.modelnote",
  plan_trial: "card.plannote",
};
const preview = computed(() => benefits.preview.value);
const canConfirm = computed(() => {
  const p = preview.value;
  return (
    p &&
    (p.kind === "exchange" ||
      (p.kind === "activate" && p.value.canActivate) ||
      (p.kind === "refund" && p.value.eligible) ||
      (p.kind === "makeup" && p.value?.canUse))
  );
});
if (session.isLearner.value)
  await usePageLoader(props.shop ? "exchange" : "items", () =>
    benefits.load(!!props.shop),
  );
let localeChanged = false;
watch(language, () => {
  localeChanged = true;
  if (!benefits.busy.value) {
    benefits.close();
    localeChanged = false;
  }
  void benefits.load(!!props.shop);
});
watch(benefits.busy, (busy) => {
  if (!busy && localeChanged) {
    benefits.close();
    localeChanged = false;
  }
});
onBeforeUnmount(() => benefits.close());
</script>
<template>
  <AccountPage
    ><div class="page-head">
      <div>
        <h1>{{ copy(shop ? "shop.title" : "bag.title") }}</h1>
        <p>{{ copy(shop ? "shop.desc" : "bag.desc") }}</p>
      </div>
      <div class="account-balance">
        <AppIcon name="diamond" />
        <div>
          <span>{{ copy("account.balance") }}</span
          ><strong>{{ benefits.state.value.balance ?? "—" }}</strong>
        </div>
      </div>
    </div>
    <AppError :failure="benefits.state.value.failure" /><button
      v-if="benefits.state.value.failure"
      class="btn"
      @click="benefits.load(!!shop)"
    >
      {{ copy("retry") }}
    </button>
    <div class="account-items" :class="shop ? 'account-shop' : 'account-bag'">
      <div
        v-if="
          shop
            ? benefits.state.value.shop.length
            : benefits.state.value.items.length
        "
        class="items-grid"
      >
        <template v-if="shop"
          ><article
            v-for="item in benefits.state.value.shop"
            :key="item.id"
            class="item"
            :class="`item-${classes[item.kind]}`"
          >
            <div class="item-heading">
              <span class="item-symbol" aria-hidden="true"
                ><AppIcon :name="icons[item.kind]"
              /></span>
              <h2>{{ item.name }}</h2>
            </div>
            <div class="item-body">
              <ItemEffect :effect="item.effect" />
              <p class="item-rule">{{ copy(rules[item.kind]) }}</p>
              <p class="item-validity">
                <AppIcon name="calendar-days" />{{
                  copy("account.redeem.days", {
                    days: item.activationTtlSeconds / 86400,
                  })
                }}
              </p>
              <p v-if="!item.available" class="note warn">
                {{ copy("reward.blocked") }}
              </p>
            </div>
            <div class="item-footer">
              <strong class="item-price">{{
                copy("pricevalue", { count: item.price })
              }}</strong
              ><button
                class="btn primary"
                :disabled="!item.available || benefits.busy.value"
                @click="benefits.open(item.id, true)"
              >
                {{ copy("redeem") }}
              </button>
            </div>
          </article></template
        ><template v-else
          ><article
            v-for="item in benefits.state.value.items"
            :key="item.id"
            class="item"
            :class="`item-${classes[item.kind]}`"
          >
            <div class="item-heading">
              <span class="item-symbol" aria-hidden="true"
                ><AppIcon :name="icons[item.kind]"
              /></span>
              <h2>{{ item.name }}</h2>
              <span class="pill">{{
                copy(
                  item.state === "refundable"
                    ? "retired"
                    : item.state === "ended"
                      ? "b.used"
                      : item.state,
                )
              }}</span>
            </div>
            <div class="item-body">
              <ItemEffect :effect="item.effect" />
              <dl class="item-dates">
                <div>
                  <dt>{{ copy("account.useby") }}</dt>
                  <dd>{{ format.dateTime(item.activationDeadline) }}</dd>
                </div>
                <div
                  v-for="model in item.modelTimes"
                  :key="model.modelId"
                  class="benefit-end"
                >
                  <dt>{{ model.name }}</dt>
                  <dd>
                    {{
                      copy("ends", {
                        date: format.dateTime(
                          model.aggregateEndsAt ?? model.contributionEndsAt,
                        ),
                      })
                    }}
                  </dd>
                </div>
                <div v-if="item.planTrial" class="benefit-end">
                  <dt>{{ copy("a.plan." + item.planTrial.planCode) }}</dt>
                  <dd>
                    {{
                      copy("ends", {
                        date: format.dateTime(item.planTrial.endsAt),
                      })
                    }}
                  </dd>
                </div>
              </dl>
              <p v-if="item.extraCredit">
                {{ copy("b.count", { count: item.extraCredit.remaining }) }}
              </p>
              <p class="item-rule">{{ copy(rules[item.kind]) }}</p>
              <p
                v-if="item.useBlock === 'plan_already_covers_models'"
                class="note warn"
              >
                {{ copy("covered") }}
              </p>
            </div>
            <div class="item-footer">
              <strong v-if="item.refund" class="item-price">{{
                copy("pricevalue", { count: item.refund.points })
              }}</strong
              ><button
                class="btn primary"
                :disabled="
                  benefits.busy.value ||
                  (item.state !== 'refundable' &&
                    (item.state !== 'unused' || !!item.useBlock))
                "
                @click="benefits.open(item.id)"
              >
                {{
                  copy(
                    item.state === "refundable"
                      ? "refund"
                      : item.kind === "makeup"
                        ? "makeup"
                        : item.kind === "extra_credit"
                          ? "use"
                          : "activate",
                  )
                }}
              </button>
            </div>
          </article></template
        >
      </div>
      <div v-else-if="!benefits.state.value.pending" class="empty">
        <h2>{{ copy(shop ? "shop.empty" : "bag.empty") }}</h2>
        <NuxtLink v-if="!shop" class="btn primary" to="/account/exchange">{{
          copy("shop")
        }}</NuxtLink>
      </div>
      <p v-if="benefits.state.value.pending" role="status">
        {{ copy("loading") }}
      </p>
      <button
        v-if="
          shop ? benefits.state.value.nextShop : benefits.state.value.nextItems
        "
        class="btn"
        :disabled="benefits.state.value.pending"
        @click="benefits.load(!!shop, true)"
      >
        {{ copy("l.more") }}
      </button>
    </div>
    <AppDialog
      id="benefit-preview"
      :open="!!preview"
      :title="
        copy(
          preview?.kind === 'exchange'
            ? 'redeem'
            : preview?.kind === 'refund'
              ? 'refund'
              : preview?.kind === 'makeup'
                ? 'makeup.title'
                : preview?.kind === 'activate' && preview.value.discardedTrial
                  ? 'card.cover.title'
                  : 'card.preview',
        )
      "
      @close="benefits.close"
      ><template v-if="preview"
        ><AppError :failure="benefits.previewFailure.value" />
        <h3>{{ preview.item.name }}</h3>
        <template v-if="preview.kind === 'exchange'"
          ><p>
            {{ copy("pricevalue", { count: preview.item.price }) }}
          </p></template
        ><template v-else-if="preview.kind === 'activate'"
          ><p :class="preview.value.discardedTrial ? 'note warn' : 'note'">
            {{
              copy(
                preview.value.discardedTrial
                  ? "b.cover"
                  : rules[preview.item.kind],
              )
            }}
          </p>
          <ItemEffect :effect="preview.value.effect" />
          <div
            v-for="model in preview.value.modelTimes"
            :key="model.modelId"
            class="answer-row"
          >
            <strong>{{
              preview.item.effect.kind === "model_trial"
                ? preview.item.effect.models.find((m) => m.id === model.modelId)
                    ?.name
                : ""
            }}</strong
            ><span>{{
              copy("b.extension", {
                days: model.addedSeconds / 86400,
                date: format.dateTime(model.resultEndsAt),
              })
            }}</span>
          </div>
          <p v-if="preview.value.planResult">
            {{
              copy("ends", {
                date: format.dateTime(preview.value.planResult.resultEndsAt),
              })
            }}
          </p>
          <p v-if="preview.value.extraResult">
            {{
              copy("ends", {
                date: format.dateTime(preview.value.extraResult.expiresAt),
              })
            }}
          </p>
          <p v-if="!preview.value.canActivate" class="note warn">
            {{
              copy(
                preview.value.reason === "plan_already_covers_models"
                  ? "covered"
                  : "reward.blocked",
              )
            }}
          </p></template
        ><template v-else-if="preview.kind === 'refund'"
          ><p>{{ copy("card.refundnote") }}</p>
          <strong v-if="preview.value.points !== null">{{
            copy("pricevalue", { count: preview.value.points })
          }}</strong></template
        ><template v-else
          ><p>{{ copy("makeup.desc") }}</p>
          <div class="calendar">
            <button
              v-for="day in preview.calendar.days"
              :key="day.day"
              class="day btn"
              :disabled="!day.canMakeup || benefits.busy.value"
              :aria-pressed="preview.day === day.day"
              :title="day.day"
              @click="benefits.chooseDay(day.day)"
            >
              {{ Number(day.day.slice(-2)) }}
            </button>
          </div>
          <p v-if="preview.day">{{ preview.day }}</p>
          <p v-if="preview.value">
            {{ copy("pricevalue", { count: preview.value.pointsAdded }) }}
          </p>
          <div
            v-for="day in preview.value?.affectedDays"
            :key="day.day"
            class="answer-row"
          >
            <span>{{ day.day }}</span
            ><span>{{ day.beforePoints }} → {{ day.afterPoints }}</span>
          </div></template
        ></template
      ><template #footer
        ><button
          class="btn"
          :disabled="benefits.busy.value"
          @click="benefits.close"
        >
          {{ copy("cancel") }}</button
        ><button
          v-if="benefits.needsPreview.value"
          class="btn primary"
          @click="benefits.repreview"
        >
          {{ copy("retry") }}</button
        ><button
          v-else
          class="btn primary"
          :disabled="!canConfirm || benefits.busy.value"
          @click="benefits.confirm"
        >
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
  </AccountPage>
</template>
