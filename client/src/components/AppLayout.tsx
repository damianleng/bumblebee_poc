import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";

export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex flex-col border-b bg-card">
            <div className="h-1 w-full bg-[#e62923]" />
            <div className="h-11 flex items-center px-4 gap-3">
              <SidebarTrigger />
              <div className="flex items-baseline gap-2 -translate-y-0.5">
                <span className="text-sm font-semibold text-foreground tracking-wide">
                  STRATA Intelligent Vendor Processing<sup className="text-[11px] font-medium text-muted-foreground ml-0.5">SIVP</sup>
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
