<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  isValidParticipantName,
  LOCATION_LABELS,
  REQUIRED_PARTICIPANT_NAME_LENGTH,
  type Location,
  type RegistrationDto,
} from "@ssabap/shared";
import {
  ApiError,
  api,
  clearStoredRegistration,
  loadStoredRegistration,
  saveStoredRegistration,
  subscribeRoundEvents,
  type RoundEvent,
} from "../api";

const locations: Location[] = ["FLOOR_10", "FLOOR_20", "OUTSIDE"];
const loading = ref(true);
const submitting = ref(false);
const error = ref("");
const notice = ref("");
const current = ref<Awaited<ReturnType<typeof api.currentRound>>["data"] | null>(null);
const registration = ref<RegistrationDto | null>(null);
const name = ref("");
const selectedLocation = ref<Location | null>(null);
const now = ref(Date.now());
const realtimeConnected = ref(false);
let clock: ReturnType<typeof setInterval> | undefined;
let unsubscribeRealtime: (() => void) | undefined;

const statusLabel = computed(() => {
  switch (current.value?.round.status) {
    case "SCHEDULED": return "투표 시작 전";
    case "OPEN": return "투표 진행 중";
    case "GENERATING": return "조 편성 중";
    case "PAUSED": return "관리자 확인 중";
    case "LOCATION_SELECTION": return "팀별 장소 선택 중";
    case "COMPLETED": return "편성 완료";
    default: return "준비 중";
  }
});

const countdown = computed(() => {
  if (!current.value) return "";
  if (current.value.round.status === "PAUSED") return "투표 재개 대기 중";
  const target = current.value.round.status === "SCHEDULED" ? current.value.round.opensAt : current.value.round.closesAt;
  const difference = new Date(target).getTime() - now.value;
  if (difference <= 0) return "곧 상태가 변경됩니다";
  const hours = Math.floor(difference / 3_600_000);
  const minutes = Math.floor((difference % 3_600_000) / 60_000);
  return hours > 24 ? `${Math.floor(hours / 24)}일 ${hours % 24}시간 남음` : `${hours}시간 ${minutes}분 남음`;
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const response = await api.currentRound();
    current.value = response.data;
    const stored = loadStoredRegistration(response.data.round.id);
    if (stored) {
      try {
        const context = await api.getRegistration(stored.registrationId, stored.editToken);
        registration.value = context.data.registration;
        name.value = context.data.registration.participant.name;
        selectedLocation.value = context.data.registration.preferredLocation;
      } catch (reason) {
        if (reason instanceof ApiError && [401, 404].includes(reason.status)) {
          clearStoredRegistration(response.data.round.id);
        } else {
          throw reason;
        }
      }
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "현재 회차를 불러오지 못했습니다.";
  } finally {
    loading.value = false;
  }
}

async function refreshCurrent() {
  try {
    const previousRoundId = current.value?.round.id;
    const response = await api.currentRound();
    current.value = response.data;
    if (previousRoundId && previousRoundId !== response.data.round.id) startRealtime();
  } catch {
    realtimeConnected.value = false;
  }
}

function handleRoundEvent(event: RoundEvent) {
  if (!current.value || event.roundId !== current.value.round.id) return;
  if (event.type === "registration.count.changed") {
    const registrationCount = event.data.registrationCount;
    if (typeof registrationCount === "number") current.value.registrationCount = registrationCount;
    return;
  }
  if (event.type === "round.updated" || event.type === "results.updated") {
    void refreshCurrent();
  }
}

function startRealtime() {
  if (!current.value) return;
  unsubscribeRealtime?.();
  unsubscribeRealtime = subscribeRoundEvents(current.value.round.id, handleRoundEvent, (connected) => {
    realtimeConnected.value = connected;
  });
}

async function submit() {
  if (!current.value || !name.value.trim()) return;
  if (!isValidParticipantName(name.value)) {
    error.value = "이름은 공백 없이 정확히 3글자로 입력해 주세요.";
    return;
  }
  if (current.value.rules.preferredLocationRequired && !selectedLocation.value) {
    error.value = "식사 장소를 하나 선택해 주세요.";
    return;
  }
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const roundId = current.value.round.id;
    if (registration.value) {
      const stored = loadStoredRegistration(roundId);
      if (!stored) throw new Error("수정 토큰을 찾을 수 없습니다.");
      const response = await api.updateRegistration(registration.value.id, stored.editToken, {
        name: name.value,
        ...(current.value.rules.preferredLocationAllowed ? { preferredLocation: selectedLocation.value } : {}),
      });
      registration.value = response.data.registration;
      notice.value = "투표를 수정했습니다.";
    } else {
      const response = await api.createRegistration(roundId, {
        name: name.value,
        ...(current.value.rules.preferredLocationAllowed ? { preferredLocation: selectedLocation.value } : {}),
      });
      registration.value = response.data.registration;
      saveStoredRegistration(roundId, {
        registrationId: response.data.registration.id,
        editToken: response.data.editToken,
        participantName: response.data.registration.participant.name,
      });
      await refreshCurrent();
      notice.value = "오늘 점심 투표에 참여했습니다.";
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "투표를 저장하지 못했습니다.";
  } finally {
    submitting.value = false;
  }
}

async function cancelRegistration() {
  if (!current.value || !registration.value || !confirm("오늘 참가를 취소할까요?")) return;
  const stored = loadStoredRegistration(current.value.round.id);
  if (!stored) return;
  submitting.value = true;
  try {
    await api.deleteRegistration(registration.value.id, stored.editToken);
    clearStoredRegistration(current.value.round.id);
    registration.value = null;
    await refreshCurrent();
    name.value = "";
    selectedLocation.value = null;
    notice.value = "참가를 취소했습니다.";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "참가를 취소하지 못했습니다.";
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void load().then(startRealtime);
  clock = setInterval(() => { now.value = Date.now(); }, 30_000);
});
onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  unsubscribeRealtime?.();
});
</script>

