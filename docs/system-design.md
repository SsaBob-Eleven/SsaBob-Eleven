# 싸밥일레븐 시스템 설계서

## 1. 문서 정보

| 항목 | 내용 |
|---|---|
| 목적 | 최대 26명의 주 1회 점심 투표와 목표 4~5명 단위의 적응형 랜덤 조 편성 서비스 설계 |
| 프론트엔드 | Vue 3, Vite, TypeScript |
| 백엔드 | Node.js, Express, TypeScript |
| 데이터베이스 | Prisma ORM, SQLite |
| 배포 | Vercel(프론트엔드), AWS EC2(백엔드) |
| 기준 시간대 | Asia/Seoul |
| 서비스 범위 | 대한민국 단일 지역, 한국어 UI, 회차당 최대 26명 |
| API 규격 | `docs/openapi.yaml` |
| 고정 설계 결정 | `docs/adr/0001-small-single-region-adaptive-groups.md` |

## 2. 목표와 범위

### 2.1 목표

1. 참가자는 이름을 입력해 한 회차에 한 번 참여한다.
2. `10층`, `20층`, `밖` 중 하나를 선택하는 장소 우선 흐름을 지원한다.
3. 매주 지정 요일 11시 30분에 투표를 닫고 자동으로 조를 생성한다.
4. 조는 4~5명을 목표로 구성하되 인원이 맞지 않으면 누락 없이 균등하게 조 크기를 조정한다.
5. 최근에 같은 조였던 사람의 재매칭을 가능한 한 줄인다.
6. 환경변수로 `장소 선택 → 조 편성`과 `조 편성 → 장소 선택`을 전환한다.

### 2.2 MVP 범위

- 이름 기반 참가 등록, 수정, 취소
- 주간 회차 자동 생성 및 자동 마감
- 장소 우선/팀 우선 운영 모드
- 과거 편성 이력을 반영한 조 생성
- 결과 조회
- 최소 관리자 기능
- EC2 단일 인스턴스 운영과 SQLite 백업
- 회차당 최대 26명과 대한민국 단일 지역 운영

### 2.3 MVP 제외 범위

- 사내 SSO, 소셜 로그인
- 이메일, Slack 등 외부 알림
- 양방향 WebSocket 통신(단방향 상태 전파는 SSE로 제공)
- 복수 EC2 인스턴스와 자동 확장
- 다중 리전, 지역별 라우팅, 다국어 지원
- 조 생성 후 일반 관리자의 임의 재추첨
- 식당 메뉴 또는 예약 시스템 연동

## 3. 확정한 운영 정책

명시되지 않은 부분은 MVP 구현을 위해 다음과 같이 정의한다.

| 항목 | 정책 |
|---|---|
| 사용자 식별 | Unicode 정규화와 앞뒤 공백 제거 후 공백 없는 정확히 3글자 이름 |
| 동명이인 | 서로 구분되는 공백 없는 3글자 별칭으로 등록 |
| 중복 등록 | 한 회차에 동일 참가자는 한 번만 등록 가능 |
| 등록 수정 | 최초 등록 때 발급한 편집 토큰 필요 |
| 편집 토큰 분실 | 사용자가 직접 복구할 수 없으며 관리자가 등록을 수정/삭제 |
| 결과 공개 | 조 생성 완료 후 이름과 조/장소를 전체 공개 |
| 장소 우선 | 선택한 장소 안에서만 조 편성 |
| 팀 우선 | 전체 참가자를 편성한 후 팀원 한 명이 대표로 장소 확정 |
| 팀 장소 충돌 | 최초 확정자가 소유하며 같은 사람만 마감 전 수정/취소 가능 |
| 조 크기 | 4~5명은 목표값이며, 인원이 맞지 않으면 전체 참가자를 누락하지 않는 범위에서 균등 조정 |
| 최대 인원 | 회차당 26명. 초과 등록은 받지 않고 관리자에게 안내 |
| 서비스 지역 | 대한민국만 지원하며 `Asia/Seoul`, `ko-KR`을 고정 사용 |
| 과거 중복 | 금지 조건이 아닌 최적화 점수로 적용 |
| 재추첨 | MVP 일반 기능으로 제공하지 않음 |

이름만으로는 본인 인증이나 사칭 방지가 불가능하다. 사내 신뢰 환경을 전제로 하며, 보안 수준을 높일 때는 `participant.employee_code` 또는 SSO 식별자를 추가한다.

최대 26명, 대한민국 단일 지역, 적응형 조 크기 정책은 [ADR-0001](adr/0001-small-single-region-adaptive-groups.md)의 승인된 결정이다. 구현 중 대규모 분산 구조나 4~5명 하드 제한으로 되돌리지 않는다. 요구사항이 바뀌면 기존 문서를 조용히 수정하지 않고 새 ADR로 이 결정을 명시적으로 대체한다.

## 4. 운영 모드

### 4.1 LOCATION_FIRST

