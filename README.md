# 싸밥일레븐

최대 26명의 주간 점심 투표와 적응형 랜덤 조 편성 서비스입니다. 참가자 이름은 공백 없이 정확히 3글자로 입력해야 합니다.

## 구성

- `apps/web`: Vue 3 + Vite 사용자/관리자 SPA
- `apps/api`: Express + Prisma + SQLite API와 scheduler worker
- `packages/shared`: 프론트엔드와 백엔드 공통 타입
- `docs`: 시스템 설계, OpenAPI, ADR

참가 인원과 편성 상태는 회차별 SSE 연결로 실시간 반영합니다. 브라우저가 주기적으로 API를 호출하는 polling 방식은 사용하지 않습니다.

## 로컬 실행

Node.js 22 이상과 pnpm 11을 권장합니다. pnpm이 없다면 최초 한 번 `npm install --global pnpm@11`로 설치합니다. PowerShell의 스크립트 실행 정책 오류가 있으면 `npm`, `pnpm` 대신 `npm.cmd`, `pnpm.cmd`를 사용합니다.

macOS/Linux:

```bash
cp .env.example apps/api/.env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Windows PowerShell:

```powershell
npm.cmd install --global pnpm@11
Copy-Item .env.example apps/api/.env
pnpm.cmd install
pnpm.cmd db:generate
pnpm.cmd db:migrate
pnpm.cmd dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000/api/v1`
- Health: `http://localhost:3000/api/v1/health/ready`

`/admin`에서 관리자 토큰을 입력하면 로컬과 배포 환경 모두 예약 회차의 투표를 즉시 열고, 열린 회차를 즉시 마감해 조를 편성할 수 있습니다. 편성 후에는 기존 조와 생성 기록을 삭제하고 참가자 등록을 유지한 채 투표를 30분 동안 다시 열 수 있습니다. 모든 운영 관리자 기능은 `Authorization: Bearer <ADMIN_TOKEN>` 인증을 사용합니다. 샘플 인원 추가, 회차 강제 완료와 전체 초기화 같은 `/api/v1/dev/*` 도구는 `NODE_ENV=development`에서만 노출됩니다. 기본 개발용 관리자 토큰은 `development-admin-token-change-me`이며 운영에서는 반드시 별도의 긴 임의 값으로 교체합니다.

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
EVENT_WEEKDAY=WED
VOTE_OPEN_DAY=WED
VOTE_OPEN_TIME=09:00
VOTE_CLOSE_TIME=11:30
GROUP_SIZE_POLICY=ADAPTIVE
TARGET_GROUP_MIN_SIZE=4
TARGET_GROUP_MAX_SIZE=5
APP_TIMEZONE=Asia/Seoul
SSE_HEARTBEAT_INTERVAL_MS=20000
```

4~5명은 목표 크기입니다. 장소별 인원으로 정확히 나눌 수 없으면 모든 참가자를 포함하는 가장 균등한 조를 만들고 `sizeAdjusted=true`로 표시합니다.

## 운영 배포 기준

- 프론트엔드: Netlify의 Vue/Vite 정적 SPA
- 백엔드: Render의 단일 Docker Web Service
- 데이터베이스: Render Persistent Disk의 `/var/data/lunch.db`
- 실시간 갱신: 단일 Render 프로세스의 인프로세스 pub/sub와 SSE

Netlify:

- Base Directory: 저장소 루트
- Build Command: `pnpm --filter @ssabap/shared build && pnpm --filter @ssabap/web build`
- Publish Directory: `apps/web/dist`
- Build 환경변수: `NODE_VERSION=22`
- Build 환경변수: `VITE_API_BASE_URL=https://<render-service>.onrender.com/api/v1`
- Vue Router history mode용 SPA rewrite가 필요합니다.

Render:

- Runtime: Docker
- Docker Build Context: 저장소 루트
- Dockerfile Path: `apps/api/Dockerfile`
- Health Check Path: `/api/v1/health/ready`
- Persistent Disk Mount Path: `/var/data`
- 주요 환경변수: `DATABASE_URL=file:/var/data/lunch.db`, `WEB_ORIGIN=https://<netlify-site>.netlify.app`
- Instance Count: 1, autoscaling 비활성화

Render의 기본 파일시스템은 임시 저장소입니다. 운영 SQLite에는 유료 Persistent Disk가 반드시 필요하며, 무료 Web Service의 로컬 파일에 데이터를 저장하면 안 됩니다. 운영 secret은 `.env` 파일로 커밋하지 않고 각 배포 플랫폼의 환경변수 설정에 등록합니다.

현재 저장소에는 과거 Vercel/EC2용 `apps/web/vercel.json`, `Caddyfile`, `docker-compose.yml`이 남아 있지만 Netlify·Render 운영 배포에는 사용하지 않습니다. 실제 배포 전에는 Netlify SPA rewrite, Express `trust proxy`와 Render bind 확인을 코드/플랫폼 설정에 반영해야 합니다.

상세 설계는 [시스템 설계서](docs/system-design.md), [ADR-0001](docs/adr/0001-small-single-region-adaptive-groups.md), [ADR-0002](docs/adr/0002-netlify-render-single-instance.md)를 참고하세요.
