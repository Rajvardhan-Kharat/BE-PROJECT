import React from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center border border-dashed border-slate-300 rounded bg-slate-50/50',
        className
      )}
    >
      <div className="w-8 h-8 rounded border border-slate-200 bg-white flex items-center justify-center text-slate-500 mb-3 shadow-sm">
        {icon || <Inbox className="w-4 h-4 text-slate-500" />}
      </div>
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-slate-500 max-w-sm leading-normal">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
