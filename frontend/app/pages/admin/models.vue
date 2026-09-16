<script setup lang="ts">
definePageMeta({ middleware: "admin", layout: "admin" });
const admin = useAdminStore();
const apiKey = ref("");
const keyOpen = ref(false);
const modelOpen = ref(false);
const editingModelId = ref<string | null>(null);
const displayName = ref("");
const providerModel = ref("");
const description = ref("");
const modelEnabled = ref(true);

await usePageLoader("admin-models", () => admin.loadModels());
useLocalizedHead("admin.models");

function closeKey() {
  keyOpen.value = false;
  apiKey.value = "";
}

function openModel(modelId: string | null = null) {
  editingModelId.value = modelId;
  const model = admin.state.value.models.find((item) => item.id === modelId);
  displayName.value = model?.displayName ?? "";
  providerModel.value = model?.openRouterModelId ?? "";
  description.value = model?.description ?? "";
  modelEnabled.value = model?.enabled ?? true;
  modelOpen.value = true;
}

function closeModel() {
  modelOpen.value = false;
  editingModelId.value = null;
  displayName.value = "";
  providerModel.value = "";
  description.value = "";
  modelEnabled.value = true;
}

async function saveKey() {
  try {
    await admin.saveCredential(apiKey.value);
    closeKey();
  } catch {
    // Store exposes a safe failure.
  }
}

