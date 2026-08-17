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

Swagger: http://localhost:3000/api/docs

## 테스트

```powershell
npx jest
```
