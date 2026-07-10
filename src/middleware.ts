import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isLocalAccess } from "@/lib/request-security";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!isLocalAccess(request)) {
    return NextResponse.json(
      { error: "API access is restricted to this machine (localhost)." },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
