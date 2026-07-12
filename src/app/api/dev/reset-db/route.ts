import { unlinkSync, existsSync } from "fs";
import { connectDb, getPrisma, resetPrismaClient } from "@/lib/db";
import { ensureSqliteSchema } from "@/lib/ensure-sqlite-schema";
import { jsonError, jsonOk } from "@/lib/http";
import { resolveSqliteFilePath } from "@/lib/sqlite-path";

export const runtime = "nodejs";

const TABLE_DELETE_ORDER = [
  "VoucherAccountLine",
  "VoucherItemLine",
  "Voucher",
  "LedgerTransaction",
  "BillPaymentSplit",
  "BillStockWarning",
  "BillSundryCharge",
  "BillLine",
  "Bill",
  "Payment",
  "DaybookExpense",
  "Daybook",
  "Item",
  "Party",
  "BankAccount",
  "LedgerAccount",
  "AccountGroup",
  "Category",
  "SundryType",
  "BusinessProfile",
  "AppSetting",
  "Counter",
  "EmployeeAdvance",
  "EmployeeAttendance",
  "EmployeePayroll",
  "Employee",
] as const;

async function safeCount(
  label: string,
  run: () => Promise<number>,
): Promise<number> {
  try {
    return await run();
  } catch (e) {
    throw new Error(
      `Schema check failed for ${label}: ${e instanceof Error ? e.message : e}`,
    );
  }
}

/**
 * Development-only: wipe the local SQLite database and recreate empty schema.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return jsonError("Not available in production", 403);
  }

  try {
    await resetPrismaClient();
    ensureSqliteSchema();

    // Prefer clearing rows while the file may still be locked.
    await connectDb();
    const prisma = getPrisma();
    for (const table of TABLE_DELETE_ORDER) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
      } catch {
        // ignore
      }
    }

    await resetPrismaClient();

    const sqlitePath = resolveSqliteFilePath();
    try {
      if (existsSync(sqlitePath)) unlinkSync(sqlitePath);
      for (const suffix of ["-wal", "-shm", "-journal"]) {
        const side = `${sqlitePath}${suffix}`;
        if (existsSync(side)) unlinkSync(side);
      }
    } catch {
      // locked — rows already cleared
    }

    ensureSqliteSchema();
    await resetPrismaClient();
    await connectDb();

    const client = getPrisma();
    await safeCount("Bill", () => client.bill.count());
    await safeCount("Party", () => client.party.count());
    await safeCount("AccountGroup", () => client.accountGroup.count());
    await safeCount("Voucher", () => client.voucher.count());

    return jsonOk({
      ok: true,
      path: sqlitePath,
      message: "All SQLite data deleted. Empty database recreated.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to reset database";
    return jsonError(msg, 500);
  }
}
