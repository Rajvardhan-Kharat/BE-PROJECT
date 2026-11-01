import React from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'

export type BannerVariant = 'info' | 'warning' | 'critical' | 'synthetic' | 'neutral'

export interface BannerProps {
  variant?: BannerVariant
  title?: string
  children: React.ReactNode
  icon?: React.ReactNode
  onDismiss?: () => void
  action?: React.ReactNode
  className?: string
  compact?: boolean
}

export const Banner: React.FC<BannerProps> = ({
  variant = 'neutral',
  title,
  children,
  icon,
  onDismiss,
  action,
  className,
  compact = false,
}) => {
  const variantStyles = {
    neutral: 'bg-slate-100 border-slate-300 text-slate-800',
    info: 'bg-teal-50 border-teal-300 text-teal-950',
    warning: 'bg-amber-50 border-amber-300 text-amber-950',
    critical: 'bg-rose-50 border-rose-300 text-rose-950',
    synthetic: 'bg-slate-950 border-slate-800 text-slate-100',
  }

  const defaultIcon = () => {
    switch (variant) {
      case 'info':
        return <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
      case 'synthetic':
        return (
          <span className="bg-amber-500 text-slate-950 px-1 py-0.5 text-2xs font-mono font-bold rounded-sm tracking-wider uppercase shrink-0">
            Synthetic
          </span>
        )
      default:
        return <CheckCircle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
    }
  }

  return (
    <div
      role="status"
      className={cn(
        'w-full border rounded flex items-start justify-between gap-3',
        compact ? 'py-1.5 px-3 text-xs' : 'py-2 px-3.5 text-base',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        {icon !== undefined ? icon : defaultIcon()}
        <div className="min-w-0 flex-1">
          {title && (
            <div
              className={cn(
                'font-semibold mb-0.5',
                compact ? 'text-xs' : 'text-base',
                variant === 'synthetic' ? 'text-white' : 'text-slate-900'
              )}
            >
              {title}
            </div>
          )}
          <div
            className={cn(
              'leading-relaxed break-words',
              variant === 'synthetic' ? 'text-slate-300' : 'text-slate-700'
            )}
          >
            {children}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        {action}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className={cn(
              'p-0.5 rounded hover:bg-black/5 transition-colors',
              variant === 'synthetic' ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-900'
            )}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}
