/**
 * team 路由（M7-A3 批2 薄胶水）：结构在 pages/team.page.ts（definePage，team 模式预设宿主）；
 * client 接线与「接受第一个待处理邀请」演示区（appendix）在此注入。
 */
import { useAuth } from "@patterns-ui/core/auth";
import { PageRenderer } from "@patterns-ui/core/page";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HandMetal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resourceListTable } from "@/pages/tables";
import { teamPageConfig } from "@/pages/team.page";
import { teamClient } from "@/resources-m4";

function TeamPageHost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return (
    <PageRenderer
      page={teamPageConfig}
      table={resourceListTable}
      data={{
        host: {
          client: teamClient,
          currentUserId: user?.id,
          appendix: (
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
              <span>此环境未接入邮件服务，邀请不会真实发送；可用下方按钮代替被邀请人接受。</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await teamClient.acceptFirstPending();
                    await queryClient.invalidateQueries({ queryKey: ["team"] });
                    toast.success("邀请已接受：新成员加入成员表");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "接受失败");
                  }
                }}
              >
                <HandMetal data-icon="inline-start" />
                接受第一个待处理邀请
              </Button>
            </div>
          ),
        },
      }}
    />
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/team")({
  staticData: { title: "Team" },
  component: TeamPageHost,
});
