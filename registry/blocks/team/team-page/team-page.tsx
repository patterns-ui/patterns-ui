/**
 * team-page —— SaaS 模板页：成员管理（docs/blocks.md team/）。
 *
 * 成员表（data-table 装配：头像/角色行内改/2FA badge/移除 confirm）+
 * 待处理邀请区（撤销）+ 新邀请 form-dialog（邮箱 + 角色，zod 校验 + 422 回填）。
 * 数据走 client 约定（宿主提供 fetch 适配）；交互编排（弹窗时序）在本块。
 */
import {
  createListColumnHelper,
  type ListColumnDef,
  listTableFeatures,
} from "@patterns-ui/core/list";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { cn } from "cn";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import { ConfirmDialog } from "@/components/blocks/form/confirm-dialog/confirm-dialog";
import { FormDialog } from "@/components/blocks/form/form-dialog/form-dialog";
import {
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import {
  actionsColumn,
  DataTable,
  type RowActionItem,
} from "@/components/blocks/list/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: TeamRole;
  twoFactorEnabled: boolean;
  joinedAt: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: TeamRole;
  invitedBy?: string;
  createdAt: string;
  status: "pending" | "accepted" | "revoked";
}

/** team 数据端点约定（宿主提供实现；错误形状 { fields } 时邀请表单回填字段错误） */
export interface TeamPageClient {
  listMembers(): Promise<TeamMember[]>;
  updateMemberRole(id: string, role: TeamRole): Promise<TeamMember>;
  removeMember(id: string): Promise<void>;
  listInvitations(): Promise<TeamInvitation[]>;
  createInvitation(input: { email: string; role: TeamRole }): Promise<TeamInvitation>;
  revokeInvitation(id: string): Promise<void>;
}

export interface TeamPageProps {
  client: TeamPageClient;
  /** 当前登录成员 id（不可改/不可移除自己与 owner） */
  currentUserId?: string;
  className?: string;
}

const ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
];

const inviteSchema = z.object({
  email: z.email("请输入有效邮箱"),
  role: z.enum(["owner", "admin", "member", "viewer"]),
});
type InviteValues = z.output<typeof inviteSchema>;

type MemberRow = TeamMember;

const MEMBERS_KEY = ["team", "members"];
const INVITATIONS_KEY = ["team", "invitations"];

