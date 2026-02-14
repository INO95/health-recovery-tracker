export type Env = {
  DB: D1Database;
  UPLOADS: R2Bucket;
  RATE_LIMIT_ENABLED?: string;
  RATE_LIMIT_MAX_PER_MINUTE?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
};

export type RequestContext = {
  requestId: string;
};