```mermaid
sequenceDiagram
    actor U as 참가자
    participant W as Vue Web
    participant A as Express API
    participant D as SQLite
    participant S as Scheduler

    U->>W: 이름과 장소 선택
    W->>A: 참가 등록
    A->>D: Registration 저장
    A-->>W: registrationId + editToken
    S->>A: 마감 회차 감지
    A->>D: 장소별 참가자와 과거 조 조회
    A->>A: 반복 최소화 조 편성
    A->>D: Team/TeamMember 저장
    U->>W: 결과 조회
    W->>A: 결과 요청
    A-->>W: 장소별 조 목록
```

1. 등록 요청에 `preferredLocation`이 필수다.
2. 마감 시 참가자를 장소별 버킷으로 나눈다.
3. 각 버킷을 독립적으로 편성한다.
4. 조의 장소는 버킷의 장소로 자동 확정된다.
5. 조 생성 트랜잭션이 끝나면 회차 상태는 `COMPLETED`가 된다.

### 4.2 TEAM_FIRST

```mermaid
sequenceDiagram
    actor U as 참가자
    participant W as Vue Web
    participant A as Express API
    participant D as SQLite
    participant S as Scheduler

    U->>W: 이름으로 참가 등록
    W->>A: 참가 등록
    A->>D: Registration 저장
    S->>A: 11:30 마감 회차 감지
    A->>D: 전체 참가자와 과거 조 조회
    A->>A: 반복 최소화 조 편성
    A->>D: 팀 저장 및 LOCATION_SELECTION 전환
    U->>W: 본인 팀 확인
    U->>A: 팀 대표로 장소 확정
    A->>D: 팀 장소 저장
    S->>A: 팀 장소 선택 마감 감지
    A->>D: 회차 COMPLETED 전환
```

1. 등록 요청의 `preferredLocation`은 금지한다.
2. 11시 30분에 전체 참가자를 대상으로 조를 생성한다.
3. 회차 상태를 `LOCATION_SELECTION`으로 바꾼다.
4. 팀원은 자신의 편집 토큰으로 소속을 증명하고 팀 장소를 확정한다.
5. 최초 장소 확정자만 마감 전 변경하거나 취소할 수 있다.
6. 장소 선택 마감 시 선택하지 않은 조는 `location=null`인 상태로 완료한다.

## 5. 시스템 아키텍처

```mermaid
flowchart LR
    U["사용자 브라우저"] -->|HTTPS| V["Vercel\nVue SPA"]
    V -->|REST/JSON HTTPS| C["Caddy 또는 Nginx\napi.example.com"]
    C -->|SSE 지속 연결| V
    C --> E["EC2 Docker\nExpress API + Worker"]
    E --> P["Prisma"]
    P --> D[("SQLite on EBS")]
    E --> L["JSON 로그"]
    B["백업 작업"] --> D
    B --> O["암호화된 외부 백업"]
```

### 5.1 컴포넌트 책임

| 컴포넌트 | 책임 |
|---|---|
| Vue SPA | 현재 회차 표시, 등록/수정/취소, 결과, 관리자 UI, SSE 이벤트 반영 |
| Express API | 검증, 권한 확인, 비즈니스 로직, REST API, 인프로세스 pub/sub와 SSE 전파 |
| Worker | 회차 생성, 투표 마감, 조 생성, 팀 장소 선택 마감 |
| Prisma | 데이터 접근과 마이그레이션 |
| SQLite | 참가자, 회차, 등록, 팀, 감사 데이터 영속화 |
| Reverse Proxy | TLS 종료, API 프록시, 기본 요청 제한 |

### 5.2 코드 구조

```text
/
├─ apps/
│  ├─ web/
│  │  └─ src/
│  │     ├─ api/
│  │     ├─ components/
│  │     ├─ composables/
│  │     ├─ pages/
│  │     ├─ router/
│  │     └─ types/
│  └─ api/
│     ├─ prisma/
│     │  ├─ schema.prisma
│     │  └─ migrations/
│     └─ src/
│        ├─ config/
│        ├─ controllers/
│        ├─ middleware/
│        ├─ repositories/
│        ├─ routes/
│        ├─ schemas/
│        ├─ services/
│        │  ├─ round-service.ts
│        │  ├─ registration-service.ts
│        │  ├─ team-generator.ts
│        │  └─ scheduler-service.ts
│        ├─ worker/
│        ├─ app.ts
│        └─ server.ts
├─ packages/
│  └─ shared/
├─ docs/
│  ├─ system-design.md
│  └─ openapi.yaml
├─ docker-compose.yml
└─ pnpm-workspace.yaml
```

컨트롤러는 HTTP 변환만 담당하고, 조 편성 및 상태 변경은 서비스 계층에 둔다. Prisma 호출은 repository 계층으로 제한해 알고리즘 테스트가 DB에 의존하지 않게 한다.

## 6. 도메인 상태 모델

### 6.1 회차 상태

