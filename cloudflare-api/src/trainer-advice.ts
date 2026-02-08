export type AdviceInput = Record<
  string,
  { name?: string; recovery: number; status: string; remaining_hours: number; next_train_at: string | null }
>;

export type TrainerAdvice = {
  summary: string;
  recommend_train: string[];
  recommend_light: string[];
  recommend_rest: string[];
  message_train: string;
  message_rest: string;
  message_timing: string;
};

const MUSCLE_KO: Record<string, string> = {
  chest: "가슴",
  back: "등",
  legs: "하체",
  shoulders: "어깨",
  biceps: "이두",
  triceps: "삼두",
  core: "코어",
  cardio: "유산소",
};

function label(code: string, fallbackName?: string): string {
  return MUSCLE_KO[code] || fallbackName || code;
}

function formatDateKstLike(iso: string | null): string {
  if (!iso) return "미정";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "미정";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function buildTrainerAdvice(muscles: AdviceInput, referenceAt?: string): TrainerAdvice {
  const entries = Object.entries(muscles);
  const recommend_train = entries.filter(([, m]) => m.recovery >= 80 && m.remaining_hours <= 0.01).map(([code]) => code);
  const recommend_light = entries
    .filter(([, m]) => m.remaining_hours <= 0.01 && m.recovery >= 40 && m.recovery < 80)
    .map(([code]) => code);
  const recommend_rest = entries.filter(([, m]) => m.remaining_hours > 0.01 || m.recovery < 40).map(([code]) => code);

  const trainKo = recommend_train.map((code) => label(code, muscles[code]?.name));
  const lightKo = recommend_light.map((code) => label(code, muscles[code]?.name));
  const restKo = recommend_rest.map((code) => label(code, muscles[code]?.name));

  let summary = "현재 기록 기준 회복 상태를 분석했습니다.";
  if (trainKo.length > 0) {
    summary = `다음 운동은 ${trainKo.join(", ")} 부위를 우선 추천합니다.`;
  } else if (lightKo.length > 0) {
    summary = `${lightKo.join(", ")} 부위는 가볍게 진행하는 것을 추천합니다.`;
  }

  const message_train = trainKo.length > 0
    ? `추천 부위: ${trainKo.join(", ")}`
    : "추천 부위가 부족합니다. 회복률이 높은 부위가 없습니다.";

  const message_rest = restKo.length > 0
    ? `휴식 권장: ${restKo.join(", ")} 부위는 쉬는 것이 좋습니다.`
    : "강한 휴식 권장 부위는 없습니다.";

  const timingTarget = entries
    .filter(([, m]) => m.remaining_hours > 0.01)
    .sort((a, b) => b[1].remaining_hours - a[1].remaining_hours)[0];

  let message_timing = "모든 부위가 바로 운동 가능한 상태입니다.";
  if (timingTarget) {
    const [code, muscle] = timingTarget;
    const labelKo = label(code, muscle.name);
    message_timing = `${labelKo} 완전 회복까지 약 ${Math.ceil(muscle.remaining_hours)}시간 남았습니다. (예상: ${formatDateKstLike(
      muscle.next_train_at
    )})`;
  } else if (referenceAt) {
    const ref = formatDateKstLike(referenceAt);
    message_timing = `기준 시각(${ref}) 기준으로 모든 부위가 회복된 상태입니다.`;
  }

  return {
    summary,
    recommend_train,
    recommend_light,
    recommend_rest,
    message_train,
    message_rest,
    message_timing,
  };
}
