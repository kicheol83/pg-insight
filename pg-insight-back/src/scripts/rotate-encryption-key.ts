import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from '../common/crypto.util';

async function main() {
  const newKey = process.argv[2];
  const oldKey = process.env.OLD_ENCRYPTION_KEY;

  if (!newKey || !oldKey) {
    console.error(
      'Usage: OLD_ENCRYPTION_KEY=<eski> npx ts-node scripts/rotate-encryption-key.ts <yangi-kalit>',
    );
    process.exit(1);
  }
  if (newKey.length < 16) {
    console.error("Yangi kalit kamida 16 belgidan iborat bo'lishi kerak");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const db = prisma as unknown as Record<string, unknown>;
  const targetModel = db['target'] as {
    findMany: (
      args: unknown,
    ) => Promise<
      Array<{ id: string; name: string; passwordEncrypted: string }>
    >;
    update: (args: unknown) => Promise<unknown>;
  };

  const targets = await targetModel.findMany({
    select: { id: true, name: true, passwordEncrypted: true },
  });

  console.log(`${targets.length} ta target topildi. Kalit almashtirilmoqda...`);

  let success = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      const plaintext = decrypt(target.passwordEncrypted, oldKey);
      const reencrypted = encrypt(plaintext, newKey);
      await targetModel.update({
        where: { id: target.id },
        data: { passwordEncrypted: reencrypted },
      });
      success++;
      console.log(`  ✓ ${target.name}`);
    } catch (error) {
      failed++;
      console.error(`  ✗ ${target.name}: ${(error as Error).message}`);
    }
  }

  await prisma.$disconnect();

  console.log(`\nTugadi: ${success} muvaffaqiyatli, ${failed} xato.`);
  if (failed > 0) {
    console.error(
      " Ba'zi targetlar yangilanmadi — ular eski kalit bilan qoldi.",
    );
    console.error(
      "   OLD_ENCRYPTION_KEY to'g'ri ekanini tekshiring va qayta urinib ko'ring.",
    );
    process.exit(1);
  }

  console.log(' Barcha target parollari yangi kalit bilan qayta shifrlandi.');
  console.log(
    "   Endi .env faylida ENCRYPTION_KEY ni yangi qiymatga o'zgartiring va ilovani qayta ishga tushiring.",
  );
}

main().catch((err) => {
  console.error('Kutilmagan xato:', err);
  process.exit(1);
});
