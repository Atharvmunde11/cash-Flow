import { z } from "zod";

/**
 * IDs used across the app.
 * ID compatibility: API responses expose `_id` alongside Prisma `id` (cuid strings).
 * - Now (SQLite/Prisma): string ids (e.g. cuid())
 *
 * Keep backward compatibility by accepting both.
 */
export const idString = z
  .string()
  .trim()
  .min(1, "Invalid id")
  .max(128, "Invalid id")
  .refine(
    (v) =>
      /^[a-f\d]{24}$/i.test(v) || // legacy Mongo ObjectId
      /^[a-z0-9_-]{10,}$/i.test(v), // common Prisma/string ids (cuid/uuid-ish/slugs)
    "Invalid id",
  );

export const partyCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  phone: z.string().max(40).optional().default(""),
  address: z.string().max(500).optional().default(""),
  openingBalance: z.coerce.number().finite().optional().default(0),
  partyType: z.enum(["customer", "supplier"]),
  /** Customers: alert if they owe money and no payment in this many days */
  maxDaysWithoutPayment: z
    .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
});

export const partyUpdateSchema = partyCreateSchema.partial();

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.union([idString, z.literal(""), z.null()]).optional(),
  color: z.string().max(200).optional().nullable(),
});

export const itemCreateSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: idString,
  price: z.coerce.number().nonnegative(),
  purchasePrice: z.coerce.number().nonnegative().optional().default(0),
  quantity: z.coerce.number(),
  lowStockThreshold: z.coerce.number().nonnegative().optional().default(5),
  unit: z.string().min(1).max(50),
});

export const itemUpdateSchema = itemCreateSchema.partial();

export const transactionCreateSchema = z
  .object({
    partyId: idString,
    entryType: z.enum(["credit", "debit"]),
    amount: z.coerce.number().positive(),
    paymentMode: z.enum(["cash", "upi", "credit"]),
    date: z.coerce.date(),
    notes: z.string().max(2000).optional().default(""),
  })
  .strict();

const billLineSchema = z.object({
  itemId: idString,
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative().optional(),
});

export const billCreateSchema = z
  .object({
    billKind: z.enum(["sale", "purchase"]),
    billDate: z.coerce.date(),
    // partyId is fully optional — walk-in customers don't need one
    partyId: z
      .union([idString, z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === null ? undefined : v)),
    displayName: z.string().min(1, "Display name is required").max(200),
    // min(1) removed — validated manually in the route and submit handler
    lines: z.array(billLineSchema).optional().default([]),
    paidAmount: z.coerce.number().nonnegative(),
    paymentMode: z.enum(["cash", "upi", "credit", "mixed", "bank"]),
    bankAccountId: z
      .union([idString, z.literal(""), z.null()])
      .optional()
      .transform((v) => (v === "" || v === null ? undefined : v)),
    notes: z.string().max(2000).optional().default(""),
    allowNegativeStock: z.boolean().optional().default(false),
  })
  .strict();

export const paymentCreateSchema = z.object({
  partyId: idString,
  amount: z.coerce.number().positive(),
  paymentMode: z.enum(["cash", "upi", "bank"]),
  bankAccountId: z
    .union([idString, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === null ? undefined : v)),
  date: z.coerce.date(),
  notes: z.string().max(2000).optional().default(""),
  direction: z.enum(["received", "paid"]),
});

export const bankAccountCreateSchema = z.object({
  accountName: z.string().min(1).max(200),
  bankName: z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(100),
  ifscCode: z.string().max(20).optional().default(""),
  upiId: z.string().max(100).optional().default(""),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().default(""),
});

export type PartyCreateInput = z.infer<typeof partyCreateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type BillCreateInput = z.infer<typeof billCreateSchema>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
