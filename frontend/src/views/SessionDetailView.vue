<template>
  <section class="card">
    <RouterLink to="/sessions" class="back-link">← Back to Sessions</RouterLink>
    <div class="row">
      <h2>Session Detail</h2>
      <div class="row" style="gap:8px;">
        <button
          class="secondary"
          :disabled="loading || saving || reloadBlockedByRateLimit"
          :title="reloadButtonTooltip"
          @click="loadDetail"
        >
          {{ reloadButtonLabel }}
        </button>
        <button class="secondary" :disabled="loading || cloning" @click="cloneCurrent">{{ cloning ? "Cloning..." : "Clone" }}</button>
        <button :disabled="loading || saving" @click="saveSession">{{ saving ? "Saving..." : "Save" }}</button>
        <button class="secondary" :disabled="loading || deleting" @click="removeSession">{{ deleting ? "Deleting..." : "Delete" }}</button>
      </div>
    </div>

    <p v-if="loading" class="hint">세션 상세를 불러오는 중입니다...</p>
    <p v-if="retryNotice && loading" class="hint">{{ retryNotice }}</p>
    <p v-if="rateLimitNotice && !loading" class="hint">{{ rateLimitNotice }}</p>
    <p v-if="reloadCooldownDetail && !loading" class="hint">{{ reloadCooldownDetail }}</p>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { cloneSession, deleteSession, fetchSessionDetail, getLastApiRateLimitInfo, updateSession } from "../api/client";
import type { SessionDetail, SessionUpdatePayload } from "../types";
import { formatClientError } from "../utils/apiError";
import { buildRateLimitNotice, getRateLimitCooldownMs } from "../utils/rateLimit";
import { withRetry } from "../utils/retry";

const route = useRoute();
const router = useRouter();
const session = ref<SessionDetail | null>(null);
const loading = ref(false);
const saving = ref(false);
const deleting = ref(false);
const cloning = ref(false);
const errorMessage = ref("");
const retryNotice = ref("");
const rateLimitNotice = ref("");
const startedAtLocal = ref("");
const rateLimitCooldownUntilMs = ref(0);
const cooldownNowMs = ref(Date.now());
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

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

function formatCooldownReleaseTime(targetMs: number): string {
  const target = new Date(targetMs);
  if (Number.isNaN(target.getTime())) {
    return "-";
  }
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const hours = String(target.getHours()).padStart(2, "0");
  const minutes = String(target.getMinutes()).padStart(2, "0");
  const seconds = String(target.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const rateLimitCooldownSec = computed(() => Math.max(0, Math.ceil((rateLimitCooldownUntilMs.value - cooldownNowMs.value) / 1000)));
const reloadBlockedByRateLimit = computed(() => rateLimitCooldownSec.value > 0);
const reloadCooldownDetail = computed(() => {
  if (!reloadBlockedByRateLimit.value) {
    return "";
  }
  return `요청 한도 보호로 상세 재조회가 잠시 비활성화됩니다. ${rateLimitCooldownSec.value}초 후 재시도 가능 (해제 시각: ${formatCooldownReleaseTime(rateLimitCooldownUntilMs.value)}).`;
});
const reloadButtonLabel = computed(() => {
  if (loading.value) {
    return "Loading...";
  }
  if (reloadBlockedByRateLimit.value) {
    return `Reload (${rateLimitCooldownSec.value}s)`;
  }
  return "Reload";
});
const reloadButtonTooltip = computed(() =>
  reloadBlockedByRateLimit.value ? reloadCooldownDetail.value : "세션 상세를 다시 조회합니다."
);

function ensureCooldownTicker(): void {
  const active = rateLimitCooldownUntilMs.value > Date.now();
  if (active && !cooldownTimer) {
    cooldownTimer = setInterval(() => {
      cooldownNowMs.value = Date.now();
      if (rateLimitCooldownUntilMs.value <= cooldownNowMs.value && cooldownTimer) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 500);
    return;
  }
  if (!active && cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function syncRateLimitUi(pathPrefix: string): void {
  const info = getLastApiRateLimitInfo();
  rateLimitNotice.value = buildRateLimitNotice(info, {
    pathPrefix,
  });
  const cooldownMs = getRateLimitCooldownMs(info, {
    pathPrefix,
  });
  rateLimitCooldownUntilMs.value = cooldownMs > 0 ? Date.now() + cooldownMs : 0;
  cooldownNowMs.value = Date.now();
  ensureCooldownTicker();
}

async function loadDetail(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  retryNotice.value = "";
  if (reloadBlockedByRateLimit.value) {
    loading.value = false;
    return;
  }
  try {
    session.value = await withRetry(() => fetchSessionDetail(String(route.params.id || "")), {
      retries: 2,
      onRetry: ({ nextAttempt, maxAttempts, delayMs }) => {
        const retryAfterSeconds = Math.max(1, Math.ceil(delayMs / 1000));
        retryNotice.value = `세션 상세 조회 실패로 자동 재시도합니다... (${nextAttempt}/${maxAttempts}, 약 ${retryAfterSeconds}초 후)`;
      },
    });
    startedAtLocal.value = isoToLocalInput(session.value.started_at);
    retryNotice.value = "";
    syncRateLimitUi("/api/sessions/");
  } catch (error) {
    retryNotice.value = "";
    errorMessage.value = formatClientError("세션 상세 조회 실패", error);
    syncRateLimitUi("/api/sessions/");
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
    errorMessage.value = formatClientError("세션 수정 실패", error);
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
    errorMessage.value = formatClientError("세션 삭제 실패", error);
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
    errorMessage.value = formatClientError("세션 복제 실패", error);
  } finally {
    cloning.value = false;
  }
}

onMounted(() => {
  void loadDetail();
});

onUnmounted(() => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
});
</script>
