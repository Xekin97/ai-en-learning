<script setup lang="ts">
const session = useSessionStore();
useLocalizedHead("home.title");
</script>

<template>
  <section class="hero">
    <div class="container">
      <div class="hero-grid">
        <div>
          <p class="eyebrow">{{ $t("home.eyebrow") }}</p>
          <h1 class="hero-title">
            {{ $t("home.titleStart") }}<em>{{ $t("home.titleEm") }}</em
            >{{ $t("home.titleEnd") }}
          </h1>
          <p class="hero-copy">{{ $t("home.description") }}</p>
          <div class="hero-actions">
            <NuxtLink class="button button-primary" to="/create"
              >{{ $t("home.start") }} <AppIcon name="arrow"
            /></NuxtLink>
            <NuxtLink class="button button-secondary" to="/review">{{
              session.isLearner.value
                ? $t("home.reviewLearner")
                : $t("home.reviewGuest")
            }}</NuxtLink>
            <NuxtLink class="button button-quiet" to="/library">{{
              $t("common.library")
            }}</NuxtLink>
          </div>
        </div>
        <div class="weave-visual" :aria-label="$t('home.visualLabel')">
          <div class="weave-words">
            <span class="weave-word">resilient</span>
            <span class="weave-word">weave</span>
            <span class="weave-word">create</span>
          </div>
        </div>
      </div>
      <div class="path-grid" :aria-label="$t('home.flowLabel')">
        <article class="path-card">
          <span class="path-number">01</span>
          <h3>{{ $t("home.choose") }}</h3>
          <p>{{ $t("home.chooseCopy") }}</p>
        </article>
        <article class="path-card">
          <span class="path-number">02</span>
          <h3>{{ $t("home.read") }}</h3>
          <p>{{ $t("home.readCopy") }}</p>
        </article>
        <article class="path-card">
          <span class="path-number">03</span>
          <h3>{{ $t("home.remember") }}</h3>
          <p>{{ $t("home.rememberCopy") }}</p>
        </article>
      </div>
    </div>
  </section>
</template>