async function saveModel() {
  try {
    const input = {
      displayName: displayName.value,
      openRouterModelId: providerModel.value,
      description: description.value.trim() || null,
    };
    await admin.saveModelDraft({
      modelId: editingModelId.value,
      ...input,
      enabled: modelEnabled.value,
    });
    closeModel();
  } catch {
    // Store exposes a safe failure.
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ $t("admin.title") }}</p>
        <h1 class="page-title">{{ $t("admin.modelsTitle") }}</h1>
        <p class="page-description">{{ $t("admin.modelsCopy") }}</p>
      </div>
      <button class="button button-primary" type="button" @click="openModel()">
        {{ $t("admin.addModel") }}
      </button>
    </header>
    <AppError :failure="admin.state.value.failure" />

    <section class="card admin-key-card">
      <header class="card-header">
        <div>
          <h2 class="card-title">{{ $t("admin.credential") }}</h2>
          <p class="card-subtitle">{{ $t("admin.credentialShared") }}</p>
        </div>
        <span
          class="status-badge"
          :class="
            admin.state.value.credential?.configured
              ? 'status-success'
              : 'status-warning'
          "
          >{{
            admin.state.value.credential?.configured
              ? $t("admin.credentialConfigured")
              : $t("admin.credentialMissing")
          }}</span
        >
      </header>
      <div class="card-body">
        <div v-if="admin.state.value.credential?.configured" class="field">
          <span class="field-label">{{ $t("admin.currentKey") }}</span>
          <div class="text-input code-value masked-key">
            {{ admin.state.value.credential.maskedHint ?? "••••" }}
          </div>
        </div>
        <div v-else class="notice notice-warning">
          <AppIcon name="alert" />
          <div>{{ $t("admin.keyPrivate") }}</div>
        </div>
      </div>
      <footer class="card-footer">
        <button
          class="button button-secondary"
          type="button"
          @click="keyOpen = true"
        >
          {{
            admin.state.value.credential?.configured
              ? $t("admin.replaceKey")
              : $t("admin.configureKey")
          }}
        </button>
      </footer>
    </section>

    <section class="card">
      <header class="card-header">
        <h2 class="card-title">{{ $t("admin.modelList") }}</h2>
        <span class="helper">{{
          $t("admin.modelCount", { count: admin.state.value.models.length })
        }}</span>
      </header>
      <div class="card-body">
        <div v-if="admin.state.value.models.length" class="model-list">
          <article
            v-for="model in admin.state.value.models"
            :key="model.id"
            class="model-row"
          >
            <div>
              <div class="model-name">
                {{ model.displayName }}
                <span
                  class="status-badge"
                  :class="model.enabled ? 'status-success' : 'status-muted'"
                  >{{
                    model.enabled
                      ? $t("admin.modelActive")
                      : $t("admin.modelInactive")
                  }}</span
                >
              </div>
              <div v-if="model.description" class="model-description">
                {{ model.description }}
              </div>
              <div class="model-meta">
                <span class="code-value">{{ model.openRouterModelId }}</span
                ><span class="helper"
                  >·
                  {{
                    $t("admin.references", {
                      count: model.assignedGroupCodes.length,
                    })
                  }}</span
                >
              </div>
            </div>
            <button
              class="button button-secondary button-small"
              type="button"
              @click="openModel(model.id)"
            >
              {{ $t("admin.editAction") }}
            </button>
          </article>
        </div>
        <div v-else class="empty-state">
          <span class="empty-symbol" aria-hidden="true">＋</span>
          <h3>{{ $t("admin.noModels") }}</h3>
          <p>{{ $t("admin.noModelsCopy") }}</p>
          <button
            class="button button-primary"
            type="button"
            @click="openModel()"
          >
            {{ $t("admin.addModel") }}
          </button>
        </div>
      </div>
    </section>

    <AppDialog
      id="openrouter-key"
      :open="keyOpen"
      :title="$t('admin.keyDialog')"
      @close="closeKey"
    >
      <form
        id="openrouter-key-form"
        class="dialog-form"
        @submit.prevent="saveKey"
      >
        <div class="notice">
          <AppIcon name="key" />
          <div>{{ $t("admin.keyPrivate") }}</div>
        </div>
        <label class="field"
          ><span class="field-label">{{ $t("admin.apiKey") }}</span
          ><input
            v-model="apiKey"
            class="text-input code-value admin-key-input"
            type="password"
            autocomplete="off"
            required
          /><span class="helper">{{ $t("admin.keyHidden") }}</span></label
        >
      </form>
      <template #footer
        ><button
          class="button button-secondary"
          type="button"
          @click="closeKey"
        >
          {{ $t("common.cancel") }}</button
        ><button
          class="button button-primary"
          type="submit"
          form="openrouter-key-form"
          :disabled="!apiKey"
        >
          {{ $t("common.save") }}
        </button></template
      >
    </AppDialog>

    <AppDialog
      id="admin-model"
      :open="modelOpen"
      :title="editingModelId ? $t('admin.editModel') : $t('admin.addModel')"
      @close="closeModel"
    >
      <form
        id="admin-model-form"
        class="dialog-form admin-model-form"
        @submit.prevent="saveModel"
      >
        <label class="field"
          ><span class="field-label">{{ $t("admin.displayName") }}</span
          ><input v-model="displayName" class="text-input" required /><span
            class="helper"
            >{{ $t("admin.displayNameCopy") }}</span
          ></label
        >
        <label class="field"
          ><span class="field-label">{{ $t("admin.description") }}</span
          ><input v-model="description" class="text-input" /><span
            class="helper"
            >{{ $t("admin.descriptionCopy") }}</span
          ></label
        >
        <label class="field"
          ><span class="field-label">{{ $t("admin.providerModel") }}</span
          ><input
            v-model="providerModel"
            class="text-input admin-model-id-input"
            required
          /><span class="helper">{{
            $t("admin.providerModelCopy")
          }}</span></label
        >
        <label class="switch admin-model-enabled"
          ><input v-model="modelEnabled" type="checkbox" /><span
            class="switch-track"
            aria-hidden="true"
          /><span>{{ $t("admin.modelEnabled") }}</span></label
        >
        <div class="notice notice-warning">
          <AppIcon name="alert" />
          <div>{{ $t("admin.modelEnabledCopy") }}</div>
        </div>
      </form>
      <template #footer
        ><button
          class="button button-secondary"
          type="button"
          @click="closeModel"
        >
          {{ $t("common.cancel") }}</button
        ><button
          class="button button-primary"
          type="submit"
          form="admin-model-form"
          :disabled="!displayName || !providerModel"
        >
          {{ $t("admin.saveModel") }}
        </button></template
      >
    </AppDialog>
  </div>
</template>
