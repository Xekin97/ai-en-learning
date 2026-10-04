<script setup lang="ts">
import {
  safePathSegment,
  safeSearchQuery,
} from "@application/auth/return-intent";
definePageMeta({ middleware: "admin", layout: "admin" });
const route = useRoute();
const userId = safePathSegment(route.params.userId),
  batchId = safePathSegment(route.params.batchId),
  q = safeSearchQuery(route.query.q);
await navigateTo(
  userId && batchId
    ? {
        path: `/admin/users/${encodeURIComponent(userId)}`,
        query: {
          batch: batchId,
          ...(q ? { q } : {}),
          ...(route.query.all === "1" ? { all: "1" } : {}),
        },
      }
    : "/admin/users",
  { replace: true },
);
</script>
<template>
  <div role="status">{{ $t("common.loading") }}</div>
</template>
