<template>
  <section class="card">
    <div class="row">
      <h2>Recent Sessions</h2>
      <button class="secondary" :disabled="loading" @click="refresh">
        {{ loading ? "Loading..." : "Refresh" }}
      </button>
    </div>
    <p class="hint">최근 5건을 기본으로 조회합니다.</p>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="loading" class="hint">세션을 불러오는 중입니다...</p>
    <p v-else-if="sessions.length === 0" class="hint">표시할 세션이 없습니다.</p>

    <ul class="session-list">
      <li v-for="session in sessions" :key="session.id" class="session-item">
        <RouterLink :to="`/sessions/${session.id}`" class="session-link">
          <strong>{{ session.date }}</strong>
          <span>{{ formatMetric("kcal", session.calories_kcal) }}</span>
          <span>{{ formatMetric("min", session.duration_min) }}</span>
          <span>{{ formatMetric("kg", session.volume_kg) }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchSessions } from "../api/client";
import type { SessionListItem } from "../types";

const sessions = ref<SessionListItem[]>([]);
const loading = ref(false);
const errorMessage = ref("");

function formatMetric(unit: string, value: number | null): string {
  if (value == null) {
    return `- ${unit}`;
  }
  return `${value} ${unit}`;
}

async function refresh(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    sessions.value = await fetchSessions({ limit: 5 });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 조회 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>
