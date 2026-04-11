import { ReactNode, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LogOut, LayoutDashboard, ClipboardList, Users, CheckSquare,
  Settings, UserCheck, GitBranch, ShieldCheck, Moon, Sun, Menu, X, Star
} from "lucide-react";
import { clsx } from "clsx";

interface NavItem {
  href: string;
  icon: ReactNode;
  label: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: "/dashboard",      icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard",       roles: ["User", "Team Lead", "Manager"] },
  { href: "/submit-rating",  icon: <Star className="w-5 h-5" />,            label: "Submit Rating",   roles: ["User", "Team Lead", "Manager"] },
  { href: "/my-team",        icon: <Users className="w-5 h-5" />,           label: "My Team",         roles: ["Team Lead", "Manager"] },
  { href: "/approve-ratings",icon: <CheckSquare className="w-5 h-5" />,     label: "Approve Ratings", roles: ["Team Lead", "Manager"] },
  { href: "/manage-kpis",    icon: <ClipboardList className="w-5 h-5" />,    label: "Manage KPIs",     roles: ["Team Lead", "Manager"] },
  { href: "/manage-leads",   icon: <UserCheck className="w-5 h-5" />,       label: "Manage Leads",    roles: ["Manager"] },
  { href: "/manage-team",    icon: <Settings className="w-5 h-5" />,        label: "Manage Team",     roles: ["Team Lead", "Manager"] },
  { href: "/rate-tls",       icon: <UserCheck className="w-5 h-5" />,       label: "Rate Team Leads", roles: ["Manager"] },
  { href: "/reassign-leads", icon: <GitBranch className="w-5 h-5" />,       label: "Reassign Leads",  roles: ["Manager"] },
  { href: "/final-approvals",icon: <ShieldCheck className="w-5 h-5" />,     label: "Final Approvals", roles: ["Manager"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(
    (localStorage.getItem("theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const visibleNav = navItems.filter(n => user?.role && n.roles.includes(user.role));

  return (
    <div className="min-h-screen bg-background flex">

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "fixed top-0 left-0 h-full w-64 bg-card border-r border-border/50 flex flex-col z-40 shadow-lg",
        "transition-transform duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "md:relative md:translate-x-0 md:shadow-none md:flex"
      )}>
        {/* Logo */}
        <div className="p-5 flex items-center justify-between border-b border-border/30">
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-lg p-1 shadow-sm">
              <img
                src="https://www.highspring.com/wp-content/uploads/sites/2/2025/01/HS-black-logo.svg"
                alt="HighSpring"
                className="h-7 w-auto"
              />
            </div>
            <span className="font-bold text-base text-foreground">Performance</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}>
              <span className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}>
                {item.icon}
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-4 border-t border-border/30 bg-secondary/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {user?.displayName.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user?.displayName}</p>
                <p className="text-xs text-muted-foreground">{user?.role} · {user?.level}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="shrink-0 rounded-full">
              {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
            onClick={logout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (mobile) */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border/30 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <div className="bg-white rounded px-1 py-0.5">
            <img
              src="https://www.highspring.com/wp-content/uploads/sites/2/2025/01/HS-black-logo.svg"
              alt="HighSpring"
              className="h-5 w-auto"
            />
          </div>
          <span className="font-semibold text-sm">Performance</span>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
