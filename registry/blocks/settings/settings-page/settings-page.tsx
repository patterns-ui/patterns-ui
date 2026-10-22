/**
 * settings-page —— SaaS 模板页：完整设置页（docs/blocks.md team/settings）。
 *
 * 四节：组织（name/avatar）、个人（display name/email/时区）、安全（改密码 + 会话占位）、
 * 外观（theme + preset）。个人/安全节为 typed-form-field 表单（zod 校验 + 服务端错误位）；
 * 时区/主题直连 core datetime/theme 偏好（localStorage，不进 URL）。
 */
import { type ThemeMode, useTheme } from "@patterns-ui/core/theme";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { Building2, KeyRound, LogOut, Palette, UserCog } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  FormMessage,
  SubmitButton,
  useAppForm,
} from "@/components/blocks/form/typed-form-field/typed-form-field";
import { UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";
import { InlineEditField } from "@/components/blocks/show/inline-edit-field/inline-edit-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SettingsOrg {
  name: string;
  avatarUrl?: string;
  plan?: string;
}

export interface SettingsProfileInput {
  displayName: string;
  email: string;
  timeZone?: string;
}

export interface SettingsPageProps {
  org?: SettingsOrg;
  onSaveOrgName?(name: string): Promise<void>;
  profile: SettingsProfileInput;
  onSaveProfile?(
    input: SettingsProfileInput,
  ): Promise<
    { ok: true } | { ok: false; fieldErrors?: Record<string, string>; formError?: string }
  >;
  onChangePassword?(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<
    { ok: true } | { ok: false; formError?: string; fieldErrors?: Record<string, string> }
  >;
  /** 主题 preset 列表 */
  presets: { id: string; label: string }[];
  /** 会话区：登出全部回调（占位实现由宿主给） */
  onSignOutAllSessions?(): Promise<void>;
  className?: string;
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
  { value: "system", label: "跟随系统" },
];

/** Intl.supportedValuesOf('timeZone')（ES2022+；类型未覆盖，运行时特性检测） */
function timeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.("timeZone") ?? [];
}

export function SettingsPage({
  org,
  onSaveOrgName,
  profile,
  onSaveProfile,
  onChangePassword,
  presets,
  onSignOutAllSessions,
  className,
}: SettingsPageProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6 pb-8", className)}
      data-slot="settings-page"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-[13px]">
          组织、个人、安全与外观偏好；偏好类设置存于本机（localStorage），不进 URL。
        </p>
      </header>

      {org ? (
        <SettingsSection
          icon={<Building2 className="size-4" />}
          title="组织"
          description="租户名称与标识。"
        >
          <div className="flex items-center gap-4">
            <UserAvatar user={{ name: org.name, avatarUrl: org.avatarUrl }} size="lg" />
            <div className="flex-1">
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wider uppercase">
                组织名称
              </p>
              <InlineEditField
                value={org.name}
                onSave={async (next) => {
                  await onSaveOrgName?.(next);
                }}
              />
            </div>
            {org.plan ? <Badge variant="secondary">{org.plan}</Badge> : null}
          </div>
        </SettingsSection>
      ) : null}

      <ProfileSection profile={profile} onSave={onSaveProfile} />

      <SecuritySection
        onChangePassword={onChangePassword}
        onSignOutAllSessions={onSignOutAllSessions}
      />

      <AppearanceSection presets={presets} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 分节容器
// ---------------------------------------------------------------------------

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border">
      <header className="flex items-center gap-2 border-b px-5 py-3.5">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
            {description}
          </span>
        ) : null}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 个人节（display name / email / 时区）
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  displayName: z.string().min(2, "显示名至少 2 个字符"),
  email: z.email("请输入有效邮箱"),
  timeZone: z.string(),
});

