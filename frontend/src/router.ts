import { createRouter, createWebHistory } from "vue-router";
import RecoveryView from "./views/RecoveryView.vue";
import SessionDetailView from "./views/SessionDetailView.vue";
import SessionsView from "./views/SessionsView.vue";
import UploadView from "./views/UploadView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/upload" },
    { path: "/upload", component: UploadView },
    { path: "/sessions", component: SessionsView },
    { path: "/sessions/:id", component: SessionDetailView },
    { path: "/recovery", component: RecoveryView },
  ],
});
