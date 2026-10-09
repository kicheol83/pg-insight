# pg-insight-back

NestJS API와 메트릭 수집기입니다.

## 실행

```powershell
docker compose up -d platform-db metrics-db
Copy-Item .env.example .env
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

필수 환경 변수: `PLATFORM_DATABASE_URL`, `TIMESCALE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`

## 모듈

- `collector`: 대상별 수집기
- `live`: 대상 DB 실시간 조회
- `alerts`: 알림 규칙 평가
- `targets`: 대상 등록, 커넥션 풀
- `auth`: JWT, 권한

## 테스트

```powershell
npx jest
```
