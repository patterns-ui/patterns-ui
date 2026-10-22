import { useAuth } from "@fleetly/ui-component-core/auth";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { HandMetal } from "lucide-react";
import { toast } from "sonner";
import { TeamPage } from "@/components/blocks/team/team-page/team-page";
import { Button } from "@/components/ui/button";
import { teamClient } from "@/resources-m4";

/** team 页：邀请 → 待处理 → 接受 → 改角色 → 移除（confirm） */
function TeamPageHost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return (
    <div className="flex flex-col gap-4">
      <TeamPage client={teamClient} currentUserId={user?.id} />
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
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/team")({
  staticData: { title: "Team" },
  component: TeamPageHost,
});
