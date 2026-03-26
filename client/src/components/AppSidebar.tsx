import { LayoutDashboard, ClipboardList, Mail } from "lucide-react";
import logoIcon from "@/assets/logo-icon.png";
import logoWhite from "@/assets/logo-white.png";
import strataLogo from "@/assets/strata-logo.png";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Submit Email", url: "/submit", icon: Mail },
  { title: "Audit Log", url: "/audit", icon: ClipboardList },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className={cn("px-4 py-4 border-b border-sidebar-border", collapsed && "px-2 py-3 flex justify-center")}>
          {collapsed ? (
            <img src={logoIcon} alt="Bumble Bee" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex flex-col gap-1">
              <img src={logoWhite} alt="Bumble Bee Seafoods" className="h-8 w-auto object-contain" />
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-[11px] uppercase tracking-wider">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent"
                      activeClassName="bg-[#e62923] text-white font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className={cn("px-2 py-4 border-t border-sidebar-border", collapsed && "flex justify-center px-2")}>
          {collapsed ? (
            <img src={strataLogo} alt="STRATA" className="h-8 w-8 object-contain opacity-80" />
          ) : (
            <img src={strataLogo} alt="STRATA" className="w-[115%] max-w-none object-contain object-left -ml-4" />
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
