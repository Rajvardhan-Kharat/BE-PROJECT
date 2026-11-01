import React, { forwardRef } from 'react'
import { cn } from '../../utils/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      icon,
      iconRight,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors select-none rounded focus:outline-none focus:ring-1 focus:ring-teal-700 disabled:opacity-50 disabled:cursor-not-allowed'

    const sizeStyles = {
      sm: 'h-7 px-2.5 text-xs gap-1.5',
      md: 'h-8 px-3 text-base gap-2',
    }

    const variantStyles = {
      primary:
        'bg-teal-700 text-white border border-teal-800 hover:bg-teal-800 active:bg-teal-900',
      secondary:
        'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
      ghost:
        'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent',
      danger:
        'bg-white text-rose-700 border border-rose-300 hover:bg-rose-50 hover:border-rose-400 active:bg-rose-100',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin h-3.5 w-3.5 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>
        )}
        <span>{children}</span>
        {!loading && iconRight && (
          <span className="shrink-0 flex items-center justify-center">{iconRight}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
