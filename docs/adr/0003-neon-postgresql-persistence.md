# ADR-0003: Neon PostgreSQL 영속화

- 상태: 승인됨(Accepted)
- 결정일: 2026-07-21
- 적용 대상: 운영 데이터베이스, Prisma migration, Render 무료 인스턴스의 데이터 영속화
- 대체 대상: ADR-0001과 ADR-0002의 SQLite 및 Render Persistent Disk 관련 결정

## 배경

Render 무료 Web Service의 로컬 파일시스템은 재배포, 재시작, 유휴 절전 때 유지되지 않는다. SQLite 파일을 Render 컨테이너에 저장하면 참가 등록이 유실될 수 있고, 무료 인스턴스에는 Persistent Disk를 연결할 수 없다. 서비스 규모는 회차당 최대 26명으로 작지만 등록 데이터는 애플리케이션 인스턴스 수명과 분리해 보존해야 한다.

## 결정

1. 프론트엔드는 Netlify, 백엔드는 단일 Render Web Service를 계속 사용한다.
2. 운영 데이터베이스를 SQLite에서 Neon PostgreSQL 18로 전환한다.
3. Prisma Client 런타임은 Neon pooled connection을 `DATABASE_URL`로 사용한다.
4. Prisma migration은 Neon direct connection을 `DIRECT_URL`로 사용한다.
5. Render Persistent Disk는 사용하지 않으며 데이터 영속성을 Neon에 위임한다.
6. Render 인스턴스는 계속 하나만 사용하고 SSE pub/sub와 scheduler는 같은 Node 프로세스에서 실행한다.
7. Docker 시작 단계에서 `prisma migrate deploy`를 실행한 뒤 API를 시작한다.
8. 기존 SQLite 파일이 남아 있으면 PostgreSQL 대상이 비어 있을 때만 `pnpm db:import-sqlite`로 가져온다.

## 결과

### 장점

- Render 재배포, 재시작과 무료 인스턴스 절전에도 등록 데이터가 유지된다.
- 유료 Render Persistent Disk 없이 운영할 수 있다.
- 현재 Prisma 모델과 서비스 계층을 유지하면서 저장소만 PostgreSQL로 바꿀 수 있다.

### 감수하는 제약

- Render 무료 인스턴스의 콜드 스타트와 일시적인 접속 지연은 계속 존재한다.
- Neon 무료 플랜의 저장 공간, compute time, 네트워크 제한과 서비스 정책에 의존한다.
- Neon compute가 유휴 상태에서 재개될 때 짧은 연결 지연이 발생할 수 있다.
- 이미 삭제된 Render 임시 SQLite 파일은 복구할 수 없다.
- 기존 SQLite migration history는 PostgreSQL에서 실행할 수 없어 PostgreSQL baseline migration으로 교체한다.

## 전환 절차

1. Neon 프로젝트와 운영 branch를 생성한다.
2. pooled connection string을 Render `DATABASE_URL`에 등록한다.
3. direct connection string을 Render `DIRECT_URL`에 등록한다.
4. 새 배포에서 PostgreSQL baseline migration이 완료되는지 확인한다.
5. 보존된 SQLite 파일을 이전해야 한다면 첫 사용자 등록 전에 import 명령을 한 번만 실행한다.
6. `/api/v1/health/ready`, 참가 등록, Render 재배포 후 데이터 유지 여부를 확인한다.

## 변경 규칙

SQLite로 되돌리거나 다른 데이터베이스로 전환하는 경우 이 문서를 조용히 수정하지 않고 새 ADR로 대체한다. Neon 무료 플랜의 한도를 초과하면 먼저 유료 Neon 플랜을 검토하며, 복수 Render 인스턴스나 분산 pub/sub는 별도 요구가 생길 때만 결정한다.
