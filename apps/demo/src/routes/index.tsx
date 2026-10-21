import { createFileRoute } from "@tanstack/react-router";
import { StatusBadge } from "@/components/blocks/shared/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function HomePage() {
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-24">
        <div className="flex flex-col gap-2">
          <StatusBadge tone="success" pulse>
            m0 ready
          </StatusBadge>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            @fleetly/ui-components
          </h1>
          <p className="text-[13px] text-muted-foreground">
            M0 骨架：pnpm monorepo · core 包 · registry 构建管线 · demo alias 消费链。
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>status-badge</CardTitle>
            <CardDescription>
              样例 block，经 <code>@/components/blocks/*</code> alias 直接消费 registry 源码。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success" pulse>
              running
            </StatusBadge>
            <StatusBadge tone="warning">degraded</StatusBadge>
            <StatusBadge tone="danger">failed</StatusBadge>
            <StatusBadge tone="info">deploying</StatusBadge>
            <StatusBadge tone="neutral">stopped</StatusBadge>
          </CardContent>
        </Card>

        <div>
          <Button>Get started</Button>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
