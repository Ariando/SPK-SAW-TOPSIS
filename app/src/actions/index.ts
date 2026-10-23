import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { eq } from 'drizzle-orm';
import { db } from '../lib/guard';
import { alternatives, criteria, rubrics, scores } from '../db/schema';
import { runActions } from '../lib/runs';

function adminOnly(user: App.Locals['user']) {
  if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Sesi tidak ditemukan.' });
  if (user.role !== 'admin') throw new ActionError({ code: 'FORBIDDEN', message: 'Hanya pengelola yang boleh mengubah data.' });
  return user;
}

const criterionSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  code: z.string().trim().min(1, 'Kode wajib diisi').max(8, 'Kode maksimal 8 karakter'),
  name: z.string().trim().min(3, 'Nama minimal 3 karakter').max(160, 'Nama maksimal 160 karakter'),
  weight: z.coerce.number().min(0, 'Bobot tidak boleh negatif').max(100, 'Bobot maksimal 100'),
  direction: z.enum(['benefit', 'cost']),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

const alternativeSchema = z.object({
  code: z.string().trim().min(1, 'Kode wajib diisi').max(16),
  title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(255),
  studentName: z.string().trim().min(3, 'Nama mahasiswa minimal 3 karakter').max(160),
  nim: z.string().trim().min(3, 'NIM minimal 3 karakter').max(24),
  concentration: z.string().trim().max(120).optional().or(z.literal('')),
});

const scoreValuesSchema = z.record(
  z.string().regex(/^\d+$/, 'ID kriteria harus angka'),
  z.coerce.number().min(0, 'Nilai tidak boleh negatif').max(1000, 'Nilai maksimal 1000')
);

