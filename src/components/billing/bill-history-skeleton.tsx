import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BillHistorySkeletonProps = {
  showProfit?: boolean;
};

export function BillHistorySkeleton({ showProfit = true }: BillHistorySkeletonProps) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Name</TableHead>
            <TableHead className="w-30">Date</TableHead>
            <TableHead className="w-22.5">Mode</TableHead>
            <TableHead className="text-right w-25">Total</TableHead>
            <TableHead className="text-right w-25">Paid</TableHead>
            <TableHead className="text-right w-25">Credit</TableHead>
            {showProfit ? (
              <TableHead className="text-right w-25">P/L</TableHead>
            ) : null}
            <TableHead className="w-45">Notes</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-16" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-14" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="ml-auto h-4 w-14" />
              </TableCell>
              {showProfit ? (
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-14" />
                </TableCell>
              ) : null}
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-7 w-7 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
