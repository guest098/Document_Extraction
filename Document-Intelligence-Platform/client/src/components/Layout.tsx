import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Files, 
  ShieldAlert, 
  GitCompare, 
  LogOut,
  ChevronRight,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAVIGATION = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Documents", href: "/documents", icon: Files },
  { name: "Risk Analysis", href: "/risk", icon: ShieldAlert },
  { name: "Compare", href: "/compare", icon: GitCompare },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const NavContent = () => (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      <div className="h-16 flex items-center px-6 border-b border-slate-200/50 bg-white">
        <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center mr-3 shadow-md shadow-primary/25">
          <ShieldAlert className="h-5 w-5 text-white" />
        </div>
        <span className="font-display font-bold text-xl tracking-tight">DocGuard</span>
      </div>

      <div className="flex-1 py-6 px-3 space-y-1">
        {NAVIGATION.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={cn(
                  "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer",
                  isActive
                    ? "bg-white text-primary shadow-sm ring-1 ring-slate-200"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon
                  className={cn(
                    "mr-3 h-5 w-5 transition-colors",
                    isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                {item.name}
                {isActive && (
                  <ChevronRight className="ml-auto h-4 w-4 text-primary opacity-50" />
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
            {user?.name?.[0] || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{user?.name}</p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-600 hover:text-red-600 hover:bg-red-50"
          onClick={() => logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 fixed inset-y-0 z-30">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b h-16 flex items-center px-4 justify-between">
         <div className="flex items-center gap-2">
           <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center shadow-sm">
              <ShieldAlert className="h-5 w-5 text-white" />
           </div>
           <span className="font-display font-bold text-lg">DocGuard</span>
         </div>
         <Sheet>
           <SheetTrigger asChild>
             <Button variant="ghost" size="icon">
               <Menu className="h-6 w-6" />
             </Button>
           </SheetTrigger>
           <SheetContent side="left" className="p-0 w-64">
             <NavContent />
           </SheetContent>
         </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 pt-16 lg:pt-0">
        <div className="max-w-7xl mx-auto p-4 md:p-8 lg:p-10 space-y-8 animate-in fade-in duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
