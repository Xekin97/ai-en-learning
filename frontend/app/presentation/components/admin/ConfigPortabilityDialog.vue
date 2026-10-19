<script setup lang="ts">
import {
  formattedServerTime,
  portabilityCategoryCopyKey,
  presentFieldChange,
  presentNotice,
} from "@presentation/admin/config-portability-presenter";

const props = defineProps<{
  refresh?: (() => Promise<void>) | undefined;
}>();
const store = useConfigPortabilityStore();
const { state, passphrase, passphraseConfirmation } = store;
const ticket = store.ticket;
const { copy, language } = useDesignCopy();
const fileInput = ref<HTMLInputElement | null>(null);
const refreshed = new Set<string>();
const closeDisabled = computed(() =>
  ["reading", "submitting", "resolving"].includes(state.value.phase),
);
const categoryName = computed(() =>
  state.value.category
    ? copy(portabilityCategoryCopyKey[state.value.category])
    : "",
);
const title = computed(() => {
  if (state.value.mode === "export") return copy("export.title");
  if (state.value.phase === "confirm") return copy("confirm.title");
  if (
    [
      "success",
      "notApplied",
      "unknown",
      "resultExpired",
      "tokenInvalid",
    ].includes(state.value.phase)
  ) {
    if (state.value.phase === "success")
      return copy(
        state.value.category === "plans"
          ? "result.successPlans"
          : state.value.category === "items"
            ? "result.successItems"
            : state.value.category === "growth"
              ? "result.successGrowth"
              : "result.success",
      );
    if (state.value.phase === "notApplied") return copy("result.notApplied");
    if (state.value.phase === "resultExpired") return copy("result.expired");
    if (state.value.phase === "tokenInvalid")
      return copy("result.tokenInvalid");
    return copy("result.unknown");
  }
  return copy(
    state.value.category === "plans"
      ? "import.titlePlans"
      : state.value.category === "items"
        ? "import.titleItems"
        : state.value.category === "growth"
          ? "import.titleGrowth"
          : "import.title",
  );
});
const previewExpired = computed(
  () =>
    !!state.value.preview?.commitNotAfter &&
    Date.now() >= Date.parse(state.value.preview.commitNotAfter),
);
const changeOrder = computed(() =>
  state.value.phase === "confirm"
    ? ["removed", "added", "updated", "unchanged"]
    : ["added", "updated", "removed", "unchanged"],
);
const groupedChanges = computed(() =>
  changeOrder.value
    .map((action) => ({
      action,
      items:
        state.value.preview?.changes.filter((item) => item.action === action) ??
        [],
    }))
    .filter((group) => group.items.length),
);
const failureMessage = computed(() => {
  const failure = state.value.failure;
  if (!failure) return null;
  if (
    failure.code === "password_invalid" ||
    failure.code === "decryption_failed"
  )
    return copy("error.wrongPassword");
  if (failure.code === "category_mismatch")
    return copy("error.category", {
      fileCategory: state.value.fileCategory
        ? copy(portabilityCategoryCopyKey[state.value.fileCategory])
        : "—",
      currentCategory: categoryName.value,
    });
  if (failure.code === "file_size" || failure.code === "payload_too_large")
    return copy("import.fileLimit");
  if (failure.code === "recovery_unavailable")
    return copy("result.unknownHelp");
  if (
    failure.kind === "portability_failure" &&
    failure.code === "credentials_required"
  ) {
    const item = failure.items[0];
    return copy("error.missingKey", {
      category: categoryName.value,
      item:
        item?.label || item?.identity || copy("item.fallback", { index: 1 }),
    });
  }
  return copy("error.fixFile");
});
const currentSummary = computed(() => {
  const current = state.value.current;
  if (!current) return null;
  const config = current.configuration;
  const count =
    config.category === "models"
      ? config.connections.length
      : config.category === "plans"
        ? config.plans.length
        : config.category === "items"
          ? config.items.length
          : config.levels.length +
            Object.values(config.achievements).reduce(
              (sum, rows) => sum + rows.length,
              0,
            );
  return `${categoryName.value} · ${count} · ${current.revision}`;
});

watch(
  () => state.value.result,
  async (result) => {
    if (
      !result ||
      result.status !== "applied" ||
      refreshed.has(result.operationId) ||
      !props.refresh
    )
      return;
    refreshed.add(result.operationId);
    try {
      await props.refresh();
      store.markRefreshFailed(false);
    } catch {
      store.markRefreshFailed(true);
    }
  },
);
onBeforeRouteLeave(() => store.prepareRouteLeave());