```mermaid
stateDiagram-v2
    [*] --> SCHEDULED
    SCHEDULED --> OPEN: opensAt 도달
    OPEN --> GENERATING: closesAt 도달 또는 관리자 실행
    GENERATING --> COMPLETED: LOCATION_FIRST 생성 성공
    GENERATING --> LOCATION_SELECTION: TEAM_FIRST 생성 성공
    LOCATION_SELECTION --> COMPLETED: locationClosesAt 도달
    GENERATING --> OPEN: 생성 실패 및 안전한 롤백
```

| 상태 | 등록 | 결과 | 팀 장소 선택 |
|---|---:|---:|---:|
| `SCHEDULED` | 불가 | 불가 | 불가 |
| `OPEN` | 가능 | 불가 | 불가 |
| `GENERATING` | 불가 | 준비 중 | 불가 |
| `LOCATION_SELECTION` | 불가 | 가능 | 가능 |
| `COMPLETED` | 불가 | 가능 | 불가 |

### 6.2 상태 변경 원칙

- 상태 검증은 클라이언트가 아닌 API가 수행한다.
- 모든 시간은 DB에 UTC로 저장하고, 회차 계산만 `Asia/Seoul` 기준으로 수행한다.
- 회차 생성 시 현재 환경설정을 회차 컬럼에 스냅샷으로 저장한다.
- 조 생성 중 실패하면 팀 데이터가 부분 저장되지 않도록 트랜잭션을 사용한다.
- 일정 시간 이상 `GENERATING`인 회차는 worker가 복구 대상으로 판단한다.

## 7. ERD

```mermaid
erDiagram
    PARTICIPANT ||--o{ REGISTRATION : registers
    ROUND ||--o{ REGISTRATION : contains
    ROUND ||--o{ TEAM : generates
    ROUND ||--o| GENERATION_AUDIT : records
    TEAM ||--o{ TEAM_MEMBER : contains
    REGISTRATION ||--o| TEAM_MEMBER : assigned_as
    REGISTRATION o|--o{ TEAM : selects_location_for

    PARTICIPANT {
        string id PK
        string name
        string normalized_name UK
        boolean active
        datetime created_at
        datetime updated_at
    }

    ROUND {
        string id PK
        string week_key UK
        enum flow_mode
        enum status
        datetime opens_at
        datetime closes_at
        datetime location_closes_at
        enum group_size_policy
        int target_group_min_size
        int target_group_max_size
        int max_participants
        int history_weeks
        int random_attempts
        string random_seed
        datetime generation_started_at
        datetime generated_at
        datetime completed_at
        datetime created_at
        datetime updated_at
    }

    REGISTRATION {
        string id PK
        string round_id FK
        string participant_id FK
        string display_name
        enum preferred_location
        string edit_token_hash
        datetime created_at
        datetime updated_at
    }

    TEAM {
        string id PK
        string round_id FK
        int sequence
        enum location
        boolean size_adjusted
        string location_selected_by_registration_id FK
        datetime location_selected_at
        datetime created_at
        datetime updated_at
    }

    TEAM_MEMBER {
        string team_id PK,FK
        string registration_id PK,FK
        datetime created_at
    }

    GENERATION_AUDIT {
        string id PK
        string round_id UK,FK
        string algorithm_version
        enum trigger
        string trigger_reason
        int candidate_count
        float best_score
        int repeated_pair_count
        int size_adjusted_team_count
        int duration_ms
        datetime created_at
    }
```

### 7.1 제약 조건과 인덱스

| 테이블 | 제약/인덱스 |
|---|---|
| `participant` | `normalized_name` UNIQUE |
| `round` | `week_key` UNIQUE, `(status, closes_at)` INDEX |
| `registration` | `(round_id, participant_id)` UNIQUE, `round_id` INDEX |
| `team` | `(round_id, sequence)` UNIQUE, `round_id` INDEX |
| `team_member` | `(team_id, registration_id)` PK, `registration_id` UNIQUE |
| `generation_audit` | `round_id` UNIQUE |

`team_member.registration_id`를 UNIQUE로 두어 한 등록이 둘 이상의 조에 들어가지 못하게 한다. 팀과 등록의 회차가 같은지는 DB FK만으로 보장하기 어려우므로 서비스와 통합 테스트에서 검사한다.

`participant.name`은 다음 회차에서 동일인을 찾기 위한 현재 이름이고, `registration.display_name`은 해당 회차 결과에 표시할 이름 스냅샷이다. 이름 수정 시 현재 참가자와 현재 회차 스냅샷을 함께 갱신하지만, 완료된 과거 회차의 표시 이름은 바꾸지 않는다. API의 `registration.participant.name`에는 이 스냅샷 값을 매핑한다.

## 8. 조 편성 알고리즘

### 8.1 요구 특성

