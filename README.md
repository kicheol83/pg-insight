# PG Insight

[English](./README.en.md) | **한국어**

오픈소스 멀티테넌트 PostgreSQL 모니터링 서비스입니다. 누구나 가입한 뒤 자신의 PostgreSQL 접속 정보를 등록하면 커넥션, 슬로우 쿼리, 락, 테이블 블로트, VACUUM/XID 상태, 복제 지연을 대시보드로 확인하고 임계값 기반 알림을 받을 수 있습니다. 각 사용자는 자신이 등록한 대상만 볼 수 있습니다.

**Live:** https://pginsight.javohir.dev — 회원가입 후 바로 사용할 수 있습니다 (계정당 대상 3개, 공인 주소만 등록 가능).

## 주요 기능

- **대시보드**: 커넥션, 캐시 적중률, 락 대기 추이를 TimescaleDB에 저장된 메트릭으로 표시
- **쿼리 분석**: `pg_stat_statements` 기반 슬로우 쿼리 분석, `EXPLAIN (ANALYZE)` 실행 계획 시각화
- **락 분석**: 블로킹 체인 탐지, 데드락 위험 감지
- **테이블 / VACUUM**: 블로트 비율, dead tuple, XID age 추적
- **복제 모니터링**: 레플리카별 지연(bytes / ms), 비활성 슬롯 감지
- **유지보수 작업**: `VACUUM (ANALYZE)`, 미사용 인덱스 `DROP INDEX CONCURRENTLY`
- **백업**: `pg_dump` 기반 백업 생성 및 다운로드 (관리자 전용)
- **알림**: 임계값 규칙, 쿨다운, 웹훅 연동
- **Health Score / 보안 감사**: 설정 진단과 보안 점검 결과 제공
- **다국어 UI**: 한국어(기본), English, O'zbekcha. 선택한 언어는 브라우저에 저장

## 기술 스택

| 영역 | 기술 |
|---|---|
| Backend | NestJS 11, Prisma 7, `pg`, Socket.io |
| Database | PostgreSQL 16 (플랫폼 DB), TimescaleDB (메트릭 시계열) |
| Frontend | Vite, React 18, TypeScript, Tailwind CSS, Recharts |
| Infra | Docker Compose, Caddy (자동 HTTPS), Ubuntu 24.04 VPS |

## 아키텍처

```
                 ┌──────────────────────────────┐
  Browser ──────▶│ Caddy (TLS, 보안 헤더)         │
   HTTPS         └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ web (Caddy + React 정적 파일)   │
                 │  /api/*, /socket.io/* → api   │
                 └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ api (NestJS)                  │
                 │  Collectors · Live · Alerts   │
                 └──────┬───────────────┬───────┘
                        ▼               ▼
              ┌──────────────┐  ┌────────────────┐     ┌──────────────┐
              │ Platform DB  │  │ Metrics DB     │     │ 사용자의       │
              │ (Prisma)     │  │ (TimescaleDB)  │     │ PostgreSQL    │
              └──────────────┘  └────────────────┘     └──────────────┘
```

- **Platform DB**: 사용자, 모니터링 대상(비밀번호는 AES-256-GCM 암호화), 알림 규칙, 감사 로그
- **Metrics DB**: 수집된 메트릭을 hypertable(1일 chunk)로 저장. 7일이 지난 `connection_metrics`, `query_metrics`는 압축하고, 테이블별로 7~30일 뒤 삭제
- **Collectors**: 대상마다 3초(락)~5분(시스템) 주기로 메트릭을 수집해 TimescaleDB에 기록. 대상당 커넥션 풀 최대 5개
- **Live Queries**: 실시간 데이터가 필요한 화면은 대상 DB에 직접 조회

## 사용자와 권한

