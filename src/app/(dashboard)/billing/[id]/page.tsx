"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BillDetailContent,
  type BillDetailData,
} from "@/components/billing/bill-detail-content";

async function fetchBill(id: string) {
  const res = await fetch(`/api/bills/${id}`);
  if (!res.ok) throw new Error("Failed to load bill");
  const json = (await res.json()) as { data: BillDetailData };
  return json.data;
}

export default function BillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const q = useQuery({
    queryKey: ["bill", id],
    queryFn: () => fetchBill(id),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (q.isError || !q.data) {
    return (
      <div className="space-y-2">
        <p className="text-destructive">Could not load this bill.</p>
        <Link
          href="/billing"
          className={cn(buttonVariants({ variant: "link" }), "p-0")}
        >
          Back to billing
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6">
      <BillDetailContent bill={q.data} onBack={() => router.back()} />
    </div>
  );
}
