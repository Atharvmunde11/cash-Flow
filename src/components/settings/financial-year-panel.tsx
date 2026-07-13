import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export function FinancialYearPanel() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["financial-year"],
    queryFn: async () => {
      const res = await fetch("/api/financial-year");
      if (!res.ok) throw new Error("Failed to fetch FY info");
      const json = await res.json();
      return json.data;
    },
  });

  const closeFy = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/financial-year", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to close FY");
      return body;
    },
    onSuccess: (data) => {
      toast.success(
        `Financial year ${data.closedFyLabel} closed successfully! Next FY is ${data.nextFyLabel}.`,
      );
      qc.invalidateQueries({ queryKey: ["financial-year"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isPending)
    return (
      <div className="p-4 border rounded-xl animate-pulse bg-muted h-32" />
    );
  if (q.isError || !q.data)
    return (
      <div className="p-4 border rounded-xl border-destructive text-destructive">
        Failed to load Financial Year config.
      </div>
    );

  const { activeFy } = q.data;

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-medium">Financial Year</h2>
        <p className="text-sm text-muted-foreground">
          Manage the current active financial year and close it when the year
          ends.
        </p>
      </div>

      <div className="flex flex-col gap-1 p-4 bg-muted/50 rounded-lg">
        <div className="text-sm font-semibold">Active Financial Year</div>
        <div className="text-2xl tracking-tight">{activeFy.label}</div>
        <div className="text-xs text-muted-foreground">
          {format(new Date(activeFy.start), "dd MMM yyyy")} –{" "}
          {format(new Date(activeFy.end), "dd MMM yyyy")}
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={() => {
            if (
              window.confirm(
                "Are you sure you want to close this financial year early? This action cannot be undone. All current data will be locked from editing, and opening balances will be created for the new year.",
              )
            ) {
              closeFy.mutate();
            }
          }}
          disabled={closeFy.isPending}
        >
          {closeFy.isPending ? "Closing…" : "Close financial year now"}
        </Button>
        <a
          href={`/api/financial-year/export?fy=${activeFy.label}`}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Export Data
        </a>
      </div>
    </div>
  );
}
