import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { CellId } from "@/components/blocks/cells/cell-id/cell-id";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { FormDialog } from "@/components/blocks/form/form-dialog/form-dialog";
import { SecretReveal } from "@/components/blocks/form/secret-reveal/secret-reveal";
import {
  FormMessage,
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { DangerZone } from "@/components/blocks/show/danger-zone/danger-zone";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiKeysResource } from "@/resources";

const EXPIRY_OPTIONS = [
  { value: "30d", label: "30 天" },
  { value: "90d", label: "90 天" },
  { value: "180d", label: "180 天" },
  { value: "never", label: "永不过期" },
];

const createSchema = z.object({
  name: z.string().trim().min(3, "名称至少 3 个字符"),
  expiresIn: z.enum(["30d", "90d", "180d", "never"]),
});

type CreateValues = z.output<typeof createSchema>;

function ApiKeysPage() {
  const [createOpen, setCreateOpen] = useState(false);
  /** 一次性 secret：仅创建后展示一次（列表/详情永不返回） */
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const query = apiKeysResource.useList({ pageSize: 50 });
  const create = apiKeysResource.useCreate();
  const remove = apiKeysResource.useDelete({
    onSuccess: () => toast.success("API Key 已吊销"),
  });

  const form = useAppForm({
    defaultValues: { name: "", expiresIn: "30d" } as CreateValues,
    validators: { onChange: createSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        const row = await create.mutateAsync({
          name: value.name.trim(),
          expiresIn: value.expiresIn,
        });
        const secret = (row as { secret?: string }).secret;
        if (secret !== undefined) {
          setRevealed({ name: row.name, secret });
          setCreateOpen(false);
          form.reset({ name: "", expiresIn: "30d" } as CreateValues);
        }
      } catch (err) {
        formApi.setErrorMap({
          onSubmit: { fields: {}, form: err instanceof Error ? err.message : "创建失败" },
        });
      }
    },
  });

  const rows = query.data?.rows ?? [];

  return (
    <>
      <ListPage
        title="API Keys"
        description="密钥创建后一次性展示（secret-reveal）· 列表永不返回 secret · 吊销需输入名称确认（type-to-confirm）。"
        actions={<Button onClick={() => setCreateOpen(true)}>创建 Key</Button>}
        body={
          <AsyncState
            query={query}
            rowsEmpty={rows.length === 0}
            hasActiveFilters={false}
            empty={{ title: "还没有 API Key", description: "创建第一个密钥用于 CI 或集成调用。" }}
          >
            <section className="bg-card text-card-foreground overflow-hidden rounded-xl border">
              <ul className="divide-border divide-y">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3.5 text-sm"
                  >
                    <span className="min-w-32 font-medium">{row.name}</span>
                    <span className="text-muted-foreground flex items-center gap-1 font-mono text-xs">
                      <CellId value={row.prefix} chars={12} />…
                    </span>
                    <span className="text-muted-foreground text-xs">
                      创建于 <CellTime value={row.createdAt} />
                    </span>
                    {row.lastUsedAt ? (
                      <span className="text-muted-foreground text-xs">
                        最近使用 <CellTime value={row.lastUsedAt} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60 text-xs">从未使用</span>
                    )}
                    {row.expiresAt ? (
                      <span className="text-status-warning text-xs">
                        过期于 <CellTime value={row.expiresAt} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">永不过期</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <div className="mt-6">
              <DangerZone
                title="吊销 Key"
                description="高危操作：吊销后使用该 Key 的调用将立即 401。"
                actions={rows.slice(0, 3).map((row) => ({
                  label: `吊销 ${row.name}`,
                  description: `前缀 ${row.prefix}…（type-to-confirm 演示）`,
                  typeToConfirm: row.name,
                  confirmLabel: "吊销",
                  pending: remove.isPending,
                  run: async () => {
                    await remove.mutateAsync({ id: row.id });
                  },
                }))}
              />
            </div>
          </AsyncState>
        }
      />

      {/* 创建（form-dialog：小表单宿主） */}
      <form.AppForm>
        <FormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          title="创建 API Key"
          description="名称用于识别用途；密钥仅在创建后展示一次。"
          onSubmit={() => void form.handleSubmit()}
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <SubmitButton label="创建" pendingLabel="创建中…" />
            </>
          }
        >
          <form.AppField name="name">
            {(field) => <field.TextWidget label="名称" required placeholder="ci-deploy-key" />}
          </form.AppField>
          <form.AppField name="expiresIn">
            {(field) => <field.SelectWidget label="有效期" required options={EXPIRY_OPTIONS} />}
          </form.AppField>
          <FormMessage />
        </FormDialog>
      </form.AppForm>

      {/* 一次性展示（secret-reveal） */}
      <Dialog
        open={revealed !== null}
        onOpenChange={(open) => {
          if (!open) setRevealed(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>API Key 已创建：{revealed?.name}</DialogTitle>
            <DialogDescription>
              以下密钥仅显示一次。关闭后无法再次查看（服务端不存储明文）。
            </DialogDescription>
          </DialogHeader>
          {revealed ? (
            <SecretReveal
              secret={revealed.secret}
              onDone={() => {
                setRevealed(null);
                toast.success("密钥已保存确认");
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

const searchSchema = z.object({}).catch({});

export const Route = createFileRoute("/_shell/t/$tenantId/api-keys")({
  staticData: { title: "API Keys" },
  validateSearch: searchSchema,
  component: ApiKeysPage,
});
