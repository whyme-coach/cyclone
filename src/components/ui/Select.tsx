'use client'

import { cn } from '@/lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  required?: boolean
  options: { value: string | number; label: string }[]
  placeholder?: string
}

export function Select({ label, error, required, options, placeholder, className, id, ...props }: SelectProps) {
  const selectId = id || label?.replace(/\s/g, '-').toLowerCase()

  return (
    <div>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={cn(
          'w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
          'disabled:bg-slate-50 disabled:text-slate-500',
          'bg-white appearance-none',
          error && 'border-red-500 focus:ring-red-500',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
