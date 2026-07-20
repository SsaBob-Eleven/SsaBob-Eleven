<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink class="brand" to="/" aria-label="싸밥일레븐 홈">
        <span class="brand-mark">11</span>
        <span>
          <strong>싸밥일레븐</strong>
          <small>오늘은 누구와 어디서 먹을까?</small>
        </span>
      </RouterLink>
      <nav aria-label="주요 메뉴">
        <RouterLink to="/">투표</RouterLink>
        <RouterLink to="/results">조 편성</RouterLink>
        <RouterLink to="/admin">관리</RouterLink>
      </nav>
    </header>
    <main>
      <RouterView />
    </main>
    <footer>최대 26명 · 평일 매일 · 모든 시간은 한국 기준</footer>
  </div>
</template>
