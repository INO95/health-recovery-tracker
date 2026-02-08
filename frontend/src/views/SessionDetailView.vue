<template>
  <section class="card">
    <RouterLink to="/sessions" class="back-link">← Back to Sessions</RouterLink>
    <div class="row">
      <h2>Session Detail</h2>
      <div class="row" style="gap:8px;">
        <button class="secondary" :disabled="loading || saving" @click="loadDetail">Reload</button>
        <button class="secondary" :disabled="loading || cloning" @click="cloneCurrent">{{ cloning ? "Cloning..." : "Clone" }}</button>
        <button :disabled="loading || saving" @click="saveSession">{{ saving ? "Saving..." : "Save" }}</button>
        <button class="secondary" :disabled="loading || deleting" @click="removeSession">{{ deleting ? "Deleting..." : "Delete" }}</button>
      </div>
    </div>

    <p v-if="loading" class="hint">세션 상세를 불러오는 중입니다...</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <template v-if="session">
      <div class="editor-grid">
        <label class="field">
          <span>Date</span>
          <input v-model="session.date" type="date" />
        </label>
        <label class="field">
          <span>Started At</span>
          <input v-model="startedAtLocal" type="datetime-local" />
        </label>
        <label class="field">
          <span>Calories</span>
          <input v-model.number="session.calories_kcal" type="number" min="0" />
        </label>
        <label class="field">
          <span>Duration(min)</span>
          <input v-model.number="session.duration_min" type="number" min="0" />
        </label>
        <label class="field">
          <span>Volume(kg)</span>
          <input v-model.number="session.volume_kg" type="number" min="0" step="0.1" />
        </label>
      </div>

      <article v-for="exercise in session.exercises" :key="exercise.id" class="exercise-card">
        <label class="field">
          <span>{{ exercise.order_index }}. 운동명</span>
          <input v-model="exercise.raw_name" type="text" />
        </label>
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
              <td><input v-model.number="setRow.weight_kg" type="number" min="0" step="0.5" /></td>
              <td><input v-model.number="setRow.reps" type="number" min="0" /></td>
            </tr>
          </tbody>
        </table>
      </article>
    </template>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { cloneSession, deleteSession, fetchSessionDetail, updateSession } from "../api/client";
import type { SessionDetail, SessionUpdatePayload } from "../types";

const route = useRoute();
const router = useRouter();
const session = ref<SessionDetail | null>(null);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const cloning = ref(false);
const errorMessage = ref("");
const startedAtLocal = ref("");

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(localValue: string, fallbackDate: string): string {
  const trimmed = localValue.trim();
  if (trimmed) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return `${fallbackDate}T12:00:00.000Z`;
}

async function loadDetail(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    session.value = await fetchSessionDetail(String(route.params.id || ""));
    startedAtLocal.value = isoToLocalInput(session.value.started_at);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 상세 조회 중 오류가 발생했습니다.";
  } finally {
    loading.value = false;
  }
}

function toUpdatePayload(detail: SessionDetail): SessionUpdatePayload {
  return {
    date: detail.date,
    started_at: localInputToIso(startedAtLocal.value, detail.date),
    calories_kcal: detail.calories_kcal,
    duration_min: detail.duration_min,
    volume_kg: detail.volume_kg,
    exercises: detail.exercises.map((exercise) => ({
      raw_name: exercise.raw_name,
      order_index: exercise.order_index,
      sets: exercise.sets.map((setRow) => ({
        set_index: setRow.set_index,
        weight_kg: setRow.weight_kg,
        reps: setRow.reps,
      })),
    })),
  };
}

async function saveSession(): Promise<void> {
  if (!session.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    session.value = await updateSession(session.value.id, toUpdatePayload(session.value));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 수정 중 오류가 발생했습니다.";
  } finally {
    saving.value = false;
  }
}

async function removeSession(): Promise<void> {
  if (!session.value) return;
  if (!window.confirm("이 세션을 삭제할까요?")) return;

  deleting.value = true;
  errorMessage.value = "";
  try {
    await deleteSession(session.value.id);
    await router.push("/sessions");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 삭제 중 오류가 발생했습니다.";
  } finally {
    deleting.value = false;
  }
}

async function cloneCurrent(): Promise<void> {
  if (!session.value) return;
  const nextDate = window.prompt("복제할 날짜(YYYY-MM-DD). 비우면 오늘 날짜", "") || "";

  cloning.value = true;
  errorMessage.value = "";
  try {
    const cloned = await cloneSession(session.value.id, nextDate.trim() || undefined);
    await router.push(`/sessions/${cloned.id}`);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 복제 중 오류가 발생했습니다.";
  } finally {
    cloning.value = false;
  }
}

onMounted(() => {
  void loadDetail();
});
</script>
