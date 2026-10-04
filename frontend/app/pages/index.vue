<script setup lang="ts">
import { sampleStories } from "@presentation/home/sample-stories";
import { attachHomeMotion } from "@presentation/home/home-motion";
const { copy, language } = useDesignCopy();
const stack = ref<HTMLElement | null>(null);
const steps = [
  { key: "choose", icon: "shuffle" },
  { key: "read", icon: "book-open" },
  { key: "review", icon: "clipboard-check" },
] as const;
useHead({ title: () => copy("home") });
let dispose: (() => void) | undefined;
onMounted(() => {
  if (stack.value) dispose = attachHomeMotion(stack.value);
});
onBeforeUnmount(() => dispose?.());
</script>
<template>
  <div>
    <section class="home-hero" data-region="hero">
      <div class="home-intro">
        <p class="home-kicker">
          <AppIcon name="sparkles" />{{ copy("hero.eyebrow") }}
        </p>
        <h1>{{ copy("hero.title") }}</h1>
        <p class="home-description">{{ copy("hero.desc") }}</p>
        <div class="home-actions">
          <NuxtLink class="btn primary" to="/create"
            ><AppIcon name="notebook-pen" />{{ copy("hero.cta") }}</NuxtLink
          ><NuxtLink class="btn home-secondary" to="/explore"
            >{{ copy("hero.secondary") }}<AppIcon name="arrow-right"
          /></NuxtLink>
        </div>
      </div>
      <div class="home-example">
        <div
          ref="stack"
          class="home-card-stack"
          data-top="1"
          data-motion="paused"
        >
          <article
            v-for="(story, index) in sampleStories"
            :key="story.title"
            class="home-paper"
            :class="index === 0 ? 'home-paper-back' : 'home-paper-front'"
            tabindex="0"
            :aria-labelledby="`home-story-${index}`"
          >
            <div class="home-paper-meta">
              <span><AppIcon name="sparkles" />{{ copy("hero.sample") }}</span
              ><span
                >{{ copy("a.preset.style.Story") }} ·
                {{ copy("a.preset.length.Brief") }}</span
              >
            </div>
            <h2 :id="`home-story-${index}`" lang="en">{{ story.title }}</h2>
            <div class="home-word-row" :aria-label="copy('words')">
              <span
                v-for="(word, i) in story.words"
                :key="word"
                class="home-word"
                :class="`home-word-${i % 3}`"
                lang="en"
                >{{ word }}</span
              >
            </div>
            <p class="home-story" lang="en">
              <template v-for="(part, i) in story.parts" :key="i"
                ><template v-if="typeof part === 'string'">{{ part }}</template
                ><mark v-else>{{ part.word }}</mark></template
              >
            </p>
            <div class="home-word-meaning">
              <AppIcon name="book-open-text" />
              <div>
                <strong lang="en">{{ story.meaningWord }}</strong
                ><span>{{ story.meaning[language] }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
    <section class="home-path" :aria-label="copy('hero.steps')">
      <article v-for="(step, index) in steps" :key="step.key" class="home-step">
        <span class="home-step-icon" :class="`home-step-${index}`"
          ><AppIcon :name="step.icon"
        /></span>
        <div>
          <h2>{{ copy("path." + step.key) }}</h2>
          <p>{{ copy("path." + step.key + ".desc") }}</p>
        </div>
      </article>
    </section>
    <section class="home-why" aria-labelledby="home-why-title">
      <header>
        <p class="eyebrow">{{ copy("why.eyebrow") }}</p>
        <h2 id="home-why-title">{{ copy("why.title") }}</h2>
      </header>
      <div class="why-features">
        <article
          v-for="(feature, index) in [
            { key: 'choose', icon: 'notebook-pen' },
            { key: 'ai', icon: 'sparkles' },
            { key: 'language', icon: 'languages' },
          ] as const"
          :key="feature.key"
          class="why-feature"
        >
          <span class="why-icon" :class="`why-icon-${index}`"
            ><AppIcon :name="feature.icon"
          /></span>
          <h3>{{ copy(`why.${feature.key}.title`) }}</h3>
          <p>{{ copy(`why.${feature.key}.desc`) }}</p>
        </article>
      </div>
    </section>
  </div>
</template>
