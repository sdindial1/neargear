import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-navy text-white shadow-lg safe-top">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-1 text-xl font-bold font-heading">
            <span className="text-white">Near</span>
            <span className="text-orange">Gear</span>
          </Link>

          <Link href="/auth/login" className="text-sm text-white/70">
            Sign In
          </Link>
        </div>
      </div>
    </nav>
  );
}