| 역할 | 할 수 있는 일 |
|---|---|
| `admin` (첫 번째 계정) | 모든 대상 조회, 사용자 초대(`/auth/register`), 백업 생성·다운로드·삭제. 대상 수 제한과 호스트 정책을 적용받지 않음 |
| `user` (회원가입) | 자신이 등록한 대상만 조회·수정·삭제. 메트릭, `EXPLAIN`, 알림 규칙, `VACUUM`/`DROP INDEX`. 활성 대상 `TARGET_QUOTA_PER_USER`개(기본 3)까지, 공인 주소만 등록 |

- 소유권은 `Target.createdByUserId` 기준이며, 전역 가드가 `:targetId`가 있는 모든 라우트와 알림 규칙·알림 이벤트·백업 ID 라우트에서 확인합니다.
- 다른 사용자의 대상에 접근하면 403이 아니라 **404**를 반환해 대상의 존재 여부도 노출하지 않습니다.
- 유지보수 작업은 등록한 모니터링 계정의 권한으로 실행되므로, 실제로 가능한 작업은 대상 DB의 GRANT가 결정합니다.
- 백업 파일은 서버 디스크에 저장되므로 백업은 관리자만 실행할 수 있습니다.
- 모든 변경 라우트가 소유권 확인 또는 관리자 가드로 보호되는지 테스트(`admin-routes.spec.ts`)가 컨트롤러 메타데이터를 검사합니다. 새 라우트가 보호 없이 추가되면 테스트가 실패합니다.

## 보안

**인증**
- JWT Access Token(15분) + Refresh Token 로테이션 (서버에는 SHA-256 해시만 저장)
- 회원가입은 `SIGNUP_ENABLED=true`일 때만 열리며 IP당 시간당 5회, 로그인은 IP당 분당 10회로 제한
- 가입 요청 본문에 `role`을 넣으면 400으로 거부 (항상 `user`로 생성)
- `trust proxy`는 loopback·사설 대역의 프록시만 신뢰하므로, 위조한 `X-Forwarded-For`로 rate limit을 우회할 수 없음 (운영 환경에서 확인)

**대상 호스트 제한 (SSRF 방지)**
- 일반 사용자가 등록하는 호스트는 DNS 조회 결과 **모든** 주소를 검사해 사설·loopback·link-local(`169.254.169.254` 포함)·CGNAT·IPv6 ULA 등 내부 대역이면 거부
- 점이 없는 이름과 `.local`, `.internal`, `.lan` 등 내부 도메인 거부 (예: Docker 서비스명 `platform-db`)
- 검사한 IP로 직접 접속하고 TLS에는 원래 호스트명(SNI)을 사용해, 검사 후 DNS 응답이 바뀌는 DNS rebinding을 차단
- 자체 호스팅·사내망에서는 `TARGET_ALLOW_PRIVATE_HOSTS=true`로 해제 가능
- 새 대상의 기본 SSL 모드는 `require`. node-postgres에는 libpq의 `prefer`(TLS 실패 시 평문 전환)가 없어 `prefer`가 사실상 평문 접속이었기 때문에 기본값을 바꿈

**`EXPLAIN` 엔드포인트**
- 주석 제거 → 다중 구문 차단 → `SELECT`/`WITH`만 허용 → 키워드 차단 → 위험 함수 차단(`pg_sleep`, `pg_terminate_backend`, `dblink`, `lo_*`, 파일 읽기 함수 등)
- `BEGIN READ ONLY` 트랜잭션 안에서 `statement_timeout = 5s`, `lock_timeout = 1s`로 실행. 시간 초과는 400으로 반환
- 운영 환경 확인: `pg_sleep` 호출 → 실행 전에 차단되어 0.05초 만에 400, `generate_series(1, 10000000000)` → 5.4초에 400

**WebSocket**
- `/metrics` 네임스페이스는 핸드셰이크에서 JWT를 검증하고, 대상별 room 구독 시 소유권을 확인
- 이벤트는 해당 대상 room에만 전송 (전체 브로드캐스트 없음)

