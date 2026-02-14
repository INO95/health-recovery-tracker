import { handleRequest } from "./router";
import type { Env } from "./types";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    return handleRequest(req, env);
  },
};

