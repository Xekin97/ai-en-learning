<script setup lang="ts">
import type {
  MeaningLanguage,
  Scenario,
  PassageLength,
} from "@application/shared/models";
defineProps<{
  configuration: {
    modelName: string;
    meaningLanguage: MeaningLanguage;
    scenario: Scenario;
    length: PassageLength;
  };
}>();
const { copy } = useDesignCopy();
const format = useDisplayFormatters();
</script>
<template>
  <div class="trial-model">
    <div class="trial-model-icon"><AppIcon name="bot" /></div>
    <dl>
      <dt>{{ copy("model") }}</dt>
      <dd>{{ configuration.modelName }}</dd>
    </dl>
  </div>
  <dl class="trial-config-facts">
    <div class="trial-config-row">
      <dt>
        <AppIcon name="book-open" /><span>{{ copy("style") }}</span>
      </dt>
      <dd>{{ format.scenario(configuration.scenario) }}</dd>
    </div>
    <div class="trial-config-row">
      <dt>
        <AppIcon name="layers" /><span>{{ copy("length") }}</span>
      </dt>
      <dd>{{ format.length(configuration.length) }}</dd>
    </div>
    <div class="trial-config-row">
      <dt>
        <AppIcon name="book-open-text" /><span>{{ copy("explain") }}</span>
      </dt>
      <dd>{{ format.meaning(configuration.meaningLanguage) }}</dd>
    </div>
  </dl>
</template>