**기타**
- 필수 시크릿(`JWT_SECRET`, `ENCRYPTION_KEY`, `TIMESCALE_URL`)이 없으면 애플리케이션이 시작되지 않음
- 운영 환경에서 DB 포트를 외부에 노출하지 않고, 모든 트래픽은 리버스 프록시를 통해서만 전달
- API 컨테이너는 root가 아닌 `node` 사용자로 실행
- 로그인, 회원가입(IP 포함), 대상 변경, `EXPLAIN` 호출 감사 로그 기록

취약점은 [SECURITY.md](./SECURITY.md)의 방법으로 비공개 제보해 주세요.

## 모니터링 오버헤드 (실측)

운영 VPS(8 vCPU, 8 GB RAM)의 LedgerCore DB(PostgreSQL 16.15)를 대상으로 2026-10-09에 10분씩 측정했습니다. 두 구간 모두 애플리케이션 부하는 같았습니다(`ledger` 역할 1,798 calls).

| 항목 | 결과 |
|---|---|
| PG Insight 쿼리 | 2,430 calls (초당 4.05회), 31종류 |
| 실행 시간 합계 | 353.4 ms / 600 s → CPU 1코어의 약 0.06% |
| 평균 / 최대 실행 시간 | 0.145 ms / 13.67 ms |
| 임시 파일 쓰기 | 0 블록 |
| 대상 컨테이너 CPU | 수집 중 4.59 s vs 수집 없음 2.82 s → 1코어의 약 +0.3% |
| 대상 DB 커넥션 | idle 5개 (`max_connections` 100) |

- 컨테이너 CPU 차이에는 쿼리 실행 외의 접속·프로토콜 처리 비용도 포함됩니다.
- 비용이 큰 쿼리는 블로킹 체인 조회, 인덱스 크기 조회(평균 4 ms), 10초마다 반복되는 `pg_settings` 조회입니다. 설정 조회 캐싱과 풀 크기 축소(2~3개)가 다음 최적화 후보입니다.
- 저장 공간: `query_metrics`가 대상당 시간당 약 4 MB(비압축) 증가했습니다. 22분 구간으로 계산한 예비 수치이며 24시간 재측정이 남아 있습니다.
- 측정 스크립트: [`scripts/measure-overhead.sh`](./scripts/measure-overhead.sh). 대상의 `pg_stat_statements` 통계를 초기화하므로 운영 DB에서는 주의해서 실행하세요.

## 로컬 실행