function ProfileSection({
  profile,
  onSave,
}: {
  profile: SettingsProfileInput;
  onSave?: (
    input: SettingsProfileInput,
  ) => Promise<
    { ok: true } | { ok: false; fieldErrors?: Record<string, string>; formError?: string }
  >;
}) {
  const queryClient = useQueryClient();
  const zones = useMemo(timeZones, []);
  // 时区偏好读 core datetime（独立于 profile 字段提交；也随表单一并保存）
  const form = useAppForm({
    defaultValues: {
      displayName: profile.displayName,
      email: profile.email,
      timeZone: profile.timeZone ?? "",
    },
    validators: { onChange: profileSchema },
    onSubmit: async ({ value, formApi }) => {
      if (!onSave) return;
      const result = await onSave(value);
      if (result.ok) {
        toast.success("个人设置已保存");
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      } else {
        formApi.setErrorMap({
          onSubmit: { fields: result.fieldErrors ?? {}, form: result.formError },
        });
      }
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <SettingsSection
          icon={<UserCog className="size-4" />}
          title="个人"
          description="显示名、邮箱与时区。"
        >
          <div className="grid gap-4">
            <form.AppField name="displayName">
              {(field) => <field.TextWidget label="显示名" required />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextWidget label="邮箱" required />}
            </form.AppField>
            <form.AppField name="timeZone">
              {(field) => (
                <field.SelectWidget
                  label="时区"
                  description="影响全站时间显示（Intl 时区解析）。"
                  options={[
                    { value: "", label: "系统时区" },
                    ...zones.map((zone) => ({ value: zone, label: zone })),
                  ]}
                />
              )}
            </form.AppField>
            <FormMessage />
            <div className="flex justify-end">
              <SubmitButton label="保存个人设置" />
            </div>
          </div>
        </SettingsSection>
      </form.AppForm>
    </form>
  );
}

// ---------------------------------------------------------------------------
// 安全节（改密码 + 会话占位）
// ---------------------------------------------------------------------------

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(8, "新密码至少 8 位"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "两次输入的新密码不一致",
    path: ["confirmPassword"],
  });

function SecuritySection({
  onChangePassword,
  onSignOutAllSessions,
}: {
  onChangePassword?: (input: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<
    { ok: true } | { ok: false; formError?: string; fieldErrors?: Record<string, string> }
  >;
  onSignOutAllSessions?: () => Promise<void>;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const form = useAppForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: { onChange: passwordSchema },
    onSubmit: async ({ value, formApi }) => {
      if (!onChangePassword) return;
      const result = await onChangePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      if (result.ok) {
        toast.success("密码已更新");
        formApi.reset();
      } else {
        formApi.setErrorMap({
          onSubmit: { fields: result.fieldErrors ?? {}, form: result.formError },
        });
      }
    },
  });

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <SettingsSection
            icon={<KeyRound className="size-4" />}
            title="安全"
            description="修改登录密码。"
          >
            <div className="grid max-w-md gap-4">
              <form.AppField name="currentPassword">
                {(field) => <field.SecretWidget label="当前密码" required />}
              </form.AppField>
              <form.AppField name="newPassword">
                {(field) => <field.SecretWidget label="新密码" required />}
              </form.AppField>
              <form.AppField name="confirmPassword">
                {(field) => <field.SecretWidget label="确认新密码" required />}
              </form.AppField>
              <FormMessage />
              <div className="flex justify-end">
                <SubmitButton label="更新密码" />
              </div>
            </div>
          </SettingsSection>
        </form.AppForm>
      </form>

      <SettingsSection title="会话" description="活跃会话管理（占位）">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-[13px]">
            当前设备保持登录；可强制登出全部会话（含其它浏览器）。
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={signingOut || onSignOutAllSessions === undefined}
            onClick={async () => {
              setSigningOut(true);
              try {
                await onSignOutAllSessions?.();
                toast.success("已登出全部会话");
              } finally {
                setSigningOut(false);
              }
            }}
          >
            <LogOut data-icon="inline-start" />
            登出全部会话
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// 外观节（theme + preset；core theme 偏好直连）
// ---------------------------------------------------------------------------

function AppearanceSection({ presets }: { presets: { id: string; label: string }[] }) {
  const { theme, setTheme, preset, setPreset } = useTheme();
  return (
    <SettingsSection
      icon={<Palette className="size-4" />}
      title="外观"
      description="主题与样式预设，即时生效。"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <span className="text-[13px] font-medium">主题</span>
          <Select value={theme} onValueChange={(v) => v !== null && setTheme(v as ThemeMode)}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {THEME_OPTIONS.find((o) => o.value === theme)?.label ?? theme}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <span className="text-[13px] font-medium">样式预设</span>
          <Select value={preset} onValueChange={(v) => v !== null && setPreset(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{presets.find((o) => o.id === preset)?.label ?? preset}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {presets.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsSection>
  );
}