- 모든 유효 등록은 정확히 한 조에 포함한다.
- `LOCATION_FIRST`에서는 서로 다른 장소가 섞이지 않는다.
- 기본 목표는 모든 조를 4~5명으로 만드는 것이다.
- 목표 크기로 정확히 나눌 수 없으면 전체 참가자를 누락하지 않고 가장 적은 편차로 균등 조정한다.
- 조 크기 조정은 정상 동작이며 생성 실패나 수동 개입 사유가 아니다.
- 최근 같은 조였던 두 사람이 다시 같은 조가 되는 점수를 최소화한다.
- 동일 seed와 동일 입력이면 동일한 결과를 만든다.

### 8.2 조 크기 계산

인원 `n`, 목표 최소 `targetMin=4`, 목표 최대 `targetMax=5`일 때 `ADAPTIVE` 정책으로 다음을 계산한다.

1. `n=0`이면 조를 만들지 않는다.
2. `ceil(n / targetMax) <= k <= floor(n / targetMin)`인 조 개수 `k`를 찾는다.
3. 가능한 `k`가 있으면 모든 조가 목표 범위에 들도록 가장 균등하게 나눈다.
4. 가능한 `k`가 없으면 모든 현실적인 조 개수를 비교한다.
5. 목표 범위 이탈 거리 합계, 조정된 조 수, 최대 편차 순으로 가장 작은 후보를 고른다.
6. 그래도 동점이면 조 수가 적은 후보를 고르고, 같은 크기의 조들 사이에 참가자를 랜덤 배치한다.

기본 예외 예시는 다음과 같다.

| 인원 | 결과 |
|---:|---|
| 0 | 조 없음 |
| 1~3 | 해당 인원으로 조 1개(자동 조정) |
| 4 | 4 |
| 5 | 5 |
| 6 | 6(자동 조정) |
| 7 | 4+3(자동 조정) |
| 8 | 4+4 |
| 9 | 5+4 |
| 10 | 5+5 |
| 11 | 6+5(자동 조정) |
| 12 | 4+4+4 |
| 26 | 5+5+4+4+4+4 |

장소 우선 모드는 장소별 인원이 작아 1~3명 또는 6명 조가 생길 수 있다. 이는 허용된 정상 결과이며, 장소 선택을 존중하기 위해 다른 장소와 합치지 않는다. 결과 화면에는 `sizeAdjusted=true`인 조에 “참가 인원에 맞춰 조 크기가 조정되었습니다”라고 안내한다.

### 8.3 과거 중복 점수

최근 `historyWeeks` 안에 같은 팀이었던 모든 참가자 쌍을 조회해 pair penalty map을 만든다.

```text
pairPenalty(A, B) = Σ (10 + recencyBonus)
recencyBonus = max(0, historyWeeks - weeksAgo) × 2

candidateScore =
  Σ 새 팀 내부 모든 참가자 쌍의 pairPenalty
  + targetSizeDeviationPenalty
```

- 최근 만남일수록 패널티가 크다.
- 같은 사람과 여러 번 만났다면 패널티가 누적된다.
- 중복을 완전히 금지하지 않으므로 인원이 적어도 항상 결과를 낼 수 있다.
- `targetSizeDeviationPenalty`는 중복 회피만을 위해 목표 크기를 깨지 않도록 충분히 큰 값으로 둔다. 다만 목표 크기로 나눌 수 없는 경우에는 조정 결과를 정상적으로 허용한다.

### 8.4 후보 탐색

```text
generateTeams(registrations, history, settings, seed):
  buckets = splitByLocationIfRequired(registrations)
  result = []

  for bucket in buckets:
    sizes = calculateAdaptiveTeamSizes(bucket.count, targetMin, targetMax)
    best = null

    repeat randomAttempts times:
      candidate = seededShuffleAndPartition(bucket, sizes)
      candidate = improveByPairSwaps(candidate, history)
      score = calculateScore(candidate, history, sizes)

      if best is null or score < best.score:
        best = candidate

    result += best

  return result
```

최대 인원이 26명으로 고정되어 있으므로 기본 `randomAttempts=500`이면 충분하다. 대규모 최적화나 분산 계산은 구현하지 않고, 단일 프로세스의 랜덤 재시작과 pair swap 방식만 사용한다.

### 8.5 원자성과 재현성

1. 회차를 조건부 갱신해 `OPEN → GENERATING`을 선점한다.
2. `randomSeed`가 없으면 암호학적 난수로 생성해 저장한다.
3. 후보를 메모리에서 계산한다.
4. 하나의 DB 트랜잭션으로 팀, 팀원, 감사 정보를 저장한다.
5. 모드에 따라 `COMPLETED` 또는 `LOCATION_SELECTION`으로 변경한다.
6. 저장 트랜잭션이 실패하면 팀 데이터는 전부 롤백한다.
7. worker 재시작 시 오래된 `GENERATING` 회차는 같은 seed로 재시도한다.

## 9. API 설계

상세 스키마와 예시는 `docs/openapi.yaml`을 기준으로 한다.

### 9.1 공통 규칙

