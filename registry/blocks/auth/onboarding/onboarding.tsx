/**
 * onboarding —— 带逻辑的首登引导向导（docs/blocks.md team/settings SaaS 模板）。
 *
 * 四步（Stepper 驱动，步骤间数据保留在向导 state）：欢迎 → 创建首个资源 → 邀请成员 →
 * 完成确认（summary）→ onComplete（宿主做完成跳转）。每步经 validate 前置校验；
 * 创建/邀请为异步动作（pending 透传 Stepper）。
 */
import { cn } from "cn";
import { PartyPopper, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { Stepper } from "@/components/blocks/form/stepper/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OnboardingResourceInput {
  name: string;
  env: string;
}

export interface OnboardingInvite {
  email: string;
  role: string;
}

export interface OnboardingPayload {
  teamName: string;
  firstResource: OnboardingResourceInput | null;
  invites: OnboardingInvite[];
}

export interface OnboardingProps {
  /** 创建首个资源（第 2 步提交；返回错误信息则停留在本步） */
  onCreateResource?(input: OnboardingResourceInput): Promise<string | undefined | undefined>;
  /** 发送邀请（第 3 步“下一步”时提交已填行；可留到完成时统一处理） */
  onInviteMembers?(invites: OnboardingInvite[]): Promise<string | undefined | undefined>;
  /** 完成（summary 确认后；宿主做跳转） */
  onComplete(payload: OnboardingPayload): void | Promise<void>;
  /** 资源环境选项（默认 dev/staging/prod） */
  envOptions?: { value: string; label: string }[];
  /** 角色选项（默认 admin/member/viewer） */
  roleOptions?: { value: string; label: string }[];
  /** 团队名（欢迎步预填） */
  defaultTeamName?: string;
  className?: string;
}

const DEFAULT_ENV_OPTIONS = [
  { value: "dev", label: "开发" },
  { value: "staging", label: "预发" },
  { value: "prod", label: "生产" },
];
const DEFAULT_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

