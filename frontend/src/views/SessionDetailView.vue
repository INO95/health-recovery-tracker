<template>
  <section class="card">
    <RouterLink to="/sessions" class="back-link">← Back to Sessions</RouterLink>
    <h2>Session Detail</h2>

    <p v-if="loading" class="hint">세션 상세를 불러오는 중입니다...</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <template v-if="session">
      <div class="metrics">
        <span><strong>Date:</strong> {{ session.date }}</span>
        <span><strong>Calories:</strong> {{ session.calories_kcal ?? "-" }} kcal</span>
        <span><strong>Duration:</strong> {{ session.duration_min ?? "-" }} min</span>
        <span><strong>Volume:</strong> {{ session.volume_kg ?? "-" }} kg</span>
      </div>

      <article v-for="exercise in session.exercises" :key="exercise.id" class="exercise-card">
        <h3>{{ exercise.order_index }}. {{ exercise.raw_name }}</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Weight(kg)</th>
              <th>Reps</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="setRow in exercise.sets" :key="setRow.id">
              <td>{{ setRow.set_index }}</td>
              <td>{{ setRow.weight_kg ?? "" }}</td>
              <td>{{ setRow.reps }}</td>
            </tr>
          </tbody>
        </table>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchSessionDetail } from "../api/client";
import type { SessionDetail } from "../types";

const route = useRoute();
const session = ref<SessionDetail | null>(null);
const loading = ref(false);
const errorMessage = ref("");

async function loadDetail(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    session.value = await fetchSessionDetail(String(route.params.id || ""));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 상세 조회 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadDetail();
});
</script>
