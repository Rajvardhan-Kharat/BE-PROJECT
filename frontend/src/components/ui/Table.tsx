import React from 'react'
import { cn } from '../../utils/cn'

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string
  stickyHeader?: boolean
}

export const Table: React.FC<TableProps> = ({
  className,
  containerClassName,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'w-full overflow-x-auto border border-slate-200 rounded bg-white',
        containerClassName
      )}
    >
      <table className={cn('w-full text-left border-collapse', className)} {...props}>
        {children}
      </table>
    </div>
  )
}

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }> = ({
  className,
  sticky = true,
  children,
  ...props
}) => {
  return (
    <thead
      className={cn(
        'bg-slate-100 text-slate-700 border-b border-slate-200',
        sticky && 'sticky top-0 z-10',
        className
      )}
      {...props}
    >
      {children}
    </thead>
  )
}

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <tbody className={cn('divide-y divide-slate-200 bg-white', className)} {...props}>
      {children}
    </tbody>
  )
}

export const TableRow: React.FC<
  React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean; clickable?: boolean }
> = ({ className, selected, clickable, children, ...props }) => {
  return (
    <tr
      className={cn(
        'transition-colors',
        clickable && 'cursor-pointer',
        selected ? 'bg-teal-50/60' : 'hover:bg-slate-50/80',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  )
}

export const TableHead: React.FC<
  React.ThHTMLAttributes<HTMLTableCellElement> & { alignRight?: boolean }
> = ({ className, alignRight, children, ...props }) => {
  return (
    <th
      className={cn(
        'h-8 px-3 text-xs font-semibold text-slate-700 select-none whitespace-nowrap',
        alignRight ? 'text-right' : 'text-left',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export const TableCell: React.FC<
  React.TdHTMLAttributes<HTMLTableCellElement> & { alignRight?: boolean; mono?: boolean }
> = ({ className, alignRight, mono, children, ...props }) => {
  return (
    <td
      className={cn(
        'py-2 px-3 text-base text-slate-800 align-middle',
        mono && 'font-mono text-xs text-slate-700',
        alignRight ? 'text-right' : 'text-left',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}
