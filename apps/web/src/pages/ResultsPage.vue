<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { LOCATION_LABELS, type Location, type TeamDto } from "@ssabap/shared";
import { api, loadStoredRegistration, subscribeRoundEvents, type RoundEvent } from "../api";

const loading = ref(true);
const error = ref("");
const data = ref<Awaited<ReturnType<typeof api.results>>["data"] | null>(null);
const editToken = ref("");
const myRegistrationId = ref("");
const selecting = ref(false);
const realtimeConnected = ref(false);
const locations: Location[] = ["FLOOR_10", "FLOOR_20", "OUTSIDE"];
let roundId = "";
let unsubscribeRealtime: (() => void) | undefined;

const myTeamId = computed(() =>
  data.value?.teams.find((team) => team.members.some((member) => member.registrationId === myRegistrationId.value))?.id ?? null,
);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const current = await api.currentRound();
    roundId = current.data.round.id;
    const stored = loadStoredRegistration(current.data.round.id);
    if (stored) {
      editToken.value = stored.editToken;
      myRegistrationId.value = stored.registrationId;
    }
    data.value = (await api.results(current.data.round.id)).data;
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "조 편성 결과를 불러오지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function refreshResults() {
  if (!roundId) return;
  try {
    data.value = (await api.results(roundId)).data;
    error.value = "";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "조 편성 결과를 갱신하지 못했습니다.";
  }
}

function handleRoundEvent(event: RoundEvent) {
  if (event.roundId !== roundId) return;
  if (["round.updated", "results.updated", "team.updated"].includes(event.type)) {
    void refreshResults();
  }
}

function startRealtime() {
  if (!roundId) return;
  unsubscribeRealtime?.();
  unsubscribeRealtime = subscribeRoundEvents(roundId, handleRoundEvent, (connected) => {
    realtimeConnected.value = connected;
  });
}

async function chooseLocation(team: TeamDto, location: Location) {
  if (!editToken.value) {
    error.value = "이 브라우저에서 등록한 참가자만 팀 장소를 선택할 수 있습니다.";
    return;
  }
  selecting.value = true;
  try {
    const response = await api.selectTeamLocation(team.id, editToken.value, location);
    if (data.value) {
      const index = data.value.teams.findIndex((item) => item.id === team.id);
      if (index >= 0) data.value.teams[index] = response.data.team;
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "장소를 선택하지 못했습니다.";
  } finally {
    selecting.value = false;
  }
}

function locationClass(location: Location | null) {
  return location ? `location-${location.toLowerCase().replace('_', '-')}` : "location-pending";
}

onMounted(() => void load().then(startRealtime));
onBeforeUnmount(() => unsubscribeRealtime?.());
</script>

<template>
  <section class="page-heading">
    <p class="eyebrow">TEAM BOARD</p>
    <h1>이번 주 <em>점심 조</em></h1>
    <p>4~5명을 기본으로 하되, 참가 인원에 맞춰 누구도 빠지지 않도록 조를 구성했어요.</p>
    <span class="realtime-chip" :class="{ connected: realtimeConnected }">
      {{ realtimeConnected ? '실시간 결과 연결됨' : '실시간 결과 재연결 중' }}
    </span>
  </section>

  <section v-if="loading" class="panel empty-state">조 편성표를 불러오는 중…</section>
  <section v-else-if="error && !data" class="panel empty-state error-text">{{ error }}</section>

  <template v-else-if="data">
    <section class="result-summary">
      <div><strong>{{ data.summary.registrationCount }}</strong><span>참가자</span></div>
      <div><strong>{{ data.summary.teamCount }}</strong><span>개의 조</span></div>
      <div><strong>{{ data.summary.sizeAdjustedTeamCount }}</strong><span>인원 조정 조</span></div>
    </section>
    <p v-if="error" class="form-message error-text">{{ error }}</p>

    <section class="team-grid">
      <article
        v-for="team in data.teams"
        :key="team.id"
        class="team-card"
        :class="[{ 'my-team': team.id === myTeamId }, locationClass(team.location)]"
      >
        <header>
          <span class="team-number">TEAM {{ String(team.sequence).padStart(2, '0') }}</span>
          <span v-if="team.id === myTeamId" class="mine-badge">MY TEAM</span>
        </header>
        <h2>{{ team.location ? LOCATION_LABELS[team.location] : '장소 정하는 중' }}</h2>
        <ul>
          <li v-for="member in team.members" :key="member.registrationId" :class="{ me: member.registrationId === myRegistrationId }">
            <span>{{ member.participant.name.slice(0, 1) }}</span>
            {{ member.participant.name }}
            <small v-if="member.registrationId === myRegistrationId">나</small>
          </li>
        </ul>
        <p v-if="team.sizeAdjusted" class="adjusted-note">참가 인원에 맞춰 조 크기가 조정됐어요.</p>
        <div v-if="data.round.status === 'LOCATION_SELECTION' && team.id === myTeamId" class="team-location-actions">
          <p>조원들과 정한 장소를 선택하세요.</p>
          <button v-for="location in locations" :key="location" :disabled="selecting" @click="chooseLocation(team, location)">
            {{ LOCATION_LABELS[location] }}
          </button>
        </div>
      </article>
    </section>
  </template>
</template>
