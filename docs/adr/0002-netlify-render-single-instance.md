# ADR-0002: Netlify·Render 단일 인스턴스 배포

- 상태: 승인됨(Accepted)
- 결정일: 2026-07-20
- 적용 대상: 프론트엔드 배포, 백엔드 배포, SQLite 영속화, CORS, 실시간 이벤트
- 대체 대상: ADR-0001의 AWS 서울 리전, Vercel, EC2, EBS 관련 결정

## 배경

배포 플랫폼을 프론트엔드는 Netlify, 백엔드는 Render로 변경한다. 서비스는 회차당 최대 26명이고 Express 프로세스 내부 pub/sub로 SSE 이벤트를 발행하며 SQLite를 사용한다. 따라서 플랫폼 변경 후에도 단일 백엔드 인스턴스와 영속 디스크라는 경계를 유지해야 한다.

## 결정

### 1. 프론트엔드

- Vue/Vite SPA는 Netlify에 배포한다.
- pnpm workspace의 공통 패키지를 함께 빌드할 수 있도록 저장소 루트에서 빌드한다.
- Build Command는 `pnpm --filter @ssabap/shared build && pnpm --filter @ssabap/web build`로 설정한다.
- Publish Directory는 저장소 루트 기준 `apps/web/dist`로 설정한다.
- Vue Router history mode를 위해 모든 애플리케이션 경로를 `/index.html`로 보내는 `200` rewrite를 적용한다.
- Netlify 빌드 환경변수 `VITE_API_BASE_URL`에는 Render API의 `/api/v1` URL을 설정한다.
- 운영 주소가 확정되기 전 문서의 `<netlify-site>`와 `<render-service>`는 실제 서비스 이름으로 치환한다.

### 2. 백엔드

- Express API와 scheduler worker는 하나의 Render Web Service에서 같은 Node 프로세스로 실행한다.
- Runtime은 기존 `apps/api/Dockerfile`을 사용하는 Docker로 한다.
- Docker Build Context는 저장소 루트, Dockerfile Path는 `apps/api/Dockerfile`로 설정한다. 공통 패키지 `packages/shared`가 빌드에 필요하므로 `apps/api`만 루트로 지정하지 않는다.
- 서버는 Render가 주입하는 `PORT`를 사용하고 `0.0.0.0`에 바인딩한다.
- Health Check Path는 데이터베이스 준비 상태까지 확인하는 `/api/v1/health/ready`로 설정한다.
- TLS 종료와 외부 HTTPS는 Render가 관리하므로 운영 배포에서 Caddy/Nginx와 `docker-compose.yml`을 사용하지 않는다.
- API 인스턴스 수는 항상 1로 유지하고 autoscaling을 활성화하지 않는다.

### 3. SQLite 영속화와 마이그레이션

- Render Persistent Disk를 `/var/data`에 마운트한다.
- 운영 `DATABASE_URL`은 `file:/var/data/lunch.db`로 설정한다.
- Render의 기본 파일시스템은 임시이므로 Persistent Disk 없는 무료 Web Service에 운영 SQLite를 저장하지 않는다.
- Persistent Disk는 유료 서비스에서만 사용할 수 있다는 비용을 수용한다.
- Render pre-deploy command는 Persistent Disk에 접근할 수 없으므로 데이터베이스 마이그레이션에 사용하지 않는다.
- 기존 Docker 시작 명령처럼 서비스 시작 전에 `prisma migrate deploy`를 실행한 뒤 API를 시작한다.

### 4. CORS, 프록시, 실시간 연결

- Render의 `WEB_ORIGIN`에는 Netlify 운영 origin을 정확히 등록한다. 허용할 Netlify Preview 주소가 있다면 쉼표로 구분해 명시적으로 추가한다.
- 와일드카드 origin과 credentials 조합은 사용하지 않는다.
- Render 프록시 뒤의 실제 클라이언트 IP를 rate limit에 사용하도록 Express `trust proxy`를 Render 토폴로지에 맞게 설정하고 검증한다.
- SSE 이벤트 버스는 프로세스 메모리에 있으므로 단일 프로세스 안에서만 전달을 보장한다. 다중 인스턴스 전환은 외부 pub/sub와 데이터베이스 전환을 포함한 새 ADR 없이는 허용하지 않는다.

### 5. 지역과 운영 범위

- 사용자와 제품 동작 범위는 대한민국이며 시간대 `Asia/Seoul`, 화면 언어 `ko-KR`를 유지한다.
- 호스팅 리전은 Render에서 선택 가능한 단일 리전을 사용한다. 다중 리전과 지역별 라우팅은 구현하지 않는다.
- 특정 AWS 서울 리전 사용은 더 이상 요구사항이 아니다.

## 결과

### 장점

- 프론트엔드 CDN/TLS와 백엔드 TLS, 배포, 재시작을 관리형 플랫폼에 맡긴다.
- 기존 Vue, Express, Docker, Prisma, SQLite 구조를 유지한다.
- 최대 26명 규모에 불필요한 분산 구성을 도입하지 않는다.

### 감수하는 제약

- SQLite 영속화를 위해 유료 Render 서비스와 Persistent Disk가 필요하다.
- 단일 Render 인스턴스 장애나 재배포 중에는 API와 SSE 연결이 일시 중단될 수 있다.
- Persistent Disk가 연결된 서비스는 수평 확장할 수 없다.
- Netlify와 Render의 플랫폼 설정 및 가용성에 의존한다.

## 배포 전 구현 조건

- Netlify SPA rewrite 설정을 저장소 설정 파일 또는 Netlify UI에 반영한다.
- Render에서 안정적으로 기동하도록 API가 `0.0.0.0:$PORT`에 바인딩되는지 확인한다.
- Express `trust proxy` 설정과 프록시 환경의 rate limit 동작을 테스트한다.
- Render Persistent Disk를 `/var/data`에 마운트하고 재배포 후 데이터 유지 여부를 검증한다.
- Netlify 운영 origin과 Render API URL이 확정되면 양쪽 환경변수를 실제 주소로 교체한다.

## 변경 규칙

Vercel, EC2, EBS로 되돌리거나 백엔드를 여러 인스턴스로 늘리는 변경은 이 문서를 조용히 수정하는 방식으로 수행하지 않는다. 변경 이유, 비용, SQLite와 SSE 마이그레이션 영향을 기록한 새 ADR로 이 결정을 대체한다.