- Base URL: `/api/v1`
- Content-Type: `application/json`
- 날짜: ISO 8601 UTC 문자열
- ID: UUID
- 장소 enum: `FLOOR_10`, `FLOOR_20`, `OUTSIDE`
- 운영 모드 enum: `LOCATION_FIRST`, `TEAM_FIRST`
- 편집 인증: `X-Edit-Token`
- 관리자 인증: `Authorization: Bearer <ADMIN_TOKEN>`
- 추적 ID: 응답 `X-Request-Id`

### 9.2 공개 API 목록

| Method | Path | 설명 |
|---|---|---|
| GET | `/health/live` | 프로세스 생존 확인 |
| GET | `/health/ready` | DB 포함 준비 상태 확인 |
| GET | `/rounds/current` | 현재 회차와 화면 규칙 조회 |
| GET | `/events?roundId={roundId}` | 회차 변경 이벤트 SSE 구독 |
| POST | `/rounds/{roundId}/registrations` | 참가 등록 및 편집 토큰 발급 |
| GET | `/registrations/{registrationId}` | 편집 토큰으로 내 등록/팀 조회 |
| PATCH | `/registrations/{registrationId}` | 마감 전 내 등록 수정 |
| DELETE | `/registrations/{registrationId}` | 마감 전 내 등록 취소 |
| GET | `/rounds/{roundId}/results` | 회차 상태와 생성된 조 조회 |
| PATCH | `/teams/{teamId}/location` | 팀 대표 장소 확정/수정 |
| DELETE | `/teams/{teamId}/location` | 팀 대표 장소 선택 취소 |

### 9.3 관리자 API 목록

| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/rounds` | 회차 목록 조회 |
| POST | `/admin/rounds` | 테스트/예외용 회차 수동 생성 |
| GET | `/admin/rounds/{roundId}` | 참가 현황 포함 회차 상세 조회 |
| POST | `/admin/rounds/{roundId}/generate` | 회차 강제 마감 및 조 생성 |
| PATCH | `/admin/registrations/{registrationId}` | 참가자 이름/장소 정정 |
| DELETE | `/admin/registrations/{registrationId}` | 등록 삭제 |
| PUT | `/admin/teams/{teamId}/location` | 팀 장소 강제 지정/정정 |

개발 환경(`NODE_ENV=development`) 전용 API:

| Method | Path | 설명 |
|---|---|---|
| POST | `/dev/rounds/{roundId}/actions` | 투표 열기, 샘플 인원 추가, 즉시 편성, 강제 완료, 전체 초기화 |

개발 API도 관리자 Bearer 토큰이 필요하며, 운영 환경에서는 경로 자체를 `404`로 숨긴다.

관리자 등록 수정/삭제는 팀 생성 전까지만 가능하고, 팀 장소 지정은 `LOCATION_SELECTION`에서만 가능하다. 완료된 회차의 조 구성과 표시 이름은 감사 가능성을 위해 변경하지 않는다.

### 9.4 등록 예시

```http
POST /api/v1/rounds/7f9.../registrations
Content-Type: application/json

