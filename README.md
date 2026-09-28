# PG Insight

[English](./README.en.md) | **한국어**

실시간 PostgreSQL 모니터링 플랫폼입니다. 접속 정보만 등록하면 커넥션, 슬로우 쿼리, 락, 테이블 블로트, VACUUM/XID 상태, 복제 지연을 실시간 대시보드로 확인하고, 임계값 기반 알림을 받을 수 있습니다.

**Live Demo:** https://pginsight.javohir.dev

## 주요 기능

- **실시간 모니터링**: Socket.io 기반으로 커넥션 수와 락 알림을 실시간 푸시
- **쿼리 분석**: `pg_stat_statements` 기반 슬로우 쿼리 분석, `EXPLAIN` 실행 계획 시각화
- **락 분석**: 블로킹 체인 탐지, 데드락 위험 감지
- **테이블 / VACUUM**: 블로트 비율, dead tuple, XID age 추적
- **복제 모니터링**: 레플리카별 지연(bytes / ms), 비활성 슬롯 감지
- **유지보수 작업**: `VACUUM (ANALYZE)`, 미사용 인덱스 `DROP INDEX CONCURRENTLY`
- **백업 자동화**: `pg_dump` 기반 백업 생성 및 다운로드
- **알림**: 임계값 규칙, 쿨다운, 웹훅 연동
- **Health Score / 보안 감사**: 설정 진단과 보안 점검 결과 제공

## 기술 스택

| 영역 | 기술 |
|---|---|
| Backend | NestJS, Prisma, `pg`, Socket.io |
| Database | PostgreSQL 16 (플랫폼 DB), TimescaleDB (메트릭 시계열) |
| Frontend | Vite, React 18, TypeScript, Tailwind CSS, Recharts |
| Infra | Docker Compose, Caddy (자동 HTTPS), Ubuntu 24.04 VPS, Cloudflare DNS |

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
              │ Platform DB  │  │ Metrics DB     │     │ 모니터링 대상 │
              │ (Prisma)     │  │ (TimescaleDB)  │     │ PostgreSQL    │
              └──────────────┘  └────────────────┘     └──────────────┘
```

- **Platform DB**: 사용자, 모니터링 대상(비밀번호는 AES-256-GCM 암호화), 알림 규칙, 감사 로그 저장
- **Metrics DB**: 수집된 메트릭을 hypertable로 저장하고, 압축 및 보존 정책 적용
- **Collectors**: 5초~5분 주기로 대상 DB의 메트릭을 수집해 TimescaleDB에 기록
- **Live Queries**: 실시간 데이터가 필요한 화면은 대상 DB에 직접 조회

## 보안

- JWT Access Token(15분) + Refresh Token 로테이션 (서버에는 SHA-256 해시만 저장)
- 대상 DB 비밀번호 AES-256-GCM 암호화, 키 로테이션 스크립트 제공
- `EXPLAIN` 엔드포인트 4단계 방어: 주석 제거 → 다중 구문 차단 → 키워드 차단 → `READ ONLY` 트랜잭션
- 필수 시크릿(`JWT_SECRET`, `ENCRYPTION_KEY`, `TIMESCALE_URL`)이 없으면 애플리케이션이 시작되지 않음
- 운영 환경에서 DB 포트를 외부에 노출하지 않고, 모든 트래픽은 리버스 프록시를 통해서만 전달
- API 컨테이너는 root가 아닌 `node` 사용자로 실행
- 로그인, 대상 변경, `EXPLAIN` 호출 감사 로그 기록

## 로컬 실행

```powershell
cd pg-insight-back
docker compose up -d platform-db metrics-db
Copy-Item .env.example .env
npm install --legacy-peer-deps
npx prisma migrate deploy
npm run start:dev
```

`.env`에 `JWT_SECRET`(32자 이상)과 `ENCRYPTION_KEY`를 반드시 설정해야 합니다.

```powershell
cd pg-insight-ui
npm install
npm run dev
```

http://localhost:5173 에 접속하면 로그인 화면에서 첫 번째 관리자 계정을 생성할 수 있습니다.

## 운영 배포

```bash
cp .env.prod.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

- `.env`의 비밀번호와 키는 `openssl rand -hex 32` 등으로 생성합니다.
- `web` 컨테이너는 외부 Docker 네트워크 `proxy`에 연결되며, 상위 Caddy가 `pginsight.javohir.dev`로 라우팅합니다.
- 배포 직후 첫 번째 관리자 계정을 바로 생성해야 합니다.
- `ENCRYPTION_KEY`를 분실하면 저장된 대상 DB 비밀번호를 복호화할 수 없으므로 안전한 곳에 백업합니다.

## 모니터링 대상 DB 준비

```sql
GRANT pg_monitor TO your_monitoring_user;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

`pg_stat_statements`를 사용하려면 `postgresql.conf`에 `shared_preload_libraries = 'pg_stat_statements'` 설정 후 재시작이 필요합니다.

## 상세 문서

- [Backend README](./pg-insight-back/README.md)
- [Frontend README](./pg-insight-ui/README.md)

## 알려진 한계 및 개선 예정

- WebSocket `/metrics` 네임스페이스 JWT 인증 추가 예정
- 역할(admin / viewer)별 유지보수 작업 권한 분리 예정
- 모니터링 대상 호스트에 대한 내부망 접근 제한 예정
- E2E 테스트(Playwright) 미구현

## License

MIT
