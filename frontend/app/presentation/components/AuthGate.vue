<script setup lang="ts">
import type { AuthGateViewModel } from "@presentation/auth/auth-gate-presenter";
defineProps<{ view: AuthGateViewModel }>();
</script>
<template>
  <section class="empty-state card auth-gate">
    <div class="empty-symbol" aria-hidden="true"><AppIcon name="key" /></div>
    <p class="eyebrow">{{ view.eyebrow }}</p>
    <h1>{{ view.title }}</h1>
    <p>{{ view.description }}</p>
    <div class="inline-actions">
      <NuxtLink class="button button-primary" :to="view.loginTo">{{
        view.loginLabel
      }}</NuxtLink>
      <NuxtLink class="button button-secondary" :to="view.registerTo">{{
        view.registerLabel
      }}</NuxtLink>
    </div>
  </section>
</template>