export function TeamPage({ client, currentUserId, className }: TeamPageProps) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  const membersQuery = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => client.listMembers(),
  });
  const invitationsQuery = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: () => client.listInvitations(),
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });
    await queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY });
  };

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TeamRole }) => client.updateMemberRole(id, role),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => client.removeMember(id),
    onSuccess: async () => {
      setRemoving(null);
      await invalidate();
    },
  });
  const inviteMutation = useMutation({
    mutationFn: (input: { email: string; role: TeamRole }) => client.createInvitation(input),
    onSuccess: async () => {
      setInviteOpen(false);
      await invalidate();
    },
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => client.revokeInvitation(id),
    onSuccess: invalidate,
  });

  const members = membersQuery.data ?? [];
  const pendingInvitations = (invitationsQuery.data ?? []).filter(
    (invite) => invite.status === "pending",
  );

  const helper = useMemo(() => createListColumnHelper<MemberRow>(), []);

  const columns = useMemo<ListColumnDef<MemberRow>[]>(() => {
    const canEditRole = (member: MemberRow) =>
      member.role !== "owner" && member.id !== currentUserId;
    return [
      helper.accessor("name", {
        header: "成员",
        cell: (info) => (
          <span className="inline-flex items-center gap-2">
            <CellUser
              user={{
                name: info.getValue(),
                avatarUrl: info.row.original.avatarUrl,
              }}
            />
            <span className="text-muted-foreground truncate text-xs">
              {info.row.original.email}
            </span>
          </span>
        ),
      }),
      helper.accessor("role", {
        header: "角色",
        cell: (info) => {
          const member = info.row.original;
          if (!canEditRole(member)) {
            return <RoleBadge role={member.role} />;
          }
          return (
            <Select
              value={member.role}
              onValueChange={(value) => {
                if (value !== null) {
                  roleMutation.mutate({ id: member.id, role: value as TeamRole });
                }
              }}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-28"
                aria-label={`修改 ${member.name} 的角色`}
                onClick={(e) => e.stopPropagation()}
              >
                <SelectValue>{roleLabel(member.role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter((o) => o.value !== "owner").map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        },
      }),
      helper.accessor("twoFactorEnabled", {
        header: "2FA",
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" />
              已启用
            </Badge>
          ) : (
            <Badge variant="outline">未启用</Badge>
          ),
      }),
      helper.accessor("joinedAt", {
        header: "加入时间",
        cell: (info) => <CellTime value={info.getValue()} />,
      }),
      actionsColumn<MemberRow>(helper, (member) => {
        const actions: RowActionItem<MemberRow>[] = [];
        if (canEditRole(member)) {
          actions.push({
            label: "移出团队",
            danger: true,
            icon: UserMinus,
            run: () => setRemoving(member),
          });
        }
        return actions;
      }),
    ];
  }, [helper, currentUserId, roleMutation]);

  // selector 省略（订阅全部状态切片）→ table.state 类型与 ListTable 对齐
  const table = useTable({
    features: listTableFeatures,
    data: members,
    columns,
    getRowId: (row: MemberRow) => row.id,
  });

  return (
    <div className={cn("flex flex-col gap-6 pb-6", className)} data-slot="team-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-[13px]">
            {members.length} 位成员 · {pendingInvitations.length}{" "}
            个待处理邀请。角色变更即时生效（PATCH）。
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus data-icon="inline-start" />
          邀请成员
        </Button>
      </header>

      <section className="bg-card overflow-hidden rounded-xl border">
        <DataTable<MemberRow>
          table={table}
          stickyLast
          preferencesKey="team-members"
          mobile="cards"
        />
      </section>

      <section className="bg-card overflow-hidden rounded-xl border">
        <header className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-sm font-medium">待处理邀请</h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {pendingInvitations.length} 个
          </span>
        </header>
        {pendingInvitations.length === 0 ? (
          <p className="text-muted-foreground px-5 py-8 text-center text-sm">
            没有待处理邀请 —— 点击「邀请成员」发送第一封邀请。
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {pendingInvitations.map((invite) => (
              <li key={invite.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{invite.email}</span>
                <RoleBadge role={invite.role} />
                <CellTime value={invite.createdAt} className="text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(invite.id)}
                >
                  撤销
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        pending={inviteMutation.isPending}
        onSubmit={async (values, formApi) => {
          try {
            await inviteMutation.mutateAsync(values);
          } catch (err) {
            const fields = (err as { body?: { fields?: Record<string, string> } })?.body?.fields;
            formApi.setErrorMap({
              onSubmit: {
                fields: fields ?? {},
                form: fields ? undefined : err instanceof Error ? err.message : "邀请失败",
              },
            });
          }
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`移除 ${removing?.name ?? ""}？`}
        description="该成员将立即失去对本租户的访问权限；其历史审计记录保留。"
        danger
        confirmLabel="移除成员"
        pending={removeMutation.isPending}
        onConfirm={async () => {
          if (removing) await removeMutation.mutateAsync(removing.id);
        }}
      />
    </div>
  );
}

function roleLabel(role: TeamRole): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function RoleBadge({ role }: { role: TeamRole }) {
  const variant = role === "owner" ? "default" : role === "admin" ? "secondary" : "outline";
  return <Badge variant={variant}>{roleLabel(role)}</Badge>;
}

// ---------------------------------------------------------------------------
// 邀请弹窗：FormDialog + typed-form-field（email + role）
// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (
    values: InviteValues,
    // biome-ignore lint/suspicious/noExplicitAny: TanStack Form onSubmit 的 formApi 形状（setErrorMap 位）
    formApi: any,
  ) => Promise<void>;
}) {
  const form = useAppForm({
    defaultValues: { email: "", role: "member" } as InviteValues,
    validators: { onChange: inviteSchema },
    onSubmit: async ({ value, formApi }) => {
      await onSubmit(value, formApi);
    },
  });

  return (
    <form.AppForm>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="邀请成员"
        description="发送邮件邀请；被邀请人接受后以所选角色加入。"
        footer={<SubmitButton label="发送邀请" pendingLabel="发送中…" disabled={pending} />}
        onSubmit={() => void form.handleSubmit()}
      >
        <form.AppField name="email">
          {(field) => <field.TextWidget label="邮箱" required placeholder="teammate@example.com" />}
        </form.AppField>
        <form.AppField name="role">
          {(field) => <field.SelectWidget label="角色" required options={ROLE_OPTIONS} />}
        </form.AppField>
      </FormDialog>
    </form.AppForm>
  );
}