function chooseFile() {
  fileInput.value?.click();
}
function selected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void store.selectFile(file);
  input.value = "";
}
function shown() {
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>("#cr313-dialog [data-state-heading]")
      ?.focus({ preventScroll: true }),
  );
}
function countFor(action: string) {
  const counts = state.value.preview?.counts ?? state.value.result?.counts;
  return counts?.[action as keyof typeof counts] ?? 0;
}
</script>

<template>
  <AppDialog
    id="cr313-dialog"
    dialog-class="cr313-dialog"
    :open="state.open"
    :title="title"
    :body-key="`${state.mode}:${state.phase}`"
    :close-disabled="closeDisabled"
    :backdrop-close-disabled="true"
    :initial-focus="
      state.mode === 'export' ? 'input, button' : 'input[type=file], button'
    "
    @close="store.close"
    @shown="shown"
  >
    <template #header>
      <div class="dialog-heading">
        <h2 id="cr313-dialog-title" data-state-heading tabindex="-1">
          {{ title }}
        </h2>
      </div>
    </template>

    <template v-if="state.mode === 'export'">
      <p>{{ copy("portability.completeScope") }}</p>
      <p class="notice">{{ copy("export.category") }} · {{ categoryName }}</p>
      <label v-if="state.category === 'models'" class="option-card">
        <input
          type="checkbox"
          :checked="state.includeCredentials"
          @change="
            store.setIncludeCredentials(
              ($event.target as HTMLInputElement).checked,
            )
          "
        />
        <span
          ><strong>{{ copy("export.includeKeys") }}</strong
          ><small>{{ copy("export.includeKeysHelp") }}</small></span
        >
      </label>
      <p v-else class="notice">{{ copy("export.keyless") }}</p>
      <div v-if="state.includeCredentials" class="credential-fields">
        <label class="field"
          ><span>{{ copy("export.password") }}</span
          ><input
            type="password"
            autocomplete="new-password"
            :value="passphrase"
            @input="
              store.setPassphrase(($event.target as HTMLInputElement).value)
            "
        /></label>
        <label class="field"
          ><span>{{ copy("export.passwordConfirm") }}</span
          ><input
            type="password"
            autocomplete="new-password"
            :value="passphraseConfirmation"
            @input="
              store.setPassphrase(
                passphrase,
                ($event.target as HTMLInputElement).value,
              )
            "
        /></label>
        <p class="field-help">{{ copy("export.passwordHelp") }}</p>
      </div>
      <p v-if="failureMessage" class="notice warn" role="alert">
        {{ failureMessage }}
      </p>
      <p v-if="state.downloadName" class="notice" role="status">
        {{ copy("export.downloadStarted", { filename: state.downloadName }) }}
      </p>
    </template>

    <template v-else-if="state.phase === 'file' || state.phase === 'error'">
      <p class="notice">{{ copy("import.scopeWarning") }}</p>
      <div class="file-drop">
        <span class="file-mark"><AppIcon name="file-pen-line" /></span>
        <p>{{ copy("import.noWrite") }}</p>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept="application/json,.json"
          @change="selected"
        />
        <button class="btn" type="button" @click="chooseFile">
          {{ copy("import.choose") }}
        </button>
      </div>
      <p class="field-help">{{ copy("import.fileLimit") }}</p>
      <div v-if="state.fileName" class="selected-file">
        <AppIcon name="file-pen-line" /><span
          ><strong>{{
            copy("import.fileSelected", {
              filename: state.fileName || copy("import.fileSelectedFallback"),
            })
          }}</strong
          ><small v-if="state.encrypted">{{
            copy("preview.encryptedFileMeta", {
              category: categoryName,
              version: state.formatVersion ?? "—",
            })
          }}</small></span
        >
      </div>
      <label v-if="state.encrypted" class="field"
        ><span>{{ copy("import.password") }}</span
        ><input
          type="password"
          autocomplete="current-password"
          :value="passphrase"
          @input="
            store.setPassphrase(($event.target as HTMLInputElement).value)
          "
        /><small>{{ copy("import.passwordHelp") }}</small></label
      >
      <p v-if="failureMessage" class="notice warn" role="alert">
        {{ failureMessage }}
      </p>
    </template>

    <div
      v-else-if="
        state.phase === 'reading' ||
        state.phase === 'submitting' ||
        state.phase === 'resolving'
      "
      class="progress-state"
      role="status"
    >
      <span class="spinner" aria-hidden="true" />
      <p>
        {{
          copy(state.phase === "reading" ? "import.reading" : "submit.pending")
        }}
      </p>
      <p v-if="state.phase === 'submitting'" class="muted">
        {{ copy("submit.pendingHelp") }}
      </p>
    </div>

    <template
      v-else-if="
        state.phase === 'preview' ||
        state.phase === 'blocked' ||
        state.phase === 'confirm'
      "
    >
      <p :class="['notice', { warn: state.phase === 'blocked' }]">
        {{
          copy(
            state.phase === "blocked"
              ? "error.dependencyHelp"
              : "preview.valid",
          )
        }}
      </p>
      <div class="preview-counts">
        <div>
          <strong>{{ countFor("added") }}</strong
          ><span>{{ copy("preview.add") }}</span>
        </div>
        <div>
          <strong>{{ countFor("updated") }}</strong
          ><span>{{ copy("preview.update") }}</span>
        </div>
        <div class="remove">
          <strong>{{ countFor("removed") }}</strong
          ><span>{{ copy("preview.remove") }}</span>
        </div>
        <div>
          <strong>{{ countFor("unchanged") }}</strong
          ><span>{{ copy("preview.unchanged") }}</span>
        </div>
      </div>
      <p v-if="state.category === 'models'" class="credential-ok">
        {{
          copy("preview.credentials", {
            count:
              state.preview?.changes.filter(
                (item) =>
                  item.kind === "connection" &&
                  item.credentialAction === "replace_from_package",
              ).length ?? 0,
          })
        }}
      </p>
      <p
        v-for="notice in [
          ...(state.preview?.defaultsApplied ?? []),
          ...(state.preview?.warnings ?? []),
        ]"
        :key="`${notice.code}:${notice.itemRef?.kind}:${notice.itemRef?.identity}:${notice.field}`"
        class="notice"
      >
        {{ presentNotice(notice, state.preview?.changes ?? [], copy) }}
      </p>
      <ul v-if="state.preview?.blockers.length" class="dependency-list">
        <li v-for="(blocker, index) in state.preview.blockers" :key="index">
          {{
            copy("error.reference", {
              source: blocker.sourceLabel,
              target: blocker.target.label,
            })
          }}
        </li>
      </ul>
      <div
        class="change-details"
        :class="{ 'confirmation-changes': state.phase === 'confirm' }"
      >
        <div class="change-details-head">
          <h3>
            {{
              copy(
                state.phase === "confirm"
                  ? "changes.confirmTitle"
                  : "changes.title",
              )
            }}
          </h3>
          <p>
            {{
              copy(
                state.phase === "confirm"
                  ? "changes.confirmHelp"
                  : "changes.help",
              )
            }}
          </p>
        </div>
        <details
          v-for="group in groupedChanges"
          :key="group.action"
          class="change-group"
          :class="{ 'change-remove': group.action === 'removed' }"
          :open="state.phase === 'confirm' && group.action === 'removed'"
        >
          <summary>
            <span>{{
              copy(
                `preview.${group.action === "added" ? "add" : group.action === "updated" ? "update" : group.action === "removed" ? "remove" : "unchanged"}`,
              )
            }}</span
            ><strong>{{ group.items.length }}</strong>
          </summary>
          <ul class="change-list">
            <li
              v-for="item in group.items"
              :key="`${item.kind}:${item.identity}`"
            >
              <div>
                <strong>{{ item.label || item.identity }}</strong
                ><code>{{ item.identity }}</code>
              </div>
              <p v-for="field in item.fields" :key="field.field">
                {{ presentFieldChange(item, field, copy) }}
              </p>
            </li>
          </ul>
        </details>
      </div>
      <template v-if="state.phase === 'confirm'">
        <p
          v-if="state.preview?.commitNotAfter && state.preview.retainUntil"
          class="notice"
        >
          {{
            copy("confirm.deadline", {
              deadline: formattedServerTime(
                state.preview.commitNotAfter,
                language,
              ),
              retainUntil: formattedServerTime(
                state.preview.retainUntil,
                language,
              ),
            })
          }}
        </p>
        <p v-if="previewExpired" class="notice warn">
          {{ copy("confirm.previewExpired") }}
        </p>
        <label class="option-card"
          ><input
            type="checkbox"
            :checked="state.acknowledged"
            @change="
              store.setAcknowledged(($event.target as HTMLInputElement).checked)
            "
          /><strong>{{ copy("confirm.ack") }}</strong></label
        >
      </template>
    </template>

    <template
      v-else-if="state.phase === 'success' || state.phase === 'notApplied'"
    >
      <span class="result-mark"
        ><AppIcon :name="state.phase === 'success' ? 'check' : 'alert'"
      /></span>
      <p class="result-lead">
        {{
          copy(
            state.phase === "success"
              ? "result.successHelp"
              : "result.notAppliedHelp",
          )
        }}
      </p>
      <div v-if="state.phase === 'success'" class="preview-counts compact">
        <div>
          <strong>{{ countFor("added") }}</strong
          ><span>{{ copy("preview.add") }}</span>
        </div>
        <div>
          <strong>{{ countFor("updated") }}</strong
          ><span>{{ copy("preview.update") }}</span>
        </div>
        <div class="remove">
          <strong>{{ countFor("removed") }}</strong
          ><span>{{ copy("preview.remove") }}</span>
        </div>
      </div>
      <p v-if="state.result?.superseded" class="notice">
        {{ copy("result.superseded") }}
      </p>
      <p v-if="state.refreshFailed" class="notice warn">
        {{ copy("result.refreshFailed") }}
      </p>
    </template>

    <template v-else>
      <span class="result-mark unknown-mark"><AppIcon name="alert" /></span>
      <p class="result-lead">
        {{
          copy(
            state.phase === "resultExpired"
              ? "result.expiredHelp"
              : state.phase === "tokenInvalid"
                ? "result.tokenInvalidHelp"
                : "result.unknownHelp",
          )
        }}
      </p>
      <p v-if="ticket?.retain_until" class="notice">
        {{
          copy("result.lookupWindow", {
            retainUntil: formattedServerTime(ticket.retain_until, language),
          })
        }}
      </p>
      <div v-if="state.current" class="change-details">
        <div class="change-details-head">
          <h3>{{ copy("result.current") }}</h3>
          <p>
            {{
              copy("result.currentHelp", {
                readAt: formattedServerTime(state.current.readAt, language),
                category: categoryName,
              })
            }}
          </p>
        </div>
        <p class="change-empty">{{ currentSummary }}</p>
      </div>
      <p v-if="failureMessage" class="notice warn">{{ failureMessage }}</p>
    </template>

    <template #footer>
      <button
        v-if="state.mode === 'export'"
        class="btn primary"
        type="button"
        @click="store.exportFile"
      >
        {{
          copy(
            state.includeCredentials
              ? "export.prepareEncrypted"
              : "export.prepare",
          )
        }}
      </button>
      <template v-else-if="state.phase === 'file' || state.phase === 'error'"
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.cancel") }}</button
        ><button
          class="btn primary"
          type="button"
          :disabled="!state.fileName"
          @click="store.preview"
        >
          {{ copy("import.validate") }}
        </button></template
      >
      <template v-else-if="state.phase === 'preview'"
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.cancel") }}</button
        ><button class="btn primary" type="button" @click="store.beginConfirm">
          {{ copy("preview.confirm") }}
        </button></template
      >
      <template v-else-if="state.phase === 'confirm'"
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.cancel") }}</button
        ><button
          class="btn danger"
          type="button"
          :disabled="!state.acknowledged || previewExpired"
          @click="store.submit"
        >
          {{ copy("confirm.replace") }}
        </button></template
      >
      <template v-else-if="state.phase === 'blocked'"
        ><button class="btn" type="button" @click="store.startNewPreview">
          {{ copy("error.fixFile") }}
        </button></template
      >
      <template v-else-if="state.phase === 'unknown'"
        ><button class="btn" type="button" @click="store.readCurrent">
          {{ copy("result.read") }}</button
        ><button
          class="btn primary"
          type="button"
          :disabled="(state.retryAfterUntil ?? 0) > Date.now()"
          @click="store.resolve"
        >
          {{ copy("result.check") }}
        </button></template
      >
      <template
        v-else-if="
          state.phase === 'resultExpired' || state.phase === 'tokenInvalid'
        "
        ><button class="btn" type="button" @click="store.readCurrent">
          {{ copy("result.read") }}</button
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.close") }}
        </button></template
      >
      <template v-else-if="state.phase === 'notApplied'"
        ><button class="btn" type="button" @click="store.startNewPreview">
          {{ copy("result.startNewPreview") }}</button
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.close") }}
        </button></template
      >
      <template v-else-if="state.phase === 'success'"
        ><button
          v-if="state.refreshFailed && refresh"
          class="btn"
          type="button"
          @click="refresh"
        >
          {{ copy("result.retryRefresh") }}</button
        ><button class="btn" type="button" @click="store.close">
          {{ copy("common.close") }}
        </button></template
      >
    </template>
  </AppDialog>
</template>
