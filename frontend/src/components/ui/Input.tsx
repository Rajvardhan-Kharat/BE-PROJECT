import React, { forwardRef } from 'react'
import { cn } from '../../utils/cn'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  helperText?: string
  error?: string
  mono?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  size?: 'sm' | 'md'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      helperText,
      error,
      mono = false,
      leftIcon,
      rightIcon,
      size = 'md',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    const heightStyles = size === 'sm' ? 'h-7 text-xs' : 'h-8 text-base'

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-2.5 flex items-center pointer-events-none text-slate-500">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full bg-white border rounded text-slate-900 placeholder:text-slate-400',
              'transition-colors focus:outline-none',
              mono ? 'font-mono' : 'font-sans',
              heightStyles,
              leftIcon ? 'pl-8' : 'px-2.5',
              rightIcon ? 'pr-8' : 'px-2.5',
              error
                ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
                : 'border-slate-300 focus:border-teal-700 focus:ring-1 focus:ring-teal-700',
              disabled && 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-2.5 flex items-center pointer-events-none text-slate-500">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-rose-600">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    )
  }
)

Input.displayName = 'Input'
