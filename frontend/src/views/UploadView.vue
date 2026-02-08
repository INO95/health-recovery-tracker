<template>
  <section class="card">
    <h2>Upload Screenshot</h2>
    <p class="hint">운동 스크린샷을 업로드하면 워커가 처리한 뒤 Sessions에서 확인할 수 있습니다.</p>

    <label class="field">
      <span>API Base URL</span>
      <input v-model="apiBaseInput" type="text" placeholder="http://127.0.0.1:8000" />
    </label>
    <button class="secondary" @click="saveApiBase">Save API Base</button>

    <label class="field">
      <span>Screenshot file</span>
      <input accept="image/*" type="file" @change="onFileChange" />
    </label>

    <button :disabled="!selectedFile || loading" @click="uploadFile">
      {{ loading ? "Uploading..." : "Upload" }}
    </button>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <div v-if="result" class="result">
      <p><strong>Upload ID:</strong> {{ result.id }}</p>
      <p><strong>Status:</strong> {{ result.status }}</p>
      <p><strong>Queue Job:</strong> {{ result.queue_job_id || "-" }}</p>
      <RouterLink to="/sessions">Open Sessions</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { getApiBaseUrl, setApiBaseUrl, uploadScreenshot } from "../api/client";
import type { UploadResponse } from "../types";

const apiBaseInput = ref(getApiBaseUrl());
const selectedFile = ref<File | null>(null);
const loading = ref(false);
const errorMessage = ref("");
const result = ref<UploadResponse | null>(null);

function saveApiBase(): void {
  setApiBaseUrl(apiBaseInput.value);
  errorMessage.value = "";
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  selectedFile.value = target.files?.[0] || null;
}

async function uploadFile(): Promise<void> {
  if (!selectedFile.value) {
    errorMessage.value = "파일을 선택해 주세요.";
    return;
  }
  loading.value = true;
  errorMessage.value = "";
  result.value = null;
  try {
    result.value = await uploadScreenshot(selectedFile.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}
</script>