```powershell
cd pg-insight-back
docker compose up -d platform-db metrics-db
Copy-Item .env.example .env
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

`.env`에 `JWT_SECRET`(32자 이상)과 `ENCRYPTION_KEY`를 반드시 설정해야 합니다.

```powershell
cd pg-insight-ui
npm install
npm run dev
```

http://localhost:5173 에 접속하면 로그인 화면에서 첫 번째 관리자 계정을 생성할 수 있습니다. 관리자는 호스트 정책을 적용받지 않으므로 `localhost` 대상도 등록할 수 있습니다.

## 테스트

```powershell
cd pg-insight-back
npx jest
cd ..\pg-insight-ui
npx vitest run
```

- Backend 188개, Frontend 49개 테스트
- 실제 PostgreSQL이 필요한 테스트(락 수집 쿼리, `EXPLAIN` 시간 제한)는 `TEST_TARGET_DATABASE_URL`이 있을 때만 실행됩니다.
- `.github/workflows/ci.yml`: PostgreSQL 16 서비스 컨테이너로 타입 체크, 테스트, 마이그레이션, 빌드를 실행

## 운영 배포

최초 설치:

```bash
cp .env.prod.example .env
./scripts/deploy.sh
```

- `.env`의 비밀번호와 키는 `openssl rand -hex 32` 등으로 생성합니다.
- `web` 컨테이너는 외부 Docker 네트워크 `proxy`에 연결되며, 상위 Caddy가 `pginsight.javohir.dev`로 라우팅합니다.
- 배포 직후 첫 번째 관리자 계정을 바로 생성해야 합니다. 그 다음 공개 가입을 열려면 `SIGNUP_ENABLED=true`로 설정합니다.
- `ENCRYPTION_KEY`를 분실하면 저장된 대상 DB 비밀번호를 복호화할 수 없으므로 안전한 곳에 백업합니다.

### 배포와 롤백

```bash
./scripts/deploy.sh             # 업스트림 fast-forward → 커밋 SHA 태그로 빌드 → health 확인 후 기록
./scripts/rollback.sh           # .deploy-history의 직전 버전으로 되돌림
./scripts/rollback.sh d587ce6   # 특정 버전으로 되돌림
```

- `deploy.sh`는 업스트림에 merge conflict 마커가 있으면 중단하고, `git merge --ff-only`로만 갱신합니다.
- 이미지는 `pg-insight-api:<sha>`, `pg-insight-web:<sha>`로 태그되며, `/api/v1/health`가 90초 안에 응답한 경우에만 `.env`의 `APP_TAG`와 `.deploy-history`를 갱신합니다.
- `rollback.sh`는 빌드 없이 기존 이미지로 컨테이너만 교체합니다. 운영 환경에서 양방향 롤백(71dceaf ↔ d587ce6)을 리허설했습니다.
- **마이그레이션은 되돌리지 않습니다.** API 컨테이너는 시작할 때 `prisma migrate deploy`를 실행하므로, 롤백 후에도 새 스키마가 남습니다. 따라서 마이그레이션은 이전 버전 코드와 호환되도록(컬럼 추가 → 코드 배포 → 이후 정리) 작성합니다.
- `docker compose up -d --build`를 직접 실행하면 `APP_TAG` 기록이 어긋나므로 배포는 스크립트로만 합니다.

### 환경 변수 (서비스 정책)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `SIGNUP_ENABLED` | `false` | 공개 회원가입 허용 |
| `TARGET_QUOTA_PER_USER` | `3` | 일반 사용자당 활성 대상 수 |
| `TARGET_ALLOW_PRIVATE_HOSTS` | `false` | 사설·내부 주소 대상 허용 (자체 호스팅용) |
| `PG_DUMP_PATH` | `pg_dump` | 백업에 사용할 `pg_dump` 경로 |
| `APP_TAG` | `latest` | 실행할 이미지 태그 (`deploy.sh`/`rollback.sh`가 관리) |

## 모니터링 대상 DB 준비

슈퍼유저 대신 모니터링 전용 계정을 만드는 것을 권장합니다.

```sql
CREATE ROLE insight_monitor LOGIN PASSWORD '...';
GRANT pg_monitor TO insight_monitor;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

- `pg_stat_statements`를 사용하려면 `postgresql.conf`에 `shared_preload_libraries = 'pg_stat_statements'` 설정 후 재시작이 필요합니다.
- 대상 DB는 PG Insight 서버에서 접속할 수 있어야 합니다. 방화벽과 `pg_hba.conf`에서 해당 서버만 허용하고 `sslmode=require` 이상을 권장합니다.

## 상세 문서

- [Backend README](./pg-insight-back/README.md)
- [Frontend README](./pg-insight-ui/README.md)
- [Contributing](./CONTRIBUTING.md)

## 알려진 한계 및 개선 예정

- UI가 대상별 WebSocket room을 아직 구독하지 않아, 대시보드는 REST 폴링으로 갱신
- 이메일 인증, 비밀번호 재설정, 계정 삭제 미구현
- 서버가 만드는 문구(진단·보안 점검 결과, 권장 사항, 오류 메시지)는 아직 영어로만 제공
- ESLint 설정 정리 필요, E2E 테스트(Playwright) 미구현

## License

[MIT](./LICENSE)
