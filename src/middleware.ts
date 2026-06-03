import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

// AUTH PROTECTION TEMPORARILY DISABLED — all routes are public while we
// build out core features. RLS (migration 004) is the actual security
// boundary and is active, so this gate is a UX/ban-wall nicety, not the
// thing keeping data safe.
//
// TODO post-launch: Re-enable auth + ban-wall middleware. The commented
// code below is STALE — do not just uncomment it. Requires:
// 1. Update strike column names (strike_count, suspension_ends_at,
//    suspended_permanently) — strike_status/blackout_until no longer exist.
// 2. Rebuild PUBLIC_ROUTES for current route map (/, /marketplace, /privacy,
//    /terms, /founding, /listings, etc.).
// 3. Skip /api routes (return JSON 401, not HTML redirect).
// 4. Test all auth flows + redirects before re-enabling.
//
// const PUBLIC_ROUTES = ["/", "/auth", "/browse", "/listings"];
//
// function isPublicRoute(pathname: string): boolean {
//   if (pathname === "/") return true;
//   if (pathname.startsWith("/auth")) return true;
//   if (pathname === "/browse") return true;
//   if (pathname.startsWith("/listings/")) return true;
//   return false;
// }

export async function middleware(request: NextRequest) {
  // Keep the Supabase session cookie fresh so logged-in users stay logged in,
  // but do NOT redirect anyone based on auth state.
  const { supabaseResponse } = await updateSession(request);
  return supabaseResponse;

  // --- Disabled auth gating (re-enable later) -----------------------------
  // const { pathname } = request.nextUrl;
  //
  // if (isPublicRoute(pathname)) {
  //   const result = await updateSession(request);
  //   return result.supabaseResponse;
  // }
  //
  // const { user, supabaseResponse, supabase } = await updateSession(request);
  //
  // if (!user) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/auth/login";
  //   return NextResponse.redirect(url);
  // }
  //
  // // Check blackout / banned status
  // const { data: profile } = await supabase
  //   .from("users")
  //   .select("strike_status, blackout_until")
  //   .eq("id", user.id)
  //   .single();
  //
  // if (profile?.strike_status === "banned") {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/banned";
  //   if (pathname !== "/banned") {
  //     return NextResponse.redirect(url);
  //   }
  // }
  //
  // if (
  //   profile?.blackout_until &&
  //   new Date(profile.blackout_until) > new Date()
  // ) {
  //   const url = request.nextUrl.clone();
  //   url.pathname = "/banned";
  //   if (pathname !== "/banned") {
  //     return NextResponse.redirect(url);
  //   }
  // }
  //
  // return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
