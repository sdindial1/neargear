import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest } from "next/server";

// AUTH PROTECTION TEMPORARILY DISABLED — all routes are public while we
// build out core features. Re-enable the gating logic below before launch.
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
