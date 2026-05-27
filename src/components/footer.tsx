import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-[#071520] border-t border-white/10 py-8">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-400">
            © {new Date().getFullYear()} NearGear LLC · Dallas-Fort Worth, TX
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link
              href="/privacy"
              className="text-gray-400 hover:text-orange transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-gray-400 hover:text-orange transition-colors"
            >
              Terms of Service
            </Link>
            <a
              href="mailto:support@near-gear.com"
              className="text-gray-400 hover:text-orange transition-colors"
            >
              Support
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
