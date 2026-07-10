import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";

export function ImportGuide() {
  return (
    <>
      <Alert>
        <Info className="size-4" />
        <AlertTitle>What gets imported?</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            Imports <strong>customers, suppliers, stock items</strong>, plus
            optional <strong>sales/purchase invoices</strong> and{" "}
            <strong>payment/receipt vouchers</strong>.
          </p>
          <p>
            Imported invoices appear under{" "}
            <strong>Invoices → Invoice History</strong>. Payment vouchers appear
            under <strong>Payments</strong>.
          </p>
          <p>
            Data is stored in local SQLite (<code className="text-xs">dev.db</code>
            ).
          </p>
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-4 text-sm">
        <div>
          <p className="font-medium">From TallyPrime / Tally ERP</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Open your company in Tally.</li>
            <li>
              Go to <strong>Gateway of Tally → Import / Export Data → Export</strong>
              .
            </li>
            <li>
              Export <strong>Masters</strong> (customers, suppliers, items) as{" "}
              <strong>XML</strong>.
            </li>
            <li>
              Export <strong>Transactions / Vouchers</strong> (Sales, Purchase,
              Receipt, Payment) as <strong>XML</strong> for the date range you
              need — or export masters + vouchers in one file if Tally allows.
            </li>
            <li>
              Upload the <code className="text-xs">.xml</code> file below.
            </li>
          </ol>
          <p className="mt-2 text-muted-foreground">
            You do <strong>not</strong> need Tally&apos;s <code>.900</code> company
            database file. Export XML from inside Tally instead.
          </p>
        </div>

        <div>
          <p className="font-medium">From BUSY Accounting</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              In BUSY, go to <strong>Administration → Data Export / Import</strong>
              .
            </li>
            <li>
              Pick <strong>Data Export / Import (XML)</strong> →{" "}
              <strong>Export Data</strong>.
            </li>
            <li>
              Export <strong>Masters</strong> for customers/items, and export{" "}
              <strong>Transactions</strong> separately for invoices (Sale,
              Purchase, Receipt, Payment).
            </li>
            <li>
              Select <strong>multiple .dat files at once</strong> (e.g. masters +
              transactions) — CashFlow merges them in one import.
            </li>
            <li>
              Upload the exported file below. For <code className="text-xs">.dat</code>{" "}
              files, set <strong>Source software</strong> to <strong>BUSY</strong>.
            </li>
          </ol>
          <p className="mt-2 text-muted-foreground">
            Alternative: voucher CSV with columns like{" "}
            <em>Date, VoucherType, Party, Item, Qty, Rate, Amount</em>.
          </p>
          <p className="mt-2 text-muted-foreground">
            BUSY&apos;s raw <code className="text-xs">.mdb</code> / SQL database is{" "}
            <strong>not</strong> read directly — export from BUSY first.
          </p>
        </div>
      </div>
    </>
  );
}
