<template>
  <section class="card">
    <div class="row">
      <h2>Recovery</h2>
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchRecovery } from "../api/client";
import type { RecoveryResponse } from "../types";

const loading = ref(false);
const errorMessage = ref("");
const recovery = ref<RecoveryResponse | null>(null);

const sortedMuscles = computed(() => {
  if (!recovery.value) {
    return [];
  }
  return Object.entries(recovery.value.muscles)
    .map(([code, data]) => ({ code, data }))
    .sort((a, b) => b.data.fatigue - a.data.fatigue);
});

async function loadRecovery(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    recovery.value = await fetchRecovery({ days: 7 });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "회복 데이터 조회 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadRecovery();
});
</script>
