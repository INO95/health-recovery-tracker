<template>
  <section class="card">
    <div class="row">
      <h2>Recovery 🔋</h2>
      <button
        class="secondary touch-button"
        :disabled="loading || retryBlockedByRateLimit"
        :title="retryButtonTooltip"
        @click="loadRecovery"
      >
        {{ retryButtonLabel }}
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
    <p v-if="retryNotice && loading" class="hint">{{ retryNotice }}</p>
    <p v-if="rateLimitNotice && !loading" class="hint">{{ rateLimitNotice }}</p>
    <p v-if="retryCooldownDetail && !loading" class="hint">{{ retryCooldownDetail }}</p>
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
      <p class="hint">
        아래 운동명은 근육 매핑이 없어 정확도가 낮습니다. <RouterLink to="/sessions">Sessions</RouterLink>에서 Alias
        Override로 정규 이름을 등록하면 바로 개선됩니다.
      </p>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { fetchRecovery, fetchRecoverySettings, getLastApiRateLimitInfo, updateRecoverySettings } from "../api/client";
import type { RecoveryResponse } from "../types";
import { formatClientError } from "../utils/apiError";
import { buildRateLimitNotice, getRateLimitCooldownMs } from "../utils/rateLimit";
import { withRetry } from "../utils/retry";

const loading = ref(false);
const errorMessage = ref("");
const retryNotice = ref("");
const rateLimitNotice = ref("");
const recovery = ref<RecoveryResponse | null>(null);
const restHoursDraft = ref<Record<string, number>>({});
const rateLimitCooldownUntilMs = ref(0);
const cooldownNowMs = ref(Date.now());
let cooldownTimer: ReturnType<typeof setInterval> | null = null;

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

const rateLimitCooldownSec = computed(() => Math.max(0, Math.ceil((rateLimitCooldownUntilMs.value - cooldownNowMs.value) / 1000)));
const retryBlockedByRateLimit = computed(() => rateLimitCooldownSec.value > 0);
const retryCooldownDetail = computed(() => {
  if (!retryBlockedByRateLimit.value) {
    return "";
  }
  return `요청 한도 보호로 회복 조회가 잠시 비활성화됩니다. ${rateLimitCooldownSec.value}초 후 재시도 가능 (해제 시각: ${formatCooldownReleaseTime(rateLimitCooldownUntilMs.value)}).`;
});
const retryButtonLabel = computed(() => {
  if (loading.value) {
    return "Loading...";
  }
  if (retryBlockedByRateLimit.value) {
    return `Retry (${rateLimitCooldownSec.value}s)`;
  }
  return "Retry";
});
const retryButtonTooltip = computed(() =>
  retryBlockedByRateLimit.value ? retryCooldownDetail.value : "회복 데이터를 다시 조회합니다."
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

async function loadRecovery(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  retryNotice.value = "";
  if (retryBlockedByRateLimit.value) {
    loading.value = false;
    return;
  }
  try {
    const [recoveryPayload, settingsPayload] = await withRetry(
      () =>
        Promise.all([
          fetchRecovery({ days: 7 }),
          fetchRecoverySettings(),
        ]),
      {
        retries: 2,
        onRetry: ({ nextAttempt, maxAttempts, delayMs }) => {
          const retryAfterSeconds = Math.max(1, Math.ceil(delayMs / 1000));
          retryNotice.value = `회복 데이터 조회 실패로 자동 재시도합니다... (${nextAttempt}/${maxAttempts}, 약 ${retryAfterSeconds}초 후)`;
        },
      }
    );
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
    retryNotice.value = "";
    syncRateLimitUi("/api/recovery");
  } catch (error) {
    retryNotice.value = "";
    errorMessage.value = formatClientError("회복 데이터 조회 실패", error);
    syncRateLimitUi("/api/recovery");
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
    errorMessage.value = formatClientError("회복 설정 저장 실패", error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadRecovery();
});

onUnmounted(() => {
  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
});
</script>
