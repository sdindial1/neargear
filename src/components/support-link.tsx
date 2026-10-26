"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** /support with the current page attached, so the email says where they were. */
export function supportHref(pathname: string | null): string {
  if (!pathname || pathname === "/support") return "/support";
  return `/support?from=${encodeURIComponent(pathname)}`;
}

export function SupportLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={supportHref(pathname)} className={className}>
      {children}
    </Link>
  );
}
