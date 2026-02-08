export type ExerciseAlias = {
  canonical: string;
  keys: string[];
};

// Canonical names are kept in Korean for UI consistency.
export const EXERCISE_NAME_ALIASES: ExerciseAlias[] = [
  // Chest
  {
    canonical: "바벨 플랫 벤치 프레스",
    keys: [
      "바벨플랫벤치프레스",
      "benchpress",
      "barbellbenchpress",
      "ベンチプレス",
      "バーベルベンチプレス",
    ],
  },
  {
    canonical: "덤벨 플랫 벤치 프레스",
    keys: [
      "덤벨플랫벤치프레스",
      "덤벨벤치프레스",
      "dumbbellbenchpress",
      "dumbbellflatbenchpress",
      "ダンベルベンチプレス",
    ],
  },
  {
    canonical: "덤벨 인클라인 벤치 프레스",
    keys: [
      "덤벨인클라인벤치프레스",
      "인클라인벤치프레스",
      "inclinebenchpress",
      "inclinedumbbellpress",
      "インクラインベンチプレス",
      "インクラインダンベルプレス",
    ],
  },
  {
    canonical: "스미스 머신 클로즈 그립 벤치 프레스",
    keys: [
      "스미스머신클로즈그립벤치프레스",
      "클로즈그립벤치프레스",
      "closegripbenchpress",
      "smithmachineclosegripbenchpress",
      "スミスマシンクローズグリップベンチプレス",
    ],
  },
  {
    canonical: "라잉 덤벨 풀오버",
    keys: [
      "라잉덤벨풀오버",
      "덤벨풀오버",
      "풀오버",
      "dumbbellpullover",
      "lyingdumbbellpullover",
      "ダンベルプルオーバー",
    ],
  },

  // Back
  {
    canonical: "풀 업",
    keys: [
      "풀업",
      "풀 업",
      "pullup",
      "pull up",
      "chinup",
      "chin up",
      "懸垂",
      "チンニング",
      "プルアップ",
    ],
  },
  {
    canonical: "랫 풀다운",
    keys: ["랫풀다운", "latpulldown", "latpull-down", "ラットプルダウン"],
  },
  {
    canonical: "바벨 로우",
    keys: ["바벨로우", "barbellrow", "bentoverrow", "ベントオーバーロー", "バーベルロー"],
  },
  {
    canonical: "시티드 케이블 로우",
    keys: ["시티드케이블로우", "seatedcablerow", "cablerow", "シーテッドロー", "ケーブルロー"],
  },
  {
    canonical: "데드리프트",
    keys: ["데드리프트", "deadlift", "デッドリフト"],
  },
  {
    canonical: "루마니안 데드리프트",
    keys: ["루마니안데드리프트", "romaniandeadlift", "rdl", "ルーマニアンデッドリフト"],
  },

  // Legs
  {
    canonical: "스쿼트",
    keys: ["스쿼트", "squat", "スクワット"],
  },
  {
    canonical: "레그 프레스",
    keys: ["레그프레스", "legpress", "レッグプレス"],
  },
  {
    canonical: "레그 익스텐션",
    keys: ["레그익스텐션", "legextension", "レッグエクステンション"],
  },
  {
    canonical: "레그 컬",
    keys: ["레그컬", "legcurl", "レッグカール"],
  },
  {
    canonical: "런지",
    keys: ["런지", "lunge", "ランジ"],
  },
  {
    canonical: "힙 쓰러스트",
    keys: ["힙쓰러스트", "hipthrust", "ヒップスラスト"],
  },
  {
    canonical: "카프 레이즈",
    keys: ["카프레이즈", "calfraise", "カーフレイズ"],
  },

  // Shoulders
  {
    canonical: "숄더 프레스",
    keys: ["숄더프레스", "shoulderpress", "overheadpress", "ショルダープレス"],
  },
  {
    canonical: "사이드 레터럴 레이즈",
    keys: ["사이드레터럴레이즈", "lateralraise", "side raise", "サイドレイズ"],
  },
  {
    canonical: "리어 델트 플라이",
    keys: ["리어델트플라이", "reardeltfly", "reversefly", "リアデルトフライ"],
  },
  {
    canonical: "업라이트 로우",
    keys: ["업라이트로우", "uprightrow", "アップライトロー"],
  },

  // Arms
  {
    canonical: "덤벨 바이셉 컬",
    keys: ["덤벨바이셉컬", "덤벨컬", "bicepscurl", "dumbbellcurl", "ダンベルカール"],
  },
  {
    canonical: "해머 컬",
    keys: ["해머컬", "hammercurl", "ハンマーカール"],
  },
  {
    canonical: "트라이셉 푸시다운",
    keys: ["트라이셉푸시다운", "tricepspushdown", "cablepushdown", "トライセプスプッシュダウン"],
  },
  {
    canonical: "오버헤드 트라이셉 익스텐션",
    keys: [
      "오버헤드트라이셉익스텐션",
      "tricepsoverheadextension",
      "overheadtricepsextension",
      "オーバーヘッドトライセプスエクステンション",
    ],
  },

  // Core/Cardio
  {
    canonical: "크런치",
    keys: ["크런치", "crunch", "クランチ"],
  },
  {
    canonical: "플랭크",
    keys: ["플랭크", "plank", "プランク"],
  },
  {
    canonical: "레그 레이즈",
    keys: ["레그레이즈", "legraise", "レッグレイズ"],
  },
  {
    canonical: "런닝",
    keys: ["런닝", "러닝", "running", "ランニング"],
  },
  {
    canonical: "사이클",
    keys: ["사이클", "cycling", "bike", "バイク"],
  },
];
