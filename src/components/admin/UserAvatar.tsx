import { cn, initials } from '@/lib/utils'

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  xs: 'size-7 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[13px]',
  lg: 'size-12 text-[15px]',
}

export interface UserAvatarProps {
  name: string
  photoUrl?: string
  size?: UserAvatarSize
  className?: string
}

/**
 * Telegram-style avatar: falls back to initials on a brand gradient when the
 * user has no photo. `photoUrl` will be populated by the backend later.
 */
export function UserAvatar({ name, photoUrl, size = 'md', className }: UserAvatarProps) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 font-semibold text-white',
        'shadow-sm ring-1 ring-black/5',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
