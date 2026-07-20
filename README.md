# 싸밥일레븐

최대 26명의 주간 점심 투표와 적응형 랜덤 조 편성 서비스입니다.

참가자 이름은 공백 없이 정확히 3글자로 입력해야 합니다.

## 구성

- `apps/web`: Vue 3 + Vite 사용자/관리자 화면
- `apps/api`: Express + Prisma + SQLite API와 scheduler worker
- `packages/shared`: 프론트엔드와 백엔드 공통 타입
- `docs`: 시스템 설계, OpenAPI, ADR

참가 인원과 편성 상태는 회차별 SSE 연결로 실시간 반영합니다. 브라우저가 주기적으로 API를 호출하는 polling 방식은 사용하지 않습니다.

## 로컬 실행

Node.js 22 이상과 pnpm 11을 권장합니다.

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/api/v1/health/ready`

개발 서버에서는 `/admin`에서 관리자 토큰을 입력한 뒤 투표 강제 열기, 샘플 인원 추가, 즉시 조 편성, 회차 완료와 초기화를 실행할 수 있습니다. 이 도구와 `/api/v1/dev/*` API는 `NODE_ENV=development`에서만 노출됩니다.

## 검증

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 핵심 운영 설정

```env
MAX_PARTICIPANTS_PER_ROUND=26
FLOW_MODE=LOCATION_FIRST
GROUP_SIZE_POLICY=ADAPTIVE
TARGET_GROUP_MIN_SIZE=4
TARGET_GROUP_MAX_SIZE=5
APP_TIMEZONE=Asia/Seoul
SSE_HEARTBEAT_INTERVAL_MS=20000
```

4~5명은 목표 크기입니다. 장소별 인원으로 정확히 나눌 수 없으면 모든 참가자를 포함하는 가장 균등한 조를 만들고 `sizeAdjusted=true`로 표시합니다.

상세 설계는 [시스템 설계서](docs/system-design.md)와 [ADR-0001](docs/adr/0001-small-single-region-adaptive-groups.md)을 참고하세요.
