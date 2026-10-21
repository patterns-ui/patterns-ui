import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface AvatarUser {
  name: string;
  avatarUrl?: string;
}

const sizeClasses = {
  sm: "size-6 text-[10px]",
  default: "size-8 text-xs",
  lg: "size-10 text-sm",
} as const;

export type UserAvatarSize = keyof typeof sizeClasses;

/** 名字首字母（最多两段取首字符，如 "Qiulin Li" → "QL"；单段取前两字符） */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
  }
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

export function UserAvatar({
  user,
  size = "default",
  className,
}: {
  user: AvatarUser;
  size?: UserAvatarSize;
  className?: string;
}) {
  return (
    <Avatar className={cn(sizeClasses[size], className)} data-slot="user-avatar">
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.name} /> : null}
      <AvatarFallback className="bg-muted text-muted-foreground font-medium">
        {avatarInitials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** 头像堆叠：超出 max 的部分折叠为 +N */
export function AvatarStack({
  users,
  max = 3,
  size = "default",
  className,
}: {
  users: AvatarUser[];
  max?: number;
  size?: UserAvatarSize;
  className?: string;
}) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;
  return (
    <div className={cn("flex items-center -space-x-2", className)} data-slot="avatar-stack">
      {visible.map((user, index) => (
        <UserAvatar
          key={`${user.name}-${index}`}
          user={user}
          size={size}
          className="ring-2 ring-background"
        />
      ))}
      {overflow > 0 ? (
        <div
          className={cn(
            sizeClasses[size],
            "flex items-center justify-center rounded-full border bg-muted font-medium text-muted-foreground ring-2 ring-background",
          )}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
