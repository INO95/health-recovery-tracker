<template>
  <section class="card">
    <div class="row">
      <h2>Recent Sessions 📘</h2>
      <div class="row" style="gap:8px;">
        <button
          class="secondary"
          :disabled="loading || resetting || refreshBlockedByRateLimit"
          :title="refreshButtonTooltip"
          @click="refresh"
        >
          {{ refreshButtonLabel }}
        </button>
        <button class="secondary" :disabled="loading || resetting" @click="resetAll">
          {{ resetting ? "Resetting..." : "Reset All" }}
        </button>
      </div>
    </div>
    <p class="hint">최근 5건을 기본으로 보여드려요 👀</p>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="retryNotice && loading" class="hint">{{ retryNotice }}</p>
    <p v-if="loading" class="hint">세션을 불러오는 중입니다...</p>
    <p v-if="rateLimitNotice && !loading" class="hint">{{ rateLimitNotice }}</p>
    <p v-if="refreshCooldownDetail && !loading" class="hint">{{ refreshCooldownDetail }}</p>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
  createExerciseAlias,
  fetchBodyweight,
  deleteExerciseAlias,
  fetchExerciseAliases,
  getLastApiRateLimitInfo,
  fetchSessions,
  resetSessions,
  updateBodyweight,
} from "../api/client";
import type { ExerciseAliasOverride, SessionListItem } from "../types";
import { formatClientError } from "../utils/apiError";
import { buildRateLimitNotice, getRateLimitCooldownMs } from "../utils/rateLimit";
import { withRetry } from "../utils/retry";

const sessions = ref<SessionListItem[]>([]);
const loading = ref(false);
const resetting = ref(false);
const errorMessage = ref("");
const retryNotice = ref("");
const rateLimitNotice = ref("");
const rateLimitCooldownUntilMs = ref(0);
const cooldownNowMs = ref(Date.now());
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

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
const refreshBlockedByRateLimit = computed(() => rateLimitCooldownSec.value > 0);
const refreshCooldownDetail = computed(() => {
  if (!refreshBlockedByRateLimit.value) {
    return "";
  }
  return `요청 한도 보호로 새로고침이 잠시 비활성화됩니다. ${rateLimitCooldownSec.value}초 후 재시도 가능 (해제 시각: ${formatCooldownReleaseTime(rateLimitCooldownUntilMs.value)}).`;
});
const refreshButtonLabel = computed(() => {
  if (loading.value) {
    return "Loading...";
  }
  if (refreshBlockedByRateLimit.value) {
    return `Refresh (${rateLimitCooldownSec.value}s)`;
  }
  return "Refresh";
});
const refreshButtonTooltip = computed(() =>
  refreshBlockedByRateLimit.value ? refreshCooldownDetail.value : "세션 목록을 새로고침합니다."
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

async function refresh(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  retryNotice.value = "";
  if (refreshBlockedByRateLimit.value) {
    loading.value = false;
    return;
  }
  try {
    sessions.value = await withRetry(() => fetchSessions({ limit: 5 }), {
      retries: 2,
      onRetry: ({ nextAttempt, maxAttempts, delayMs }) => {
        const retryAfterSeconds = Math.max(1, Math.ceil(delayMs / 1000));
        retryNotice.value = `세션 조회 실패로 자동 재시도합니다... (${nextAttempt}/${maxAttempts}, 약 ${retryAfterSeconds}초 후)`;
      },
    });
    retryNotice.value = "";
    syncRateLimitUi("/api/sessions");
  } catch (error) {
    retryNotice.value = "";
    errorMessage.value = formatClientError("세션 조회 실패", error);
    syncRateLimitUi("/api/sessions");
  } finally {
    loading.value = false;
  }
}

async function refreshAliases(): Promise<void> {
  aliasError.value = "";
  try {
    aliases.value = await fetchExerciseAliases();
  } catch (error) {
    aliasError.value = formatClientError("Alias 조회 실패", error);
  }
}

async function refreshBodyweight(): Promise<void> {
  bodyweightError.value = "";
  try {
    const payload = await fetchBodyweight();
    bodyweightKg.value = payload.bodyweight_kg;
  } catch (error) {
    bodyweightError.value = formatClientError("체중 설정 조회 실패", error);
  }
}

async function saveBodyweight(): Promise<void> {
  bodyweightSaving.value = true;
  bodyweightError.value = "";
  try {
    const payload = await updateBodyweight(Number(bodyweightKg.value));
    bodyweightKg.value = payload.bodyweight_kg;
  } catch (error) {
    bodyweightError.value = formatClientError("체중 설정 저장 실패", error);
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
    aliasError.value = formatClientError("Alias 저장 실패", error);
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
    aliasError.value = formatClientError("Alias 삭제 실패", error);
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
    errorMessage.value = formatClientError("세션 초기화 실패", error);
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  void refresh();
  void refreshBodyweight();
  void refreshAliases();
});

onUnmounted(() => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
});
</script>
