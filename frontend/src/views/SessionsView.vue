<template>
  <section class="card">
    <div class="row">
      <h2>Recent Sessions 📘</h2>
      <div class="row" style="gap:8px;">
        <button class="secondary" :disabled="loading || resetting" @click="refresh">
          {{ loading ? "Loading..." : "Refresh" }}
        </button>
        <button class="secondary" :disabled="loading || resetting" @click="resetAll">
          {{ resetting ? "Resetting..." : "Reset All" }}
        </button>
      </div>
    </div>
    <p class="hint">최근 5건을 기본으로 보여드려요 👀</p>

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

  <section class="card">
    <h2>Bodyweight (맨몸운동 환산) 💪</h2>
    <p class="hint">풀업은 기본 70kg로 계산돼요. 원하면 본인 체중으로 바꿔주세요 🙂</p>
    <div class="editor-grid">
      <label class="field">
        <span>체중(kg)</span>
        <input v-model.number="bodyweightKg" type="number" min="30" max="250" step="0.1" />
      </label>
    </div>
    <button :disabled="bodyweightSaving" @click="saveBodyweight">
      {{ bodyweightSaving ? "Saving..." : "Save Bodyweight" }}
    </button>
    <p v-if="bodyweightError" class="error">{{ bodyweightError }}</p>
  </section>

  <section class="card">
    <h2>Exercise Alias Override 🧠</h2>
    <p class="hint">반복되는 OCR 오인식을 직접 정규 운동명으로 매핑해요.</p>

    <div class="editor-grid">
      <label class="field">
        <span>OCR 오인식 원문</span>
        <input v-model="aliasRaw" type="text" placeholder="예: 풀업 ㄱ" />
      </label>
      <label class="field">
        <span>정규 운동명</span>
        <input v-model="canonicalName" type="text" placeholder="예: 풀 업" />
      </label>
    </div>
    <button :disabled="aliasSaving" @click="saveAlias">
      {{ aliasSaving ? "Saving..." : "Save Alias" }}
    </button>

    <p v-if="aliasError" class="error">{{ aliasError }}</p>

    <table v-if="aliases.length > 0">
      <thead>
        <tr>
          <th>Alias</th>
          <th>Canonical</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in aliases" :key="item.id">
          <td>{{ item.alias_raw }}</td>
          <td>{{ item.canonical_name }}</td>
          <td>
            <button class="secondary" @click="removeAlias(item.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="hint">등록된 커스텀 alias가 없습니다.</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  createExerciseAlias,
  fetchBodyweight,
  deleteExerciseAlias,
  fetchExerciseAliases,
  fetchSessions,
  resetSessions,
  updateBodyweight,
} from "../api/client";
import type { ExerciseAliasOverride, SessionListItem } from "../types";

const sessions = ref<SessionListItem[]>([]);
const loading = ref(false);
const resetting = ref(false);
const errorMessage = ref("");

const aliases = ref<ExerciseAliasOverride[]>([]);
const aliasRaw = ref("");
const canonicalName = ref("");
const aliasSaving = ref(false);
const aliasError = ref("");
const bodyweightKg = ref(70);
const bodyweightSaving = ref(false);
const bodyweightError = ref("");

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

async function refreshAliases(): Promise<void> {
  aliasError.value = "";
  try {
    aliases.value = await fetchExerciseAliases();
  } catch (error) {
    aliasError.value = error instanceof Error ? error.message : "alias 조회 중 오류가 발생했습니다.";
  }
}

async function refreshBodyweight(): Promise<void> {
  bodyweightError.value = "";
  try {
    const payload = await fetchBodyweight();
    bodyweightKg.value = payload.bodyweight_kg;
  } catch (error) {
    bodyweightError.value = error instanceof Error ? error.message : "체중 설정 조회 중 오류가 발생했습니다.";
  }
}

async function saveBodyweight(): Promise<void> {
  bodyweightSaving.value = true;
  bodyweightError.value = "";
  try {
    const payload = await updateBodyweight(Number(bodyweightKg.value));
    bodyweightKg.value = payload.bodyweight_kg;
  } catch (error) {
    bodyweightError.value = error instanceof Error ? error.message : "체중 설정 저장 중 오류가 발생했습니다.";
  } finally {
    bodyweightSaving.value = false;
  }
}

async function saveAlias(): Promise<void> {
  if (!aliasRaw.value.trim() || !canonicalName.value.trim()) {
    aliasError.value = "alias와 canonical 이름을 모두 입력해 주세요.";
    return;
  }
  aliasSaving.value = true;
  aliasError.value = "";
  try {
    await createExerciseAlias({
      alias_raw: aliasRaw.value,
      canonical_name: canonicalName.value,
    });
    aliasRaw.value = "";
    canonicalName.value = "";
    await refreshAliases();
  } catch (error) {
    aliasError.value = error instanceof Error ? error.message : "alias 저장 중 오류가 발생했습니다.";
  } finally {
    aliasSaving.value = false;
  }
}

async function removeAlias(id: string): Promise<void> {
  aliasError.value = "";
  try {
    await deleteExerciseAlias(id);
    await refreshAliases();
  } catch (error) {
    aliasError.value = error instanceof Error ? error.message : "alias 삭제 중 오류가 발생했습니다.";
  }
}

async function resetAll(): Promise<void> {
  if (!window.confirm("모든 세션을 초기화할까요? (업로드 기록도 함께 삭제됩니다)")) {
    return;
  }
  resetting.value = true;
  errorMessage.value = "";
  try {
    await resetSessions();
    await refresh();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "세션 초기화 중 오류가 발생했습니다.";
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  void refresh();
  void refreshBodyweight();
  void refreshAliases();
});
</script>
