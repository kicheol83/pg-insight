# PG Insight

PostgreSQL 모니터링 대시보드입니다. 모니터링할 DB를 등록하면 커넥션, 슬로우 쿼리, 락, 블로트, VACUUM/XID, 복제 지연을 보여주고 임계값 알림을 보냅니다.

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

## 기술 스택

- Backend: NestJS 11, Prisma, `pg`, Socket.io
- DB: PostgreSQL 16 (플랫폼), TimescaleDB (메트릭)
- Frontend: Vite, React 18, TypeScript, Tailwind, Recharts
- Infra: Docker Compose, Caddy

## 구조

- Platform DB: 사용자, 대상(비밀번호는 AES-256-GCM으로 암호화), 알림 규칙, 감사 로그
- Metrics DB: TimescaleDB hypertable, 오래된 데이터는 압축 후 삭제
- Collectors: 대상마다 3초~5분 주기로 수집, 대상당 커넥션 최대 5개

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

## 배포

```bash
cp .env.prod.example .env
docker compose -f docker-compose.prod.yml up -d --build
```
