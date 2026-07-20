<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import type { RegistrationDto, RoundDto, TeamDto } from "@ssabap/shared";
import { api, subscribeRoundEvents, type DevAction, type RoundEvent } from "../api";

const token = ref(sessionStorage.getItem("lunch-admin-token") ?? "");
const error = ref("");
const loading = ref(false);
const rounds = ref<Array<{ round: RoundDto; registrationCount: number; teamCount: number }>>([]);
const selected = ref<{ round: RoundDto; registrations: RegistrationDto[]; teams: TeamDto[]; generationAudit: unknown } | null>(null);
const realtimeConnected = ref(false);
const devNotice = ref("");
const sampleCount = ref(5);
const isDevelopment = import.meta.env.DEV;
let unsubscribeRealtime: (() => void) | undefined;
let refreshingRealtime = false;

async function loadRounds(showLoading = false) {
  if (showLoading) loading.value = true;
  try {
    rounds.value = (await api.adminRounds(token.value)).data.items;
  } finally {
    if (showLoading) loading.value = false;
  }
}

async function connect() {
  loading.value = true;
  error.value = "";
  try {
    sessionStorage.setItem("lunch-admin-token", token.value);
    await loadRounds();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "관리자 정보를 확인하지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function refreshSelected(roundId: string) {
  selected.value = (await api.adminRound(token.value, roundId)).data;
}

function handleRoundEvent(event: RoundEvent) {
  if (!selected.value || event.roundId !== selected.value.round.id || refreshingRealtime) return;
  refreshingRealtime = true;
  void Promise.all([refreshSelected(event.roundId), loadRounds()])
    .catch(() => { realtimeConnected.value = false; })
    .finally(() => { refreshingRealtime = false; });
}

function subscribeSelectedRound(roundId: string) {
  unsubscribeRealtime?.();
  realtimeConnected.value = false;
  unsubscribeRealtime = subscribeRoundEvents(roundId, handleRoundEvent, (connected) => {
    realtimeConnected.value = connected;
  });
}

async function openRound(roundId: string) {
  try {
    await refreshSelected(roundId);
    subscribeSelectedRound(roundId);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "회차를 불러오지 못했습니다.";
  }
}

async function generate() {
  if (!selected.value || !confirm("투표를 즉시 마감하고 조를 만들까요?")) return;
  loading.value = true;
  try {
    await api.adminGenerate(token.value, selected.value.round.id);
    await openRound(selected.value.round.id);
    await connect();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "조를 생성하지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function openVotingNow() {
  if (!selected.value || !confirm("예약된 투표를 지금 바로 열까요? 기존 자동 마감 시각은 유지됩니다.")) return;
  loading.value = true;
  error.value = "";
  try {
    await api.adminOpen(token.value, selected.value.round.id);
    await Promise.all([refreshSelected(selected.value.round.id), loadRounds()]);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "투표를 열지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function reopenVoting() {
  if (
    !selected.value ||
    !confirm("기존 조 편성과 결과를 삭제하고 투표를 30분 동안 다시 열까요? 참가자 등록은 유지됩니다.")
  ) return;
  loading.value = true;
  error.value = "";
  try {
    await api.adminReopen(token.value, selected.value.round.id);
    await Promise.all([refreshSelected(selected.value.round.id), loadRounds()]);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "투표를 다시 열지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function runDevAction(action: DevAction) {
  if (!selected.value) return;
  const destructive = action === "CLEAR_ALL" || action === "GENERATE_TEAMS";
  if (destructive && !confirm(action === "CLEAR_ALL" ? "참가자와 편성 결과를 모두 초기화할까요?" : "현재 참가자로 즉시 조를 만들까요?")) return;

  loading.value = true;
  error.value = "";
  devNotice.value = "";
  try {
    const response = await api.devAction(
      token.value,
      selected.value.round.id,
      action,
      action === "ADD_SAMPLE_PARTICIPANTS" ? sampleCount.value : undefined,
    );
    devNotice.value = response.data.message;
    await Promise.all([refreshSelected(selected.value.round.id), loadRounds()]);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "개발자 기능을 실행하지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => unsubscribeRealtime?.());
</script>

<template>
  <section class="page-heading compact">
    <p class="eyebrow">ADMIN DESK</p>
    <h1>운영 <em>관리</em></h1>
    <p>현재 참가 현황을 확인하고 필요한 경우 조 편성을 수동으로 시작합니다.</p>
  </section>

  <section class="panel admin-login">
    <label class="field-label" for="admin-token">관리자 토큰</label>
    <div class="inline-form">
      <input id="admin-token" v-model="token" type="password" placeholder="관리자 토큰 입력" @keyup.enter="connect" />
      <button class="primary-button" :disabled="loading || !token" @click="connect">{{ loading ? '확인 중…' : '연결' }}</button>
    </div>
    <p v-if="error" class="form-message error-text">{{ error }}</p>
  </section>

  <section v-if="rounds.length" class="admin-layout">
    <div class="panel round-list">
      <h2>회차 목록</h2>
      <button v-for="item in rounds" :key="item.round.id" @click="openRound(item.round.id)">
        <span><strong>{{ item.round.weekKey }}</strong><small>{{ item.round.status }}</small></span>
        <span>{{ item.registrationCount }}명 · {{ item.teamCount }}조</span>
      </button>
    </div>

    <div v-if="selected" class="panel admin-detail">
      <div class="panel-heading">
        <div>
          <p class="step">{{ selected.round.weekKey }}</p>
          <h2>참가 현황</h2>
          <span class="realtime-chip" :class="{ connected: realtimeConnected }">
            {{ realtimeConnected ? '실시간 연결됨' : '실시간 재연결 중' }}
          </span>
        </div>
        <button v-if="selected.round.status === 'SCHEDULED'" class="primary-button small" :disabled="loading" @click="openVotingNow">지금 투표 열기</button>
        <button v-else-if="selected.round.status === 'OPEN'" class="primary-button small" :disabled="loading" @click="generate">지금 조 만들기</button>
        <button
          v-else-if="selected.round.status === 'LOCATION_SELECTION' || selected.round.status === 'COMPLETED'"
          class="danger-action"
          :disabled="loading"
          @click="reopenVoting"
        >조 삭제·투표 다시 열기</button>
      </div>
      <div class="participant-list">
        <span v-for="registration in selected.registrations" :key="registration.id">
          {{ registration.participant.name }}
          <small>{{ registration.preferredLocation ?? '팀 우선' }}</small>
        </span>
        <p v-if="!selected.registrations.length">아직 참가자가 없습니다.</p>
      </div>

      <section v-if="isDevelopment" class="dev-tools">
        <div>
          <p class="step">DEVELOPMENT ONLY</p>
          <h3>강제 실행 도구</h3>
          <p>개발 서버에서만 보이며 모든 요청은 관리자 토큰 검증을 거칩니다.</p>
        </div>
        <div class="dev-actions">
          <button :disabled="loading" @click="runDevAction('OPEN_VOTING')">투표 강제 열기</button>
          <div class="sample-action">
            <input v-model.number="sampleCount" type="number" min="1" max="26" aria-label="추가할 샘플 참가자 수" />
            <button :disabled="loading" @click="runDevAction('ADD_SAMPLE_PARTICIPANTS')">샘플 인원 추가</button>
          </div>
          <button :disabled="loading" @click="runDevAction('GENERATE_TEAMS')">즉시 조 편성</button>
          <button :disabled="loading" @click="runDevAction('COMPLETE_ROUND')">회차 강제 완료</button>
          <button class="danger-action" :disabled="loading" @click="runDevAction('CLEAR_ALL')">전체 초기화</button>
        </div>
        <p v-if="devNotice" class="form-message success-text">{{ devNotice }}</p>
      </section>
    </div>
  </section>
</template>