export function Onboarding({
  onCreateResource,
  onInviteMembers,
  onComplete,
  envOptions = DEFAULT_ENV_OPTIONS,
  roleOptions = DEFAULT_ROLE_OPTIONS,
  defaultTeamName = "",
  className,
}: OnboardingProps) {
  // 步骤间数据保留（向导级 state；Stepper 只渲染当前步 content）
  const [teamName, setTeamName] = useState(defaultTeamName);
  const [resource, setResource] = useState<OnboardingResourceInput>({
    name: "",
    env: envOptions[0]?.value ?? "dev",
  });
  const [resourceCreated, setResourceCreated] = useState(false);
  const [invites, setInvites] = useState<OnboardingInvite[]>([
    { email: "", role: roleOptions[1]?.value ?? "member" },
  ]);

  const validEmail = (email: string): boolean => z.email().safeParse(email).success;

  async function createResource(): Promise<string | undefined> {
    if (onCreateResource === undefined) {
      setResourceCreated(true);
      return undefined;
    }
    const error = await onCreateResource(resource);
    if (error) return error;
    setResourceCreated(true);
    return undefined;
  }

  return (
    <div
      className={cn("bg-card mx-auto w-full max-w-2xl rounded-xl border p-6 sm:p-8", className)}
      data-slot="onboarding"
    >
      <div className="mb-6 flex items-center gap-2">
        <span className="bg-primary/10 text-primary ring-primary/15 flex size-8 items-center justify-center rounded-lg ring-1 ring-inset">
          <PartyPopper className="size-4" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">欢迎加入</h1>
          <p className="text-muted-foreground text-[13px]">
            三步完成初始化：命名 → 建资源 → 邀人。
          </p>
        </div>
      </div>

      <Stepper
        nextLabel="下一步"
        doneLabel="完成初始化"
        steps={[
          {
            title: "欢迎",
            description: "给你的团队起个名字（之后可随时在设置中修改）。",
            content: (
              <div className="grid gap-2">
                <Label htmlFor="onboarding-team">团队名称</Label>
                <Input
                  id="onboarding-team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="如：Acme Platform"
                />
              </div>
            ),
            validate: () => (teamName.trim().length < 2 ? ["团队名称至少 2 个字符"] : []),
          },
          {
            title: "创建首个资源",
            description: "一个服务 / 项目即可开始（之后可创建更多）。",
            content: (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="onboarding-resource">资源名称</Label>
                  <Input
                    id="onboarding-resource"
                    value={resource.name}
                    onChange={(e) => setResource({ ...resource, name: e.target.value })}
                    placeholder="如：gateway"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>环境</Label>
                  <Select
                    value={resource.env}
                    onValueChange={(v) => v !== null && setResource({ ...resource, env: v })}
                  >
                    <SelectTrigger className="w-40" aria-label="环境">
                      <SelectValue>
                        {envOptions.find((o) => o.value === resource.env)?.label ?? resource.env}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {envOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {resourceCreated ? (
                  <p className="text-status-success text-[13px]">
                    已创建 {resource.name}（{resource.env}）—— 可直接进入下一步。
                  </p>
                ) : null}
              </div>
            ),
            validate: async () => {
              if (resource.name.trim().length < 2) return ["资源名称至少 2 个字符"];
              if (!resourceCreated) {
                const error = await createResource();
                return error ? [error] : [];
              }
              return [];
            },
          },
          {
            title: "邀请成员",
            description: "输入队友邮箱（可跳过，稍后在 Team 页邀请）。",
            content: (
              <div className="flex flex-col gap-2">
                {invites.map((invite, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={invite.email}
                      placeholder="teammate@example.com"
                      aria-label={`邀请邮箱 ${i + 1}`}
                      onChange={(e) => {
                        const next = [...invites];
                        const row = next[i];
                        if (row) next[i] = { ...row, email: e.target.value };
                        setInvites(next);
                      }}
                    />
                    <Select
                      value={invite.role}
                      onValueChange={(v) => {
                        if (v === null) return;
                        const next = [...invites];
                        const row = next[i];
                        if (row) next[i] = { ...row, role: v };
                        setInvites(next);
                      }}
                    >
                      <SelectTrigger className="w-32" aria-label={`角色 ${i + 1}`}>
                        <SelectValue>
                          {roleOptions.find((o) => o.value === invite.role)?.label ?? invite.role}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="移除该邀请"
                      disabled={invites.length === 1}
                      onClick={() => setInvites(invites.filter((_, k) => k !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setInvites([...invites, { email: "", role: roleOptions[1]?.value ?? "member" }])
                  }
                >
                  <Plus data-icon="inline-start" />
                  再加一位
                </Button>
              </div>
            ),
            validate: async () => {
              const filled = invites.filter((invite) => invite.email.trim() !== "");
              const invalid = filled.filter((invite) => !validEmail(invite.email));
              if (invalid.length > 0) {
                return [`${invalid.length} 个邮箱格式无效`];
              }
              setInvites(filled);
              if (filled.length > 0 && onInviteMembers) {
                const error = await onInviteMembers(filled);
                if (error) return [error];
              }
              return [];
            },
          },
          {
            title: "完成",
            description: "确认初始化内容。",
            content: (
              <dl className="grid gap-2.5 rounded-lg border p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">团队</dt>
                  <dd className="font-medium">{teamName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">首个资源</dt>
                  <dd className="font-mono text-xs">
                    {resourceCreated || resource.name
                      ? `${resource.name} · ${resource.env}`
                      : "跳过"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">邀请</dt>
                  <dd>
                    {invites.length === 0
                      ? "跳过"
                      : invites.map((invite) => invite.email).join("、")}
                  </dd>
                </div>
              </dl>
            ),
          },
        ]}
        onComplete={async () => {
          await onComplete({
            teamName,
            firstResource: resourceCreated ? resource : null,
            invites,
          });
        }}
      />
    </div>
  );
}