<template>
  <section class="hero">
    <div>
      <p class="eyebrow">TODAY'S LUNCH</p>
      <h1>점심 고민은 짧게,<br /><em>좋은 대화는 길게.</em></h1>
      <p class="hero-copy">이름과 장소만 남겨 주세요. 마감되면 최근 조합을 피해 오늘 하루 함께할 점심 조를 만들어 드려요.</p>
    </div>
    <div class="status-card" aria-live="polite">
      <span class="status-dot"></span>
      <div>
        <small>현재 상태</small>
        <strong>{{ statusLabel }}</strong>
      </div>
      <span class="countdown">{{ countdown }}</span>
      <span class="realtime-status" :class="{ connected: realtimeConnected }">
        {{ realtimeConnected ? '실시간 연결됨' : '실시간 재연결 중' }}
      </span>
    </div>
  </section>

  <section v-if="loading" class="panel empty-state">오늘의 식탁을 준비하고 있어요…</section>
  <section v-else-if="error && !current" class="panel empty-state error-text">{{ error }}</section>

  <template v-else-if="current">
    <section class="round-overview">
      <div><small>참가 인원</small><strong>{{ current.registrationCount }}<span>/{{ current.round.maxParticipants }}명</span></strong></div>
      <div><small>기본 조 크기</small><strong>{{ current.round.targetGroupMinSize }}–{{ current.round.targetGroupMaxSize }}<span>명</span></strong></div>
      <div><small>편성 방식</small><strong class="mode-text">{{ current.round.flowMode === 'LOCATION_FIRST' ? '장소 먼저' : '팀 먼저' }}</strong></div>
    </section>

    <section v-if="current.rules.registrationOpen" class="panel vote-panel">
      <div class="panel-heading">
        <div>
          <p class="step">01</p>
          <h2>{{ registration ? '내 투표 수정' : '오늘 참가하기' }}</h2>
        </div>
        <p>{{ registration ? '마감 전까지 자유롭게 바꿀 수 있어요.' : '동명이인은 서로 다른 3글자 별칭을 사용해 주세요.' }}</p>
      </div>

      <form @submit.prevent="submit">
        <label class="field-label" for="participant-name">이름</label>
        <input
          id="participant-name"
          v-model="name"
          :minlength="REQUIRED_PARTICIPANT_NAME_LENGTH"
          :maxlength="REQUIRED_PARTICIPANT_NAME_LENGTH"
          placeholder="예: 김싸피"
          autocomplete="name"
          required
        />
        <small class="field-help">공백 없이 정확히 3글자를 입력해 주세요.</small>

        <fieldset v-if="current.rules.preferredLocationAllowed">
          <legend class="field-label">어디서 먹을까요?</legend>
          <div class="location-grid">
            <label v-for="location in locations" :key="location" class="location-option" :class="{ selected: selectedLocation === location }">
              <input v-model="selectedLocation" type="radio" name="location" :value="location" />
              <span class="location-number">{{ location === 'FLOOR_10' ? '10' : location === 'FLOOR_20' ? '20' : 'OUT' }}</span>
              <strong>{{ LOCATION_LABELS[location] }}</strong>
              <small>{{ location === 'OUTSIDE' ? '바람 쐬며 새로운 메뉴' : `${location === 'FLOOR_10' ? '10' : '20'}층 식당에서 편하게` }}</small>
            </label>
          </div>
        </fieldset>
        <p v-else class="mode-notice">오늘은 팀을 먼저 만든 뒤, 조원들과 장소를 정합니다.</p>

        <p v-if="error" class="form-message error-text">{{ error }}</p>
        <p v-if="notice" class="form-message success-text">{{ notice }}</p>
        <div class="form-actions">
          <button class="primary-button" type="submit" :disabled="submitting">
            {{ submitting ? '저장 중…' : registration ? '투표 수정하기' : '참가 완료하기' }}
          </button>
          <button v-if="registration" class="text-button danger" type="button" :disabled="submitting" @click="cancelRegistration">참가 취소</button>
        </div>
      </form>
    </section>

    <section v-else class="panel empty-state result-cta">
      <p class="step">02</p>
      <h2>{{ current.round.status === 'GENERATING' ? '새로운 조를 만들고 있어요' : current.round.status === 'PAUSED' ? '기존 조 편성이 삭제됐어요' : '오늘의 점심 조가 준비됐어요' }}</h2>
      <p>{{ current.round.status === 'GENERATING' ? '최근에 만난 사람을 고려해 가장 좋은 조합을 찾는 중입니다.' : current.round.status === 'PAUSED' ? '관리자가 투표를 다시 열기 전까지 잠시 기다려 주세요.' : '내가 누구와 어디서 먹게 됐는지 확인해 보세요.' }}</p>
      <RouterLink v-if="current.rules.resultAvailable" class="primary-button inline-button" to="/results">조 편성 결과 보기</RouterLink>
    </section>
  </template>
</template>
