<template>
  <section class="card">
    <div class="row">
      <h2>Recovery 🔋</h2>
      <button class="secondary touch-button" :disabled="loading" @click="loadRecovery">
        {{ loading ? "Loading..." : "Retry" }}
      </button>
    </div>

    <p v-if="recovery" class="hint">
      Window:
      <template v-if="recovery.window.from && recovery.window.to">
        {{ recovery.window.from }} ~ {{ recovery.window.to }}
      </template>
      <template v-else>
        last {{ recovery.window.days }} days
      </template>
    </p>

    <section v-if="recovery?.trainer_advice" class="editor-section">
      <h3>AI 트레이너 조언 🤖</h3>
      <p class="hint">{{ recovery.trainer_advice.summary }}</p>
      <p class="hint">{{ recovery.trainer_advice.message_train }}</p>
      <p class="hint">{{ recovery.trainer_advice.message_rest }}</p>
      <p class="hint">{{ recovery.trainer_advice.message_timing }}</p>
    </section>

    <p v-if="loading" class="hint">회복 상태를 불러오는 중입니다...</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <div v-if="recovery" class="recovery-grid">
      <article v-for="entry in sortedMuscles" :key="entry.code" class="recovery-card">
        <div class="row">
          <h3>{{ entry.code }}</h3>
          <span class="status-badge" :class="`status-${entry.data.status}`">
            {{ entry.data.status }}
          </span>
        </div>

        <p class="recovery-value">{{ Math.round(entry.data.recovery) }}%</p>
        <p class="hint">fatigue: {{ Math.round(entry.data.fatigue) }} / raw {{ entry.data.fatigue_raw.toFixed(2) }}</p>
        <p class="hint">rest: 기본 {{ entry.data.default_rest_hours }}h / 설정 {{ entry.data.rest_hours }}h</p>
        <p class="hint">남은 회복: {{ Math.max(0, Math.ceil(entry.data.remaining_hours)) }}시간</p>
        <p class="hint">다음 가능: {{ formatDateTime(entry.data.next_train_at) }}</p>

        <div v-if="entry.data.contributors?.length" class="contributors">
          <div
            v-for="contributor in entry.data.contributors.slice(0, 2)"
            :key="`${entry.code}-${contributor.raw_name}`"
            class="contributor-row"
          >
            <span class="truncate">{{ contributor.raw_name }}</span>
            <span>{{ Math.round(contributor.contribution) }}</span>
          </div>
        </div>
      </article>
    </div>

    <section
      v-if="recovery && recovery.unmapped_exercises && recovery.unmapped_exercises.length > 0"
      class="unmapped-card"
    >
      <h3>Unmapped Exercises</h3>
      <div v-for="item in recovery.unmapped_exercises" :key="item.raw_name" class="contributor-row">
        <span class="truncate">{{ item.raw_name }}</span>
        <span class="status-badge status-yellow">{{ item.count }}</span>
      </div>
    </section>

    <section class="editor-section">
      <h3>부위별 회복시간 설정 (시간) ⏱️</h3>
      <p class="hint">기본값: 대근육/중대근육 60h, 소근육/기타 36h, 유산소 24h</p>
      <div class="editor-grid">
        <label v-for="entry in restSettingRows" :key="entry.code" class="field">
          <span>{{ entry.label }}</span>
          <input v-model.number="restHoursDraft[entry.code]" type="number" min="1" max="240" step="1" />
        </label>
      </div>
      <button class="secondary" :disabled="loading" @click="saveRestSettings">설정 저장 후 재계산</button>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchRecovery, fetchRecoverySettings, updateRecoverySettings } from "../api/client";
import type { RecoveryResponse } from "../types";

const loading = ref(false);
const errorMessage = ref("");
const recovery = ref<RecoveryResponse | null>(null);
const restHoursDraft = ref<Record<string, number>>({});

const sortedMuscles = computed(() => {
  if (!recovery.value) {
    return [];
  }
  return Object.entries(recovery.value.muscles)
    .map(([code, data]) => ({ code, data }))
    .sort((a, b) => b.data.fatigue - a.data.fatigue);
});

const restSettingRows = computed(() =>
  sortedMuscles.value.map((entry) => ({
    code: entry.code,
    label: entry.data.name || entry.code,
  }))
);

function syncDraftFromRecovery(): void {
  if (!recovery.value) return;
  const next: Record<string, number> = {};
  for (const [code, value] of Object.entries(recovery.value.muscles)) {
    next[code] = Number(value.rest_hours || 0);
  }
  restHoursDraft.value = next;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "지금 가능";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "지금 가능";
  return d.toLocaleString();
}

async function loadRecovery(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [recoveryPayload, settingsPayload] = await Promise.all([
      fetchRecovery({ days: 7 }),
      fetchRecoverySettings(),
    ]);
    recovery.value = recoveryPayload;
    if (!recovery.value.recovery_settings) {
      recovery.value.recovery_settings = settingsPayload.settings;
    }
    for (const [code, restHours] of Object.entries(settingsPayload.settings)) {
      if (recovery.value.muscles[code]) {
        recovery.value.muscles[code].rest_hours = restHours;
      }
    }
    syncDraftFromRecovery();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "회복 데이터 조회 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

async function saveRestSettings(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload: Record<string, number> = {};
    for (const [code, value] of Object.entries(restHoursDraft.value)) {
      payload[code] = Number(value);
    }
    await updateRecoverySettings(payload);
    await loadRecovery();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "회복 설정 저장 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadRecovery();
});
</script>
