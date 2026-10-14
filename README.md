# PG Insight

PostgreSQL 모니터링 서비스입니다. 가입한 뒤 자신의 PostgreSQL 접속 정보를 등록하면 커넥션, 슬로우 쿼리, 락, 블로트, VACUUM/XID, 복제 지연을 대시보드에서 보고 알림을 받을 수 있습니다. 사용자는 자기가 등록한 대상만 볼 수 있습니다.

데모: https://pginsight.javohir.dev

## 주요 기능

- 대시보드: 커넥션, 캐시 적중률, 락 대기 추이 (TimescaleDB)
- 쿼리: `pg_stat_statements` 슬로우 쿼리, `EXPLAIN (ANALYZE)` 실행 계획
- 락: 블로킹 체인
- 테이블 / VACUUM: 블로트, dead tuple, XID age
- 복제: 레플리카별 지연, 슬롯 상태
- 유지보수: `VACUUM (ANALYZE)`, 미사용 인덱스 삭제
- 백업: `pg_dump` (관리자만)
- 알림: 15초마다 규칙 평가, 웹훅
- Health Score와 보안 점검
- UI 언어: 한국어(기본), English, O'zbekcha

## 기술 스택

- Backend: NestJS 11, Prisma, `pg`, Socket.io
- DB: PostgreSQL 16 (플랫폼), TimescaleDB (메트릭)
- Frontend: Vite, React 18, TypeScript, Tailwind, Recharts
- Infra: Docker Compose, Caddy

## 구조

- Platform DB: 사용자, 대상(비밀번호는 AES-256-GCM으로 암호화), 알림 규칙, 감사 로그
- Metrics DB: TimescaleDB hypertable, 오래된 데이터는 압축 후 삭제
- Collectors: 대상마다 3초~5분 주기로 수집, 대상당 커넥션 최대 5개

## 권한과 보안

- 첫 번째 계정이 `admin`, 회원가입은 `user` (`SIGNUP_ENABLED=true`일 때만)
- `user`는 자기 대상만 조회/수정, 다른 사람 대상은 404
- 대상은 계정당 3개, 사설/내부 주소는 등록 불가 (SSRF 방지)
- `EXPLAIN`은 `SELECT`/`WITH`만, `BEGIN READ ONLY` + `statement_timeout = 5s`
- 로그인, 가입 요청 제한
- 새 대상의 기본 `sslmode`는 `require` (node-postgres에는 `prefer` fallback이 없음)

## 모니터링 오버헤드

운영 서버의 LedgerCore DB를 대상으로 10분씩 측정했습니다.

- PG Insight 쿼리: 초당 약 4회, 평균 0.145 ms
- 실행 시간 합계: 600초 중 353 ms (CPU 1코어의 약 0.06%)
- 대상 DB 커넥션: idle 5개

측정 스크립트: `scripts/measure-overhead.sh`

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

`.env`에 `JWT_SECRET`과 `ENCRYPTION_KEY`가 필요합니다.

```powershell
cd pg-insight-ui
npm install
npm run dev
```

http://localhost:5173 에서 첫 관리자 계정을 만들 수 있습니다.

## 대상 DB 준비

```sql
CREATE ROLE insight_monitor LOGIN PASSWORD '...';
GRANT pg_monitor TO insight_monitor;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

`pg_stat_statements`는 `shared_preload_libraries` 설정 후 재시작이 필요합니다.

## 복제 클러스터 테스트

복제 화면은 Docker로 띄운 3노드 클러스터(PostgreSQL 17, repmgr primary 1 + standby 2, pgBackRest)에서 확인했습니다.

## 테스트

```powershell
cd pg-insight-back
npx jest
cd ..\pg-insight-ui
npx vitest run
```

Backend 252개(실제 DB가 필요한 12개 포함), Frontend 50개. 실제 DB가 필요한 테스트는 `TEST_TARGET_DATABASE_URL`이 있을 때만 실행됩니다.

## 배포

```bash
cp .env.prod.example .env
./scripts/deploy.sh
./scripts/rollback.sh [sha]
```

이미지는 커밋 SHA로 태그하고 `/api/v1/health`가 통과한 뒤에만 `.deploy-history`에 기록합니다. 마이그레이션은 되돌리지 않으므로 이전 코드와 호환되게 작성합니다.

## License

MIT
