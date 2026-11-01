import React from 'react'
import {
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  History,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react'
import { cn } from '../../utils/cn'

export type RecordStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'requires_correction'

interface StatusConfig {
  label: string
  icon: React.ComponentType<{ className?: string }>
  className: string
  iconClass: string
}

const statusConfigs: Record<RecordStatus, StatusConfig> = {
  draft: {
    label: 'Draft',
    icon: FileEdit,
    className: 'bg-status-draft-bg text-status-draft-text border-status-draft-border',
    iconClass: 'text-slate-600',
  },
  pending_review: {
    label: 'Pending review',
    icon: Clock,
    className: 'bg-status-pending-bg text-status-pending-text border-status-pending-border',
    iconClass: 'text-amber-700',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'bg-status-approved-bg text-status-approved-text border-status-approved-border',
    iconClass: 'text-emerald-700',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    className: 'bg-status-rejected-bg text-status-rejected-text border-status-rejected-border',
    iconClass: 'text-rose-700',
  },
  superseded: {
    label: 'Superseded',
    icon: History,
    className: 'bg-status-superseded-bg text-status-superseded-text border-status-superseded-border',
    iconClass: 'text-slate-500',
  },
  requires_correction: {
    label: 'Requires correction',
    icon: AlertTriangle,
    className: 'bg-status-correction-bg text-status-correction-text border-status-correction-border',
    iconClass: 'text-orange-700',
  },
}

export interface StatusChipProps {
  status: RecordStatus
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  label,
  className,
  size = 'md',
}) => {
  const config = statusConfigs[status] || {
    label: status,
    icon: HelpCircle,
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    iconClass: 'text-slate-500',
  }

  const IconComponent = config.icon

  const sizeClasses =
    size === 'sm'
      ? 'h-5 px-1.5 text-2xs gap-1'
      : 'h-6 px-2 text-xs gap-1.5'

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium border rounded select-none shrink-0 tracking-tight',
        config.className,
        sizeClasses,
        className
      )}
    >
      <IconComponent className={cn('w-3.5 h-3.5 shrink-0', config.iconClass)} />
      <span className="truncate">{label || config.label}</span>
    </span>
  )
}
