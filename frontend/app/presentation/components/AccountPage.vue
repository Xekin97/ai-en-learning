<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
const access = useLearnerAccess(),
  account = useAccountStore();
await access.initialize(() => usePageLoader("account", () => account.load()));
</script>
<template>
  <LearnerPageBoundary :view="access.view.value" @retry="access.retry"
    ><AccountShell :account="account.state.value.account"
      ><AppError :failure="account.state.value.failure" /><slot /></AccountShell
  ></LearnerPageBoundary>
</template>