{
  "name": "홍길동",
  "preferredLocation": "FLOOR_10"
}
```

```json
{
  "data": {
    "registration": {
      "id": "5a2...",
      "roundId": "7f9...",
      "participant": {
        "id": "2b1...",
        "name": "홍길동"
      },
      "preferredLocation": "FLOOR_10",
      "createdAt": "2026-07-17T00:10:00.000Z",
      "updatedAt": "2026-07-17T00:10:00.000Z"
    },
    "editToken": "url-safe-random-token"
  }
}
```

`editToken`은 이 응답에서만 평문으로 반환하고 서버에는 HMAC 또는 SHA-256 기반 해시만 저장한다. 프론트엔드는 `registrationId`와 토큰을 localStorage에 보관하되 로그나 분석 도구로 전송하지 않는다.

### 9.5 오류 형식

```json
{
  "error": {
    "code": "ROUND_NOT_OPEN",
    "message": "현재 회차의 참가 등록이 마감되었습니다.",
    "details": null,
    "requestId": "01J..."
  }
}
```

주요 오류 코드는 다음과 같다.

| HTTP | 코드 | 상황 |
|---:|---|---|
| 400 | `VALIDATION_ERROR` | 요청 형식 오류 |
| 401 | `INVALID_EDIT_TOKEN` | 편집 토큰 누락/불일치 |
| 401 | `INVALID_ADMIN_TOKEN` | 관리자 토큰 불일치 |
| 404 | `ROUND_NOT_FOUND` | 회차 없음 |
| 404 | `REGISTRATION_NOT_FOUND` | 등록 없음 |
| 404 | `TEAM_NOT_FOUND` | 팀 없음 |
| 409 | `ROUND_NOT_OPEN` | 등록 가능 상태가 아님 |
| 409 | `REGISTRATION_ALREADY_EXISTS` | 같은 참가자의 회차 중복 등록 |
| 409 | `LOCATION_REQUIRED` | 장소 우선 모드에서 장소 누락 |
| 409 | `LOCATION_NOT_ALLOWED` | 팀 우선 등록에 장소 포함 |
| 409 | `RESULT_NOT_READY` | 조 생성 전 결과 요구 |
| 409 | `TEAM_LOCATION_ALREADY_SELECTED` | 다른 팀원이 이미 장소 확정 |
| 429 | `RATE_LIMITED` | 요청 제한 초과 |
| 500 | `INTERNAL_ERROR` | 예상하지 못한 서버 오류 |

## 10. 프론트엔드 설계

### 10.1 라우트

| Route | 화면 |
|---|---|
| `/` | 현재 회차, 등록 폼, 내 등록 수정/취소 |
| `/results` | 현재 회차 조 편성 결과 |
| `/history/:weekKey` | 과거 회차 결과(선택 구현) |
| `/admin` | 관리자 회차/참가/팀 관리 |

### 10.2 메인 화면 상태

| 회차 상태 | UI |
|---|---|
| `SCHEDULED` | 투표 시작 시간 안내 |
| `OPEN` | 이름/장소 폼 또는 내 등록 카드, 마감 카운트다운 |
| `GENERATING` | 조 편성 중 안내, 서버의 결과 변경 이벤트 대기 |
| `LOCATION_SELECTION` | 조 결과와 팀 장소 선택 UI |
| `COMPLETED` | 최종 결과 |

### 10.3 클라이언트 저장

```text
localStorage key: lunch-registration:{roundId}
value: {
  registrationId,
  editToken,
  participantName
}
```

- 토큰은 Pinia 전역 영속화 플러그인보다 작은 전용 저장 모듈로 관리한다.
- API 응답의 `serverTime`을 기준으로 카운트다운 오차를 보정한다.
- 화면 진입 시 회차별 `EventSource` 연결을 하나 열고 서버가 참가 인원, 회차 상태, 편성 결과, 팀 장소 변경 이벤트를 전송한다.
- 참가 인원은 `registration.count.changed` payload를 즉시 반영하고, 상태/결과 이벤트 때만 해당 REST 리소스를 다시 조회한다. 주기적 HTTP polling은 사용하지 않는다.
- 브라우저의 SSE 자동 재연결을 사용하며 서버는 연결 유지를 위한 comment heartbeat만 전송한다.
- 프론트의 운영 모드는 `/rounds/current` 응답을 신뢰한다.

### 10.4 실시간 pub/sub 경계

- Express 프로세스 내부 `EventEmitter`를 회차별 pub/sub 버스로 사용한다.
- 등록 생성/삭제, 관리자 등록 변경, 회차 상태 전환, 조 생성, 팀 장소 변경이 커밋된 뒤 이벤트를 발행한다.
- SSE는 서버→브라우저 단방향 알림이므로 참가 등록과 관리자 명령은 기존 REST API를 사용한다.
- 단일 EC2·단일 Node 프로세스라는 승인된 운영 구조에서만 이벤트 전달을 보장한다. 복수 프로세스가 필요해지면 외부 pub/sub 도입을 새 ADR로 결정한다.

## 11. 스케줄러 설계

### 11.1 단일 EC2 MVP 방식

Express 프로세스 내부 worker가 `SCHEDULER_POLL_INTERVAL_MS`마다 다음 작업을 수행한다.

1. 이번 주 회차가 없으면 환경변수를 스냅샷해 생성한다.
2. `opensAt <= now`인 `SCHEDULED` 회차를 `OPEN`으로 변경한다.
3. `closesAt <= now`인 `OPEN` 회차의 조 생성을 선점한다.
4. 오래된 `GENERATING` 회차를 같은 seed로 복구한다.
5. `locationClosesAt <= now`인 `LOCATION_SELECTION` 회차를 완료한다.

프로세스가 정확히 11시 30분에 중단되어도 재기동 후 overdue 회차를 찾아 처리한다. SQLite를 쓰는 동안 Node cluster 모드나 복수 API 컨테이너를 사용하지 않는다.

### 11.2 용량 및 지역 경계

- 회차당 최대 26명만 지원한다.
- 대한민국 사용자만 대상으로 하며 시간대는 `Asia/Seoul`, 화면 언어는 `ko-KR`로 고정한다.
- AWS는 서울 리전(`ap-northeast-2`)의 단일 EC2 인스턴스를 기본으로 한다.
- 다중 리전, 자동 확장, 메시지 큐, 분산 worker, PostgreSQL 전환은 현재 범위가 아니다.
- 26명 초과나 고가용성 요구가 새로 생길 때에만 별도 ADR을 작성해 구조 변경을 검토한다.

## 12. 환경변수

```env
NODE_ENV=production
PORT=3000
APP_TIMEZONE=Asia/Seoul
APP_LOCALE=ko-KR
MAX_PARTICIPANTS_PER_ROUND=26

