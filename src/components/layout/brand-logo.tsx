import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  showName?: boolean;
  size?: number;
};

export function BrandLogo({
  className,
  showName = true,
  size = 28,
}: BrandLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Image
        src="/icon.png"
        alt="CashFlow"
        width={size}
        height={size}
        className="shrink-0 rounded-md"
        priority
      />
      {showName ? (
        <span className="truncate text-sm font-semibold tracking-tight">
          CashFlow
        </span>
      ) : null}
    </div>
  );
}
