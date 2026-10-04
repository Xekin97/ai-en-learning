<script setup lang="ts">
import type { AccountModel } from "@application/shared/models";
defineProps<{ account: AccountModel | null }>();
const route = useRoute();
const { copy } = useDesignCopy();
const format = useDisplayFormatters();
const links = [
  { path: "/account", key: "profile", icon: "user" },
  { path: "/account/growth", key: "growth", icon: "trophy" },
  { path: "/account/items", key: "bag", icon: "shopping-bag" },
  { path: "/account/exchange", key: "shop", icon: "store" },
] as const;
</script>
<template>
  <div class="account-layout">
    <aside class="account-sidebar" :aria-label="copy('accountinfo')">
      <div class="account-identity">
        <div class="avatar profile-avatar" aria-hidden="true">
          {{ account?.displayName.slice(0, 1) }}
        </div>
        <div>
          <h2>{{ account?.displayName }}</h2>
          <p class="muted">@{{ account?.username }}</p>
        </div>
      </div>
      <dl class="account-facts">
        <div class="account-plan">
          <dt><AppIcon name="layers" />{{ copy("a.baseplan") }}</dt>
          <dd>{{ account ? copy("a.plan." + account.planCode) : "—" }}</dd>
        </div>
        <div class="account-plan">
          <dt><AppIcon name="sparkles" />{{ copy("account.effective") }}</dt>
          <dd>
            {{ account ? copy("a.plan." + account.effectivePlanCode) : "—" }}
          </dd>
        </div>
        <div>
          <dt>{{ copy("lastlogin") }}</dt>
          <dd>
            {{
              account?.lastLoginAt ? format.dateTime(account.lastLoginAt) : "—"
            }}
          </dd>
        </div>
        <div>
          <dt>{{ copy("lastlearn") }}</dt>
          <dd>
            {{
              account?.lastLearningAt
                ? format.dateTime(account.lastLearningAt)
                : "—"
            }}
          </dd>
        </div>
      </dl>
      <nav class="account-nav" :aria-label="copy('accountnav')">
        <NuxtLink
          v-for="item in links"
          :key="item.path"
          :to="item.path"
          :aria-current="route.path === item.path ? 'page' : undefined"
          ><AppIcon :name="item.icon" />{{ copy(item.key) }}</NuxtLink
        >
      </nav>
    </aside>
    <div class="account-content"><slot /></div>
  </div>
</template>
