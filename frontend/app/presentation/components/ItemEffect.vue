<script setup lang="ts">
import type { EffectModel } from "@application/benefits/models";
import type { DeepReadonly } from "vue";
const props = defineProps<{ effect: DeepReadonly<EffectModel> }>(),
  { copy } = useDesignCopy();
const text = computed(() => {
  const e = props.effect;
  switch (e.kind) {
    case "makeup":
      return copy("makeup.desc");
    case "extra_credit":
      return copy("b.count", { count: e.extraCount });
    case "model_trial":
      return copy("b.model", {
        models: e.models.map((m) => m.name).join(" / "),
        days: e.trialSeconds / 86400,
      });
    case "plan_trial":
      return copy("b.plan", {
        plan: copy("a.plan." + e.targetPlanCode),
        days: e.trialSeconds / 86400,
      });
  }
  return "";
});
</script>
<template>
  <p class="item-effect">{{ text }}</p>
</template>
