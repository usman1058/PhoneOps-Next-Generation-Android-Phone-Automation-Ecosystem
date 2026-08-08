import { NextRequest, NextResponse } from "next/server";

function isLocalHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  );
}

export function middleware(req: NextRequest) {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? req.nextUrl.protocol.replace(":", "");
  const allowInsecure = process.env.ALLOW_INSECURE_HTTP === "1";
  const hostname = req.nextUrl.hostname;
  const localHost = isLocalHost(hostname);

  if (
    process.env.NODE_ENV === "production" &&
    !allowInsecure &&
    !localHost &&
    proto !== "https"
  ) {
    const url = req.nextUrl.clone();
    url.protocol = "https";
    url.port = "443";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (process.env.NODE_ENV === "production" && !localHost && proto === "https") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};