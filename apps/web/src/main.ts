import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import AdminPage from "./pages/AdminPage.vue";
import HomePage from "./pages/HomePage.vue";
import ResultsPage from "./pages/ResultsPage.vue";
import "./styles.css";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/results", component: ResultsPage },
    { path: "/admin", component: AdminPage },
  ],
});

createApp(App).use(router).mount("#app");
