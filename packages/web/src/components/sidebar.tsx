"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "H" },
  { href: "/sessions", label: "Sessions", icon: "S" },
  { href: "/providers", label: "Providers", icon: "P" },
  { href: "/repos", label: "Repositories", icon: "R" },
  { href: "/settings", label: "Settings", icon: "G" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen">
      <div className="p-6">
        <h1 className="text-xl font-semibold">SpecFlow</h1>
        <p className="text-xs text-gray-400 mt-1">Admin Dashboard</p>
      </div>
      <nav className="flex-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium mb-1 transition-colors ${
                isActive ? "bg-primary text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}>
              <span className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 text-xs font-semibold">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