export const server = {
  criteria: {
    save: defineAction({
      accept: 'form',
      input: criterionSchema,
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        const now = new Date();
        const duplicate = await db
          .select({ id: criteria.id })
          .from(criteria)
          .where(eq(criteria.code, input.code))
          .limit(1);
        if (duplicate.length > 0 && Number(duplicate[0].id) !== input.id) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Kode kriteria ' + input.code + ' sudah dipakai. Gunakan kode lain.',
          });
        }
        if (input.id) {
          await db
            .update(criteria)
            .set({
              code: input.code,
              name: input.name,
              weight: input.weight.toFixed(4),
              direction: input.direction,
              sortOrder: input.sortOrder,
              updatedAt: now,
            })
            .where(eq(criteria.id, input.id));
          return { ok: true, id: input.id };
        }
        const inserted = await db
          .insert(criteria)
          .values({
            code: input.code,
            name: input.name,
            weight: input.weight.toFixed(4),
            direction: input.direction,
            sortOrder: input.sortOrder,
            createdAt: now,
            updatedAt: now,
          })
          .$returningId();
        return { ok: true, id: inserted[0].id };
      },
    }),

    remove: defineAction({
      accept: 'form',
      input: z.object({ id: z.coerce.number().int().positive() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        await db.delete(rubrics).where(eq(rubrics.criterionId, input.id));
        await db.delete(scores).where(eq(scores.criterionId, input.id));
        await db.delete(criteria).where(eq(criteria.id, input.id));
        return { ok: true };
      },
    }),

    normalizeWeights: defineAction({
      accept: 'form',
      input: z.object({}),
      handler: async (_input, context) => {
        adminOnly(context.locals.user);
        const rows = await db.select({ id: criteria.id, weight: criteria.weight }).from(criteria);
        const total = rows.reduce((s, r) => s + Number(r.weight), 0);
        if (total <= 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Total bobot nol, tidak bisa dinormalisasi.' });

        const now = new Date();
        for (const row of rows) {
          await db
            .update(criteria)
            .set({ weight: (Number(row.weight) / total).toFixed(4), updatedAt: now })
            .where(eq(criteria.id, row.id));
        }
        return { ok: true, total };
      },
    }),
  },

  rubrics: {
    save: defineAction({
      accept: 'form',
      input: z.object({
        id: z.coerce.number().int().positive().optional(),
        criterionId: z.coerce.number().int().positive(),
        label: z.string().trim().min(1).max(160),
        value: z.coerce.number().min(0).max(1000),
        sortOrder: z.coerce.number().int().min(0).default(0),
      }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        if (input.id) {
          await db
            .update(rubrics)
            .set({ label: input.label, value: input.value.toFixed(4), sortOrder: input.sortOrder })
            .where(eq(rubrics.id, input.id));
          return { ok: true };
        }
        await db.insert(rubrics).values({
          criterionId: input.criterionId,
          label: input.label,
          value: input.value.toFixed(4),
          sortOrder: input.sortOrder,
        });
        return { ok: true };
      },
    }),

    remove: defineAction({
      accept: 'form',
      input: z.object({ id: z.coerce.number().int().positive() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        await db.delete(rubrics).where(eq(rubrics.id, input.id));
        return { ok: true };
      },
    }),
  },

  alternatives: {
    save: defineAction({
      accept: 'form',
      input: alternativeSchema.extend({ id: z.coerce.number().int().positive().optional() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        const now = new Date();
        const duplicate = await db
          .select({ id: alternatives.id })
          .from(alternatives)
          .where(eq(alternatives.code, input.code))
          .limit(1);
        if (duplicate.length > 0 && Number(duplicate[0].id) !== input.id) {
          throw new ActionError({
            code: 'CONFLICT',
            message: 'Kode alternatif ' + input.code + ' sudah dipakai. Gunakan kode lain.',
          });
        }
        const values = {
          code: input.code,
          title: input.title,
          studentName: input.studentName,
          nim: input.nim,
          concentration: input.concentration || null,
          updatedAt: now,
        };
        if (input.id) {
          await db.update(alternatives).set(values).where(eq(alternatives.id, input.id));
          return { ok: true, id: input.id };
        }
        const inserted = await db
          .insert(alternatives)
          .values({ ...values, createdAt: now })
          .$returningId();
        return { ok: true, id: inserted[0].id };
      },
    }),

    remove: defineAction({
      accept: 'form',
      input: z.object({ id: z.coerce.number().int().positive() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        await db.delete(scores).where(eq(scores.alternativeId, input.id));
        await db.delete(alternatives).where(eq(alternatives.id, input.id));
        return { ok: true };
      },
    }),

    toggleActive: defineAction({
      accept: 'form',
      input: z.object({ id: z.coerce.number().int().positive(), active: z.coerce.boolean() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        await db
          .update(alternatives)
          .set({ isActive: input.active, updatedAt: new Date() })
          .where(eq(alternatives.id, input.id));
        return { ok: true };
      },
    }),
  },

  scores: {
    saveCell: defineAction({
      accept: 'form',
      input: z.object({
        alternativeId: z.coerce.number().int().positive(),
        criterionId: z.coerce.number().int().positive(),
        value: z.coerce.number().min(0, 'Nilai tidak boleh negatif').max(1000, 'Nilai maksimal 1000'),
      }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        const now = new Date();
        await db
          .insert(scores)
          .values({
            alternativeId: input.alternativeId,
            criterionId: input.criterionId,
            value: input.value.toFixed(4),
            updatedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: { value: input.value.toFixed(4), updatedAt: now },
          });
        return { ok: true };
      },
    }),

    saveRow: defineAction({
      accept: 'form',
      input: z.object({
        alternativeId: z.coerce.number().int().positive(),
        valuesJson: z.string().min(2, 'Nilai belum dikirim'),
      }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(input.valuesJson);
        } catch {
          throw new ActionError({ code: 'BAD_REQUEST', message: 'Format nilai tidak sah.' });
        }

        const parsedValues = scoreValuesSchema.safeParse(parsedJson);
        if (!parsedValues.success) {
          throw new ActionError({
            code: 'BAD_REQUEST',
            message: 'Nilai tidak sah: ' + parsedValues.error.issues[0].message,
          });
        }

        const now = new Date();
        const entries = Object.entries(parsedValues.data);
        if (entries.length === 0) throw new ActionError({ code: 'BAD_REQUEST', message: 'Tidak ada nilai untuk disimpan.' });

        await db.transaction(async (tx) => {
          for (const [criterionId, value] of entries) {
            await tx
              .insert(scores)
              .values({
                alternativeId: input.alternativeId,
                criterionId: Number(criterionId),
                value: value.toFixed(4),
                updatedAt: now,
              })
              .onDuplicateKeyUpdate({
                set: { value: value.toFixed(4), updatedAt: now },
              });
          }
        });

        return { ok: true, count: entries.length };
      },
    }),

    clearRow: defineAction({
      accept: 'form',
      input: z.object({ alternativeId: z.coerce.number().int().positive() }),
      handler: async (input, context) => {
        adminOnly(context.locals.user);
        await db.delete(scores).where(eq(scores.alternativeId, input.alternativeId));
        return { ok: true };
      },
    }),
  },

  runs: runActions,
};