-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "externalCode" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AccountGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AccountGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Voucher_partyLedgerId_fkey" FOREIGN KEY ("partyLedgerId") REFERENCES "LedgerAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Voucher_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Voucher_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoucherItemLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "purchasePrice" REAL NOT NULL DEFAULT 0,
    "lineTotal" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "VoucherItemLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherItemLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VoucherAccountLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "voucherId" TEXT NOT NULL,
    "ledgerId" TEXT,
    "ledgerName" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "groupNameSnapshot" TEXT NOT NULL DEFAULT '',
    "srNo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VoucherAccountLine_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherAccountLine_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "LedgerAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Party.ledgerAccountId / BankAccount.ledgerAccountId are added at runtime via
-- ensureSqliteSchema() (ADD COLUMN IF missing) so upgrades never fail or wipe data
-- when the column already exists on older installs.

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "AccountGroup_name_parentId_key" ON "AccountGroup"("name", "parentId");
CREATE INDEX IF NOT EXISTS "AccountGroup_parentId_idx" ON "AccountGroup"("parentId");
CREATE INDEX IF NOT EXISTS "AccountGroup_name_idx" ON "AccountGroup"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "LedgerAccount_name_accountKind_key" ON "LedgerAccount"("name", "accountKind");
CREATE INDEX IF NOT EXISTS "LedgerAccount_accountKind_idx" ON "LedgerAccount"("accountKind");
CREATE INDEX IF NOT EXISTS "LedgerAccount_groupId_idx" ON "LedgerAccount"("groupId");
CREATE INDEX IF NOT EXISTS "LedgerAccount_externalCode_idx" ON "LedgerAccount"("externalCode");
CREATE INDEX IF NOT EXISTS "LedgerAccount_name_idx" ON "LedgerAccount"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_billId_key" ON "Voucher"("billId");
CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_paymentId_key" ON "Voucher"("paymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_voucherNumber_voucherType_key" ON "Voucher"("voucherNumber", "voucherType");
CREATE INDEX IF NOT EXISTS "Voucher_voucherDate_idx" ON "Voucher"("voucherDate");
CREATE INDEX IF NOT EXISTS "Voucher_voucherType_voucherDate_idx" ON "Voucher"("voucherType", "voucherDate");
CREATE INDEX IF NOT EXISTS "Voucher_partyLedgerId_idx" ON "Voucher"("partyLedgerId");
CREATE INDEX IF NOT EXISTS "Voucher_externalId_idx" ON "Voucher"("externalId");

CREATE INDEX IF NOT EXISTS "VoucherItemLine_voucherId_idx" ON "VoucherItemLine"("voucherId");
CREATE INDEX IF NOT EXISTS "VoucherItemLine_itemId_idx" ON "VoucherItemLine"("itemId");

CREATE INDEX IF NOT EXISTS "VoucherAccountLine_voucherId_idx" ON "VoucherAccountLine"("voucherId");
CREATE INDEX IF NOT EXISTS "VoucherAccountLine_ledgerId_idx" ON "VoucherAccountLine"("ledgerId");
