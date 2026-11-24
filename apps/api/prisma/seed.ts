/**
 * Seeds the demo account and three realistic designs. Safe to re-run: it resets the demo user's designs.
 * Credentials come from @crane/shared so the login page and the seed always agree.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { existsSync } from 'node:fs';
import { DEMO_USER, SCHEMA_VERSION, analyze, type CraneInputs } from '@crane/shared';
import { withPoolDefaults } from '../src/db';

if (existsSync('.env')) process.loadEnvFile('.env');

const SEEDS: { name: string; notes: string; inputs: CraneInputs }[] = [
  {
    name: 'Fabrication shop bay: 5 t × 15 m',
    notes: 'Single-girder bay crane over the welding line. Pendant control. Runway rail height to be confirmed on site.',
    inputs: { craneType: 'single-girder', capacityT: 5, dutyGroup: 4, spanM: 15, liftHeightM: 6.3, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'auto' },
  },
  {
    name: 'Assembly hall: 20 t × 18 m',
    notes: 'General-purpose double-girder crane for machine assembly. Group A5.',
    inputs: { craneType: 'double-girder', capacityT: 20, dutyGroup: 5, spanM: 18, liftHeightM: 9, trolleyPositionPct: 30, lowHeadroomHoist: false, railType: 'auto' },
  },
  {
    name: 'Steel store: 32 t × 24 m',
    notes: 'Intensive-duty crane serving a coil store. Check headroom against the roof truss before quoting.',
    inputs: { craneType: 'double-girder', capacityT: 32, dutyGroup: 6, spanM: 24, liftHeightM: 12, trolleyPositionPct: 50, lowHeadroomHoist: false, railType: 'A75' },
  },
];

// Admin task: prefer the direct (non-pooled) connection when one is configured.
const db = new PrismaClient({ datasourceUrl: withPoolDefaults(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '') });
try {
  const cost = Number(process.env.BCRYPT_COST ?? 12);
  const user = await db.user.upsert({
    where: { email: DEMO_USER.email },
    update: { passwordHash: await bcrypt.hash(DEMO_USER.password, cost) },
    create: { email: DEMO_USER.email, displayName: 'Demo engineer', passwordHash: await bcrypt.hash(DEMO_USER.password, cost) },
  });
  await db.design.deleteMany({ where: { userId: user.id } });
  for (const s of SEEDS) {
    const a = analyze(s.inputs);
    if (!a.ok || !a.inputs) throw new Error(`Seed design "${s.name}" is invalid: ${JSON.stringify(a.issues)}`);
    await db.design.create({
      data: {
        userId: user.id,
        name: s.name,
        notes: s.notes,
        craneType: a.inputs.craneType,
        capacityT: a.inputs.capacityT,
        spanM: a.inputs.spanM,
        inputs: a.inputs as unknown as Prisma.InputJsonValue,
        schemaVersion: SCHEMA_VERSION,
      },
    });
  }
  console.log(`Seeded demo user ${DEMO_USER.email} with ${SEEDS.length} designs.`);
} finally {
  await db.$disconnect();
}