FLOW_MODE=LOCATION_FIRST
EVENT_WEEKDAY=FRI
VOTE_OPEN_DAY=MON
VOTE_OPEN_TIME=09:00
VOTE_CLOSE_TIME=11:30
TEAM_LOCATION_CLOSE_TIME=11:40

GROUP_SIZE_POLICY=ADAPTIVE
TARGET_GROUP_MIN_SIZE=4
TARGET_GROUP_MAX_SIZE=5
HISTORY_WEEKS=8
RANDOM_ATTEMPTS=500
GENERATION_STALE_MINUTES=5
SCHEDULER_POLL_INTERVAL_MS=30000
SSE_HEARTBEAT_INTERVAL_MS=20000

DATABASE_URL=file:/data/lunch.db
WEB_ORIGIN=https://lunch.example.com
ADMIN_TOKEN=replace-with-long-random-token
EDIT_TOKEN_PEPPER=replace-with-long-random-secret
LOG_LEVEL=info

# web
VITE_API_BASE_URL=https://api.example.com/api/v1
```

검증 규칙:

- 운영 모드와 요일/시간 enum을 시작 시 Zod로 검증한다.
- `MAX_PARTICIPANTS_PER_ROUND=26`을 기본이자 운영 상한으로 사용한다.
- `TARGET_GROUP_MIN_SIZE <= TARGET_GROUP_MAX_SIZE`여야 한다.
- `SSE_HEARTBEAT_INTERVAL_MS`는 5,000~60,000ms 범위여야 한다.
- 목표값 4~5는 환경변수로 조정할 수 있지만 `GROUP_SIZE_POLICY=ADAPTIVE`는 유지한다.
- `TEAM_FIRST`의 장소 선택 마감은 투표 마감보다 늦어야 한다.
- secret이 기본값이거나 너무 짧으면 production 시작을 거부한다.
- 환경변수 변경은 새로 생성하는 회차부터 적용한다.

## 13. 보안 설계

- `helmet`으로 기본 보안 헤더 설정
- `cors`는 정확한 Vercel 운영/프리뷰 origin allowlist 사용
- 등록 API는 IP 기준, 편집 API는 IP+토큰 기준 rate limit
- 이름은 Unicode 정규화(NFKC)와 trim 후 내부 공백 없이 정확히 3글자로 제한
- HTML은 Vue 기본 escaping을 사용하고 `v-html` 사용 금지
- 편집 토큰과 관리자 토큰을 로그에 남기지 않음
- 편집 토큰은 최소 256-bit 랜덤 값, DB에는 해시만 저장
- 관리자 토큰 비교는 timing-safe compare 사용
- API는 HTTPS만 공개하고 EC2의 Node 포트는 보안 그룹에 노출하지 않음
- 요청 본문 크기를 작은 값(예: 16KB)으로 제한
- Prisma raw query는 필요한 경우에도 매개변수 바인딩 사용
- 에러 응답에 stack trace, SQL, 환경변수를 포함하지 않음

이 설계의 편집 토큰은 등록 수정권만 보호하며 실제 신원 인증이 아니다. 사내망 밖에서 공개 운영할 경우 SSO 도입을 우선한다.

## 14. 배포 설계

### 14.1 Vercel

- Root Directory: `apps/web`
- Build Command: `pnpm build`
- Output Directory: `dist`
- `VITE_API_BASE_URL`을 Preview/Production별 설정
- Vue Router history mode를 위한 SPA rewrite 설정
- main 브랜치 production, PR preview 배포

### 14.2 AWS EC2

```text
EC2
├─ caddy/nginx container : 80, 443
├─ api container         : internal 3000
└─ persistent volume     : /data/lunch.db
```

- Docker Compose로 reverse proxy와 API 실행
- 서울 리전(`ap-northeast-2`)의 단일 EC2 인스턴스에 배포
- 보안 그룹은 80/443 공개, SSH는 관리자 IP만 허용
- API custom domain과 TLS 인증서 적용
- 컨테이너 `restart: unless-stopped`
- SQLite 파일은 EBS 영속 경로에 저장
- 배포 전 `prisma migrate deploy` 실행
- 다중 리전, 다중 API 인스턴스, 무중단 클러스터 배포는 요구 규모상 구현하지 않음

### 14.3 백업

- SQLite online backup 또는 안전한 snapshot 방식 사용
- 최소 매일 1회, 조 생성 직후 1회 백업
- 30일 보관 후 순환 삭제
- 주 1회 복구 테스트
- 백업 파일 암호화 및 애플리케이션 서버와 다른 저장소 사용

## 15. 관측성과 운영

### 15.1 로그 이벤트

- `round.created`
- `round.opened`
- `registration.created|updated|deleted`
- `generation.started|completed|failed|recovered`
- `team.location.selected|updated|cleared`
- `round.completed`

JSON 로그 공통 필드:

```json
{
  "timestamp": "2026-07-17T02:30:00.000Z",
  "level": "info",
  "event": "generation.completed",
  "requestId": null,
  "roundId": "...",
  "durationMs": 42,
  "participantCount": 27,
  "teamCount": 6,
  "bestScore": 30
}
```

이름, 토큰, 관리자 secret은 구조화 로그에 남기지 않는다.

### 15.2 상태 점검

- `/health/live`: 프로세스 event loop가 응답하면 200
- `/health/ready`: DB `SELECT 1`과 마이그레이션 상태가 정상이면 200
- Docker healthcheck는 `/health/ready` 사용
- 생성 실패는 error 로그와 관리자 확인 대상

## 16. 테스트 전략

### 16.1 단위 테스트

- 이름 정규화 및 공백 없는 정확히 3글자 검증
- 회차 시간 계산과 KST/UTC 변환
- 모든 인원수에 대한 조 크기 계산
- seeded random 재현성
- pair penalty와 후보 점수
- 운영 모드별 버킷 분리
- 팀 장소 선택 권한
- 회차별 이벤트 격리와 구독 해제

### 16.2 속성 기반 테스트

0~26명의 임의 참가자 입력과 장소별 부분 인원에 대해 다음 불변식을 확인한다.

- 입력과 출력 참가자 집합이 같다.
- 중복 배정이 없다.
- 가능한 인원수에서는 모든 조가 목표 4~5명이다.
- 불가능한 인원수에서도 참가자 누락 없이 편차가 최소인 균등 조가 생성된다.
- 장소 우선 모드에서 팀 내부 장소가 하나다.
- 같은 seed와 입력은 같은 결과다.

### 16.3 API 통합 테스트

- 등록 → 수정 → 취소
- 중복 등록 409
- 모드별 장소 필수/금지
- 마감 경계 전후 요청
- 잘못된 편집/관리자 토큰
- 강제 생성의 멱등성
- 동시에 두 생성 요청이 들어와도 한 번만 생성
- 팀 장소 최초 선택자 소유권

### 16.4 E2E 테스트

- LOCATION_FIRST 전체 사용자 흐름
- TEAM_FIRST 등록 → 편성 → 팀 장소 선택 흐름
- 새로고침 후 localStorage로 내 등록 복원
- 관리자 등록 정정 및 강제 생성
- 참가 인원 변경의 SSE 실시간 반영과 연결 자동 복구
- 개발 모드 강제 실행 도구 및 운영 환경 404

## 17. 완료 조건

- 환경변수 변경만으로 두 운영 모드를 새 회차에 적용할 수 있다.
- 11시 30분 이후 1분 이내 자동 편성이 시작된다.
- 프로세스 재시작 후에도 overdue 회차가 자동 처리된다.
- 한 참가자는 한 회차에 정확히 한 조에만 속한다.
- 가능한 인원수는 모두 목표 4~5명 조로 편성된다.
- 불가능한 인원수는 실패하지 않고 적응형 크기로 편성되며 조정 여부가 결과에 표시된다.
- 27번째 등록은 `ROUND_CAPACITY_REACHED`로 거절된다.
- 최근 조 이력이 있는 테스트 데이터에서 단순 셔플 평균보다 반복 점수가 낮다.
- 자동 생성 API/worker가 중복 호출되어도 결과가 한 번만 저장된다.
- 프론트와 API가 HTTPS로 통신한다.
- 참가 인원과 편성 상태가 주기적 polling 없이 서버 이벤트로 갱신된다.
- 개발 모드에서는 관리자 화면에서 주요 상태 전환과 조 편성을 강제로 실행할 수 있고 운영 모드에서는 해당 API가 노출되지 않는다.
- DB 백업과 복구 절차가 검증된다.

## 18. 구현 순서

1. pnpm 모노레포와 Express/Vue 골격 구성
2. Prisma 스키마와 SQLite 마이그레이션
3. 공통 타입, 환경설정 검증, 오류 형식 구현
4. 회차 및 등록 공개 API
5. 조 크기 계산과 역사 기반 편성 알고리즘
6. 조 생성 트랜잭션과 scheduler worker
7. 팀 우선 장소 확정 API
8. 사용자 Vue 화면
9. 관리자 API와 최소 관리자 화면
10. 단위/통합/E2E 테스트
11. Docker, reverse proxy, EC2/Vercel 배포
12. 운영 리허설과 백업 복구 테스트

## 19. 향후 기능 확장 순서

1. 사내 SSO 또는 사번 기반 참가자 식별
2. Slack/Teams 투표 시작 및 결과 알림
3. 장소별 수용 인원과 선호도 제약
4. 팀 대표가 아닌 팀원 다수결 장소 선택
5. 관리자용 알고리즘 점수/중복 관계 시각화
6. 결석, 고정 조, 반드시 분리할 사람 등 추가 제약

확장 기능 역시 최대 26명·대한민국 단일 지역·단일 EC2/SQLite라는 현재 경계 안에서 구현한다. 이 경계를 바꾸는 요구는 기능 백로그가 아니라 별도 아키텍처 결정 대상이다.
