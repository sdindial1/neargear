// Shown on admin pages when SUPABASE_SERVICE_ROLE_KEY is missing, so the page
// renders a clear setup message instead of crashing. Mirrors the message used
// on the main admin dashboard.
export function AdminServiceRoleNotice() {
  return (
    <main className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-8 text-center">
      <h1 className="font-heading text-2xl font-bold text-orange mb-2">
        Admin dashboard unavailable
      </h1>
      <p className="text-sm text-white/70 max-w-md">
        Add{" "}
        <code className="bg-white/10 px-2 py-0.5 rounded">
          SUPABASE_SERVICE_ROLE_KEY
        </code>{" "}
        to <code className="bg-white/10 px-2 py-0.5 rounded">.env.local</code>{" "}
        and restart the dev server. You can find the key in Supabase Dashboard →
        Project Settings → API.
      </p>
    </main>
  );
}
