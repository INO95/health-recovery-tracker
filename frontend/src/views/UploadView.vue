<template>
  <section class="card">
    <h2>Upload Screenshot</h2>
    <p class="hint">OCR 후 AI 정리 결과를 폼으로 수정한 뒤 업로드할 수 있습니다.</p>

    <label class="field">
      <span>API Base URL</span>
      <input v-model="apiBaseInput" type="text" placeholder="https://health-v2-api.<subdomain>.workers.dev" />
    </label>
    <button class="secondary" @click="saveApiBase">Save API Base</button>

    <label class="field">
      <span>Screenshot file</span>
      <input accept="image/*" type="file" @change="onFileChange" />
    </label>

    <div class="row controls">
      <button class="secondary" :disabled="!selectedFile || ocrLoading" @click="runOcr">
        {{ ocrLoading ? "OCR Running..." : "Run OCR" }}
      </button>
      <button class="secondary" :disabled="!ocrText.trim() || aiLoading" @click="runAiNormalize">
        {{ aiLoading ? "AI Normalizing..." : "AI 정리" }}
      </button>
      <button :disabled="!selectedFile || !ocrText.trim() || loading" @click="uploadFile">
        {{ loading ? "Uploading..." : "Upload" }}
      </button>
    </div>

    <section v-if="workout" class="editor-section">
      <h3>빠른 수정 폼</h3>
      <div class="editor-grid">
        <label class="field">
          <span>루틴명(split)</span>
          <input v-model="workout.summary.split" type="text" />
        </label>
        <label class="field">
          <span>날짜</span>
          <input v-model="workout.summary.date" type="date" />
        </label>
        <label class="field">
          <span>칼로리</span>
          <input v-model.number="workout.summary.calories_kcal" type="number" min="0" />
        </label>
        <label class="field">
          <span>운동 시간(분)</span>
          <input v-model.number="workout.summary.duration_min" type="number" min="0" />
        </label>
        <label class="field">
          <span>볼륨(kg)</span>
          <input v-model.number="workout.summary.volume_kg" type="number" min="0" step="0.1" />
        </label>
      </div>

      <div v-for="(exercise, exIdx) in workout.exercises" :key="`exercise-${exIdx}`" class="exercise-editor">
        <label class="field">
          <span>운동명 {{ exIdx + 1 }}</span>
          <input v-model="exercise.raw_name" type="text" />
        </label>
        <table>
          <thead>
            <tr>
              <th>세트</th>
              <th>무게(kg)</th>
              <th>횟수</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(setRow, setIdx) in exercise.sets" :key="`set-${exIdx}-${setIdx}`">
              <td>{{ setIdx + 1 }}</td>
              <td>
                <input v-model.number="setRow.weight_kg" type="number" min="0" step="0.5" />
              </td>
              <td>
                <input v-model.number="setRow.reps" type="number" min="0" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="hint">폼을 수정하면 아래 OCR 텍스트가 자동으로 동기화됩니다.</p>
    </section>

    <label class="field">
      <span>OCR Text (editable)</span>
      <textarea v-model="ocrText" rows="10" placeholder="OCR 결과 텍스트"></textarea>
    </label>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="aiSummary" class="hint">{{ aiSummary }}</p>

    <div v-if="result" class="result">
      <p><strong>Upload ID:</strong> {{ result.id }}</p>
      <p><strong>Status:</strong> {{ result.status }}</p>
      <p><strong>Error:</strong> {{ result.error_message || "-" }}</p>
      <p v-if="result.parse_warnings?.length"><strong>Warnings:</strong> {{ result.parse_warnings.join(", ") }}</p>
      <RouterLink to="/sessions">Open Sessions</RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { createWorker } from "tesseract.js";
import { getApiBaseUrl, normalizeOcrText, setApiBaseUrl, uploadScreenshot } from "../api/client";
import type { UploadResponse } from "../types";
import { formatClientError } from "../utils/apiError";
import {
  buildNormalizedWorkoutText,
  parseNormalizedWorkoutText,
  type NormalizedWorkout,
} from "../utils/normalizedWorkout";

const apiBaseInput = ref(getApiBaseUrl());
const selectedFile = ref<File | null>(null);
const ocrText = ref("");
const workout = ref<NormalizedWorkout | null>(null);
const loading = ref(false);
const ocrLoading = ref(false);
const aiLoading = ref(false);
const errorMessage = ref("");
const aiSummary = ref("");
const result = ref<UploadResponse | null>(null);

watch(
  workout,
  (next) => {
    if (!next) {
      return;
    }
    ocrText.value = buildNormalizedWorkoutText(next);
  },
  { deep: true }
);

function saveApiBase(): void {
  setApiBaseUrl(apiBaseInput.value);
  errorMessage.value = "";
  aiSummary.value = "";
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  selectedFile.value = target.files?.[0] || null;
  result.value = null;
  errorMessage.value = "";
}

async function runOcr(): Promise<void> {
  if (!selectedFile.value) {
    errorMessage.value = "파일을 선택해 주세요.";
    return;
  }

  ocrLoading.value = true;
  errorMessage.value = "";

  const worker = await createWorker("kor+eng");
  try {
    const imageData = await selectedFile.value.arrayBuffer();
    const output = await worker.recognize(imageData);
    ocrText.value = output.data.text?.trim() || "";
    workout.value = null;
    if (!ocrText.value) {
      errorMessage.value = "OCR 텍스트를 추출하지 못했습니다. 텍스트를 직접 입력해 주세요.";
    }
  } catch (error) {
    errorMessage.value = formatClientError("OCR 실행 실패", error);
  } finally {
    await worker.terminate();
    ocrLoading.value = false;
  }
}

async function runAiNormalize(): Promise<void> {
  if (!ocrText.value.trim()) {
    errorMessage.value = "먼저 OCR 텍스트를 생성하거나 입력해 주세요.";
    return;
  }

  aiLoading.value = true;
  errorMessage.value = "";
  aiSummary.value = "";
  try {
    const normalized = await normalizeOcrText(ocrText.value);
    ocrText.value = normalized.normalized_text;

    const parsedForEdit = parseNormalizedWorkoutText(normalized.normalized_text);
    workout.value = parsedForEdit;

    aiSummary.value = `AI 정리 완료: confidence=${normalized.confidence}, needs_review=${normalized.needs_review}`;
    if (normalized.warnings.length > 0) {
      aiSummary.value += `, warnings=${normalized.warnings.join(",")}`;
    }
  } catch (error) {
    errorMessage.value = formatClientError("AI 정리 실패", error);
  } finally {
    aiLoading.value = false;
  }
}

async function uploadFile(): Promise<void> {
  if (!selectedFile.value) {
    errorMessage.value = "파일을 선택해 주세요.";
    return;
  }
  if (!ocrText.value.trim()) {
    errorMessage.value = "OCR 텍스트가 필요합니다. Run OCR 또는 직접 입력 후 업로드하세요.";
    return;
  }

  loading.value = true;
  errorMessage.value = "";
  result.value = null;

  try {
    result.value = await uploadScreenshot({
      file: selectedFile.value,
      ocrTextRaw: ocrText.value,
      ocrEngineVersion: "tesseract-js",
      parserVersion: "cf-parser-v1",
    });
  } catch (error) {
    errorMessage.value = formatClientError("업로드 실패", error);
  } finally {
    loading.value = false;
  }
}
</script>
