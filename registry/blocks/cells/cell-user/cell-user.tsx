import { cn } from "cn";
import type { AvatarUser } from "@/components/blocks/shared/user-avatar/user-avatar";
import { UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";

export interface CellUserProps {
  /** 单个用户或用户组（>2 个截断为 "+N"） */
  user?: AvatarUser | AvatarUser[];
  /** 无 user 对象时的兜底解析（如 owner id → 用户对象） */
  id?: string;
  resolve?: (id: string) => AvatarUser | undefined;
  size?: "sm" | "default" | "lg";
  className?: string;
}

/** 用户单元格：头像 + 名；数组时名逗号连接、超过 2 个截断 +N */
export function CellUser({ user, id, resolve, size = "sm", className }: CellUserProps) {
  const users: AvatarUser[] = Array.isArray(user) ? user : user ? [user] : [];
  const resolved =
    users.length === 0 && id && resolve
      ? [resolve(id)].filter((u): u is AvatarUser => u !== undefined)
      : users;

  if (resolved.length === 0) {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }

  const visible = resolved.slice(0, 2);
  const overflow = resolved.length - visible.length;
  const label = visible.map((u) => u.name).join(", ") + (overflow > 0 ? ` +${overflow}` : "");

  return (
    <span className={cn("inline-flex items-center gap-2", className)} data-slot="cell-user">
      <span className="inline-flex -space-x-1.5">
        {visible.map((u, i) => (
          <UserAvatar
            key={`${u.name}-${i}`}
            user={u}
            size={size}
            className="ring-2 ring-background"
          />
        ))}
      </span>
      <span className="truncate text-[13px]" title={resolved.map((u) => u.name).join(", ")}>
        {label}
      </span>
    </span>
  );
}
