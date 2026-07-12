import Database from "better-sqlite3";
import { resolveSqliteFilePath } from "@/lib/sqlite-path";

function columnExists(
  conn: InstanceType<typeof Database>,
  table: string,
  column: string,
): boolean {
  const rows = conn
    .prepare(`PRAGMA table_info("${table}")`)
    .all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function tableExists(conn: InstanceType<typeof Database>, table: string): boolean {
  const row = conn
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    )
    .get(table) as { ok: number } | undefined;
  return Boolean(row);
}

function addColumnIfMissing(
  conn: InstanceType<typeof Database>,
  table: string,
  column: string,
  ddl: string,
): void {
  if (!tableExists(conn, table)) return;
  if (!columnExists(conn, table, column)) {
    conn.exec(`ALTER TABLE "${table}" ADD COLUMN ${ddl}`);
  }
}

/**
 * Ensure full SQLite schema exists (core tables + COA).
 * Safe for fresh DBs after wipe and for older installs — CREATE IF NOT EXISTS only.
 */
export function ensureSqliteSchema(): void {
  const conn = new Database(resolveSqliteFilePath());
  try {
    conn.exec(`
      CREATE TABLE IF NOT EXISTS "Party" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "phone" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '',
        "openingBalance" REAL NOT NULL DEFAULT 0,
        "balance" REAL NOT NULL DEFAULT 0,
        "partyType" TEXT NOT NULL,
        "lastPaymentAt" DATETIME,
        "maxDaysWithoutPayment" INTEGER,
        "ledgerAccountId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Party_partyType_balance_idx"
        ON "Party"("partyType", "balance");
      CREATE INDEX IF NOT EXISTS "Party_name_idx" ON "Party"("name");

      CREATE TABLE IF NOT EXISTS "Category" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "parentId" TEXT,
        "ancestorIds" TEXT NOT NULL DEFAULT '[]',
        "color" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Category_parentId_idx" ON "Category"("parentId");
      CREATE INDEX IF NOT EXISTS "Category_name_idx" ON "Category"("name");

      CREATE TABLE IF NOT EXISTS "Item" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "categoryId" TEXT NOT NULL,
        "price" REAL NOT NULL,
        "purchasePrice" REAL NOT NULL DEFAULT 0,
        "quantity" REAL NOT NULL DEFAULT 0,
        "lowStockThreshold" REAL NOT NULL DEFAULT 5,
        "unit" TEXT NOT NULL DEFAULT 'pieces',
        "altUnit" TEXT NOT NULL DEFAULT '',
        "mrp" REAL NOT NULL DEFAULT 0,
        "hsnCode" TEXT NOT NULL DEFAULT '',
        "externalCode" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Item_categoryId_idx" ON "Item"("categoryId");
      CREATE INDEX IF NOT EXISTS "Item_name_idx" ON "Item"("name");
      CREATE INDEX IF NOT EXISTS "Item_externalCode_idx" ON "Item"("externalCode");

      CREATE TABLE IF NOT EXISTS "BankAccount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountName" TEXT NOT NULL,
        "bankName" TEXT NOT NULL,
        "accountNumber" TEXT NOT NULL,
        "ifscCode" TEXT NOT NULL DEFAULT '',
        "upiId" TEXT NOT NULL DEFAULT '',
        "isPrimary" BOOLEAN NOT NULL DEFAULT 0,
        "notes" TEXT NOT NULL DEFAULT '',
        "ledgerAccountId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "BankAccount_isPrimary_idx" ON "BankAccount"("isPrimary");

      CREATE TABLE IF NOT EXISTS "Bill" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "billKind" TEXT NOT NULL DEFAULT 'sale',
        "billDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "billNumber" TEXT NOT NULL,
        "partyId" TEXT,
        "displayName" TEXT NOT NULL,
        "total" REAL NOT NULL,
        "paidAmount" REAL NOT NULL,
        "creditAmount" REAL NOT NULL,
        "paymentMode" TEXT NOT NULL,
        "bankAccountId" TEXT,
        "hourOfDay" INTEGER NOT NULL,
        "notes" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Bill_billNumber_key" ON "Bill"("billNumber");
      CREATE INDEX IF NOT EXISTS "Bill_partyId_createdAt_idx"
        ON "Bill"("partyId", "createdAt");
      CREATE INDEX IF NOT EXISTS "Bill_createdAt_idx" ON "Bill"("createdAt");
      CREATE INDEX IF NOT EXISTS "Bill_billDate_idx" ON "Bill"("billDate");
      CREATE INDEX IF NOT EXISTS "Bill_billKind_billDate_idx"
        ON "Bill"("billKind", "billDate");

      CREATE TABLE IF NOT EXISTS "BillLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "billId" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "quantity" REAL NOT NULL,
        "unitPrice" REAL NOT NULL,
        "purchasePrice" REAL NOT NULL DEFAULT 0,
        "lineTotal" REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "BillLine_billId_idx" ON "BillLine"("billId");
      CREATE INDEX IF NOT EXISTS "BillLine_itemId_idx" ON "BillLine"("itemId");

      CREATE TABLE IF NOT EXISTS "BillSundryCharge" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "billId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "amount" REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "BillSundryCharge_billId_idx"
        ON "BillSundryCharge"("billId");

      CREATE TABLE IF NOT EXISTS "BillStockWarning" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "billId" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "itemName" TEXT NOT NULL,
        "requested" REAL NOT NULL,
        "available" REAL NOT NULL,
        "appliedNegative" BOOLEAN NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS "BillStockWarning_billId_idx"
        ON "BillStockWarning"("billId");
      CREATE INDEX IF NOT EXISTS "BillStockWarning_itemId_idx"
        ON "BillStockWarning"("itemId");

      CREATE TABLE IF NOT EXISTS "BillPaymentSplit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "billId" TEXT NOT NULL,
        "method" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "bankAccountId" TEXT
      );
      CREATE INDEX IF NOT EXISTS "BillPaymentSplit_billId_idx"
        ON "BillPaymentSplit"("billId");

      CREATE TABLE IF NOT EXISTS "Payment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "partyId" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "paymentMode" TEXT NOT NULL,
        "bankAccountId" TEXT,
        "date" DATETIME NOT NULL,
        "notes" TEXT NOT NULL DEFAULT '',
        "direction" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Payment_partyId_date_idx"
        ON "Payment"("partyId", "date");
      CREATE INDEX IF NOT EXISTS "Payment_date_idx" ON "Payment"("date");

      CREATE TABLE IF NOT EXISTS "LedgerTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "partyId" TEXT NOT NULL,
        "partyType" TEXT NOT NULL,
        "entryType" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "paymentMode" TEXT NOT NULL,
        "date" DATETIME NOT NULL,
        "notes" TEXT NOT NULL DEFAULT '',
        "refType" TEXT NOT NULL DEFAULT 'manual',
        "billId" TEXT,
        "paymentId" TEXT,
        "balanceAfterParty" REAL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "LedgerTransaction_partyId_date_idx"
        ON "LedgerTransaction"("partyId", "date");
      CREATE INDEX IF NOT EXISTS "LedgerTransaction_date_idx"
        ON "LedgerTransaction"("date");
      CREATE INDEX IF NOT EXISTS "LedgerTransaction_createdAt_idx"
        ON "LedgerTransaction"("createdAt");

      CREATE TABLE IF NOT EXISTS "Daybook" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" DATETIME NOT NULL,
        "morningCash" REAL NOT NULL DEFAULT 0,
        "notes" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Daybook_date_key" ON "Daybook"("date");
      CREATE INDEX IF NOT EXISTS "Daybook_date_idx" ON "Daybook"("date");

      CREATE TABLE IF NOT EXISTS "DaybookExpense" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "date" DATETIME NOT NULL,
        "reason" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "DaybookExpense_date_idx" ON "DaybookExpense"("date");

      CREATE TABLE IF NOT EXISTS "SundryType" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "SundryType_name_key" ON "SundryType"("name");
      CREATE INDEX IF NOT EXISTS "SundryType_name_idx" ON "SundryType"("name");

      CREATE TABLE IF NOT EXISTS "BusinessProfile" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL DEFAULT 'singleton',
        "name" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "BusinessProfile_key_key"
        ON "BusinessProfile"("key");

      CREATE TABLE IF NOT EXISTS "AppSetting" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");
      CREATE INDEX IF NOT EXISTS "AppSetting_key_idx" ON "AppSetting"("key");

      CREATE TABLE IF NOT EXISTS "Counter" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "seq" INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS "AccountGroup" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "parentId" TEXT,
        "externalCode" TEXT,
        "isPrimary" BOOLEAN NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "AccountGroup_name_parentId_key"
        ON "AccountGroup"("name", "parentId");
      CREATE INDEX IF NOT EXISTS "AccountGroup_parentId_idx" ON "AccountGroup"("parentId");
      CREATE INDEX IF NOT EXISTS "AccountGroup_name_idx" ON "AccountGroup"("name");

      CREATE TABLE IF NOT EXISTS "LedgerAccount" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "printName" TEXT NOT NULL DEFAULT '',
        "groupId" TEXT,
        "accountKind" TEXT NOT NULL,
        "openingBalance" REAL NOT NULL DEFAULT 0,
        "balance" REAL NOT NULL DEFAULT 0,
        "phone" TEXT NOT NULL DEFAULT '',
        "mobile" TEXT NOT NULL DEFAULT '',
        "email" TEXT NOT NULL DEFAULT '',
        "address1" TEXT NOT NULL DEFAULT '',
        "address2" TEXT NOT NULL DEFAULT '',
        "address3" TEXT NOT NULL DEFAULT '',
        "gstin" TEXT NOT NULL DEFAULT '',
        "pan" TEXT NOT NULL DEFAULT '',
        "state" TEXT NOT NULL DEFAULT '',
        "city" TEXT NOT NULL DEFAULT '',
        "creditDays" INTEGER,
        "externalCode" TEXT,
        "sourceSystem" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAccount_name_accountKind_key"
        ON "LedgerAccount"("name", "accountKind");
      CREATE INDEX IF NOT EXISTS "LedgerAccount_accountKind_idx"
        ON "LedgerAccount"("accountKind");
      CREATE INDEX IF NOT EXISTS "LedgerAccount_groupId_idx" ON "LedgerAccount"("groupId");
      CREATE INDEX IF NOT EXISTS "LedgerAccount_externalCode_idx"
        ON "LedgerAccount"("externalCode");
      CREATE INDEX IF NOT EXISTS "LedgerAccount_name_idx" ON "LedgerAccount"("name");

      CREATE TABLE IF NOT EXISTS "Voucher" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "voucherType" TEXT NOT NULL,
        "voucherNumber" TEXT NOT NULL,
        "voucherDate" DATETIME NOT NULL,
        "seriesName" TEXT NOT NULL DEFAULT '',
        "externalId" TEXT,
        "partyLedgerId" TEXT,
        "displayName" TEXT NOT NULL DEFAULT '',
        "narration" TEXT NOT NULL DEFAULT '',
        "total" REAL NOT NULL DEFAULT 0,
        "paidAmount" REAL NOT NULL DEFAULT 0,
        "paymentMode" TEXT NOT NULL DEFAULT 'cash',
        "billId" TEXT,
        "paymentId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_billId_key" ON "Voucher"("billId");
      CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_paymentId_key" ON "Voucher"("paymentId");
      CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_voucherNumber_voucherType_key"
        ON "Voucher"("voucherNumber", "voucherType");
      CREATE INDEX IF NOT EXISTS "Voucher_voucherDate_idx" ON "Voucher"("voucherDate");
      CREATE INDEX IF NOT EXISTS "Voucher_voucherType_voucherDate_idx"
        ON "Voucher"("voucherType", "voucherDate");
      CREATE INDEX IF NOT EXISTS "Voucher_partyLedgerId_idx" ON "Voucher"("partyLedgerId");
      CREATE INDEX IF NOT EXISTS "Voucher_externalId_idx" ON "Voucher"("externalId");

      CREATE TABLE IF NOT EXISTS "VoucherItemLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "voucherId" TEXT NOT NULL,
        "itemId" TEXT,
        "name" TEXT NOT NULL,
        "quantity" REAL NOT NULL,
        "unitPrice" REAL NOT NULL,
        "purchasePrice" REAL NOT NULL DEFAULT 0,
        "lineTotal" REAL NOT NULL,
        "unit" TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS "VoucherItemLine_voucherId_idx"
        ON "VoucherItemLine"("voucherId");
      CREATE INDEX IF NOT EXISTS "VoucherItemLine_itemId_idx"
        ON "VoucherItemLine"("itemId");

      CREATE TABLE IF NOT EXISTS "VoucherAccountLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "voucherId" TEXT NOT NULL,
        "ledgerId" TEXT,
        "ledgerName" TEXT NOT NULL,
        "entryType" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "groupNameSnapshot" TEXT NOT NULL DEFAULT '',
        "srNo" INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS "VoucherAccountLine_voucherId_idx"
        ON "VoucherAccountLine"("voucherId");
      CREATE INDEX IF NOT EXISTS "VoucherAccountLine_ledgerId_idx"
        ON "VoucherAccountLine"("ledgerId");

      CREATE TABLE IF NOT EXISTS "Employee" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "phone" TEXT NOT NULL DEFAULT '',
        "role" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '',
        "joinDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "monthlySalary" REAL NOT NULL DEFAULT 0,
        "payDay" INTEGER NOT NULL DEFAULT 1,
        "isActive" BOOLEAN NOT NULL DEFAULT 1,
        "notes" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Employee_name_idx" ON "Employee"("name");
      CREATE INDEX IF NOT EXISTS "Employee_isActive_idx" ON "Employee"("isActive");

      CREATE TABLE IF NOT EXISTS "EmployeeAttendance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "employeeId" TEXT NOT NULL,
        "date" DATETIME NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'present',
        "notes" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeAttendance_employeeId_date_key"
        ON "EmployeeAttendance"("employeeId", "date");
      CREATE INDEX IF NOT EXISTS "EmployeeAttendance_date_idx"
        ON "EmployeeAttendance"("date");
      CREATE INDEX IF NOT EXISTS "EmployeeAttendance_employeeId_date_idx"
        ON "EmployeeAttendance"("employeeId", "date");

      CREATE TABLE IF NOT EXISTS "EmployeePayroll" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "employeeId" TEXT NOT NULL,
        "periodStart" DATETIME NOT NULL,
        "periodEnd" DATETIME NOT NULL,
        "grossSalary" REAL NOT NULL,
        "advancesDeducted" REAL NOT NULL DEFAULT 0,
        "netPaid" REAL NOT NULL,
        "paidAt" DATETIME NOT NULL,
        "paymentMode" TEXT NOT NULL DEFAULT 'cash',
        "notes" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "EmployeePayroll_employeeId_paidAt_idx"
        ON "EmployeePayroll"("employeeId", "paidAt");
      CREATE INDEX IF NOT EXISTS "EmployeePayroll_paidAt_idx"
        ON "EmployeePayroll"("paidAt");

      CREATE TABLE IF NOT EXISTS "EmployeeAdvance" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "employeeId" TEXT NOT NULL,
        "amount" REAL NOT NULL,
        "date" DATETIME NOT NULL,
        "notes" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'open',
        "deductedInPayrollId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "EmployeeAdvance_employeeId_status_idx"
        ON "EmployeeAdvance"("employeeId", "status");
      CREATE INDEX IF NOT EXISTS "EmployeeAdvance_date_idx"
        ON "EmployeeAdvance"("date");
    `);

    // Older installs may already have core tables without newer columns.
    // Add columns BEFORE indexes that reference them so upgrades never wipe data.
    addColumnIfMissing(conn, "Party", "ledgerAccountId", '"ledgerAccountId" TEXT');
    addColumnIfMissing(
      conn,
      "BankAccount",
      "ledgerAccountId",
      '"ledgerAccountId" TEXT',
    );
    addColumnIfMissing(conn, "Item", "altUnit", "\"altUnit\" TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(conn, "Item", "mrp", '"mrp" REAL NOT NULL DEFAULT 0');
    addColumnIfMissing(conn, "Item", "hsnCode", "\"hsnCode\" TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing(conn, "Item", "externalCode", '"externalCode" TEXT');

    if (tableExists(conn, "Party") && columnExists(conn, "Party", "ledgerAccountId")) {
      conn.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Party_ledgerAccountId_key"
         ON "Party"("ledgerAccountId")`,
      );
    }
    if (
      tableExists(conn, "BankAccount") &&
      columnExists(conn, "BankAccount", "ledgerAccountId")
    ) {
      conn.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS "BankAccount_ledgerAccountId_key"
         ON "BankAccount"("ledgerAccountId")`,
      );
    }
  } finally {
    conn.close();
  }
}
