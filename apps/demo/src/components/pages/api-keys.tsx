/**
 * API Keys 页渲染出口（M7-A3 批1）：pages/api-keys.page.ts 配置驱动的自定义密钥列表
 * （卡片行 + form-dialog 创建 + secret-reveal 一次性展示 + DangerZone 吊销）。
 * api-key 模式预设 block M8 波1 落地后本视图收敛为工厂装配。
 */
import { useState } from "react";
import { toast } from "sonner";
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
import { API_KEYS_COPY, createSchema, EXPIRY_OPTIONS } from "@/pages/api-keys.page";
import { apiKeysResource } from "@/resources";

type CreateValues = { name: string; expiresIn: "30d" | "90d" | "180d" | "never" };

export function ApiKeysView() {
  const [createOpen, setCreateOpen] = useState(false);
  /** 一次性 secret：仅创建后展示一次（列表/详情永不返回） */
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const query = apiKeysResource.useList({ pageSize: 50 });
  const create = apiKeysResource.useCreate();
  const remove = apiKeysResource.useDelete({
    onSuccess: () => toast.success(API_KEYS_COPY.revokedToast),
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
        description={API_KEYS_COPY.description}
        actions={<Button onClick={() => setCreateOpen(true)}>{API_KEYS_COPY.createLabel}</Button>}
        body={
          <AsyncState
            query={query}
            rowsEmpty={rows.length === 0}
            hasActiveFilters={false}
            empty={API_KEYS_COPY.empty}
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
                title={API_KEYS_COPY.danger.title}
                description={API_KEYS_COPY.danger.description}
                actions={rows.slice(0, 3).map((row) => ({
                  label: `吊销 ${row.name}`,
                  description: `前缀 ${row.prefix}…`,
                  typeToConfirm: row.name,
                  confirmLabel: API_KEYS_COPY.danger.confirmLabel,
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
          title={API_KEYS_COPY.createTitle}
          description={API_KEYS_COPY.createDescription}
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
            {(field) => (
              <field.SelectWidget label="有效期" required options={[...EXPIRY_OPTIONS]} />
            )}
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
            <DialogTitle>{API_KEYS_COPY.revealTitle(revealed?.name ?? "")}</DialogTitle>
            <DialogDescription>{API_KEYS_COPY.revealDescription}</DialogDescription>
          </DialogHeader>
          {revealed ? (
            <SecretReveal
              secret={revealed.secret}
              onDone={() => {
                setRevealed(null);
                toast.success(API_KEYS_COPY.revealSavedToast);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
