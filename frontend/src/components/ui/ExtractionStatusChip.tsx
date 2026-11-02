import React from 'react'
import {
  CheckCircle2,
  Compass,
  AlertCircle,
  MinusCircle,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import type { ExtractionFieldStatus } from '../../types/document'

interface StatusConfig {
  label: string
  icon: React.ComponentType<{ className?: string }>
  className: string
  iconClass: string
}

const statusConfigs: Record<ExtractionFieldStatus, StatusConfig> = {
  explicit: {
    label: 'Explicit',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    iconClass: 'text-emerald-700',
  },
  inferred: {
    label: 'Inferred',
    icon: Compass,
    className: 'bg-teal-50 text-teal-800 border-teal-200',
    iconClass: 'text-teal-700',
  },
  uncertain: {
    label: 'Uncertain',
    icon: AlertCircle,
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    iconClass: 'text-amber-700',
  },
  missing: {
    label: 'Missing',
    icon: MinusCircle,
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    iconClass: 'text-slate-600',
  },
  conflicting: {
    label: 'Conflicting',
    icon: AlertTriangle,
    className: 'bg-rose-50 text-rose-800 border-rose-200',
    iconClass: 'text-rose-700',
  },
}

export interface ExtractionStatusChipProps {
  status: ExtractionFieldStatus
  label?: string
  className?: string
  size?: 'sm' | 'md'
}

export const ExtractionStatusChip: React.FC<ExtractionStatusChipProps> = ({
  status,
  label,
  className,
  size = 'sm',
}) => {
  const config = statusConfigs[status] || statusConfigs.uncertain
  const Icon = config.icon

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
      <Icon className={cn('w-3.5 h-3.5 shrink-0', config.iconClass)} />
      <span className="truncate">{label || config.label}</span>
    </span>
  )
}
