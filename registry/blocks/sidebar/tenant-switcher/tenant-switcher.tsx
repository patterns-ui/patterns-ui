import { useTenant } from "@fleetly/patterns-ui-core/tenant";
import { cn } from "cn";
import { Check, ChevronsUpDown } from "lucide-react";
import { UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";

/**
 * 租户切换器（sidebar header 位）：下拉列出可用租户、显示当前租户；
 * URL 租户已失效（不在列表）时显示回落提示并引导切换到第一个可用租户。
 */
export function TenantSwitcher() {
  const { tenant, tenantId, tenants, isLoading, setTenant } = useTenant();

  const stale = !isLoading && tenantId != null && !tenants.some((t) => t.id === tenantId);
  const current = tenant ?? (tenantId ? { id: tenantId, name: tenantId } : undefined);
  const fallback = tenants[0];

  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          {isLoading && !current ? (
            <SidebarMenuSkeleton showIcon />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className={cn("data-open:bg-sidebar-accent", stale && "text-status-warning")}
                  />
                }
              >
                {current ? (
                  <>
                    <UserAvatar user={current} />
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-medium">{current.name}</span>
                      <span className="text-xs text-sidebar-foreground/70 truncate">
                        {current.plan ?? "org"}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
                  </>
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>租户</DropdownMenuLabel>
                  {stale ? (
                    <div className="px-2 py-1.5 text-xs text-status-warning">
                      当前租户 {tenantId} 已不可用，请切换：
                    </div>
                  ) : null}
                  {tenants.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => setTenant(t.id)} className="gap-2">
                      <UserAvatar user={t} size="sm" />
                      <span className="flex-1 truncate">{t.name}</span>
                      {t.id === tenantId ? <Check className="size-4" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {stale && fallback ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setTenant(fallback.id)}>
                      回落到 {fallback.name}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
