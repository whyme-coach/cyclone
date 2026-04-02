'use client'

import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  required?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, required, className, id, ...props }, ref) => {
    const textareaId = id || label?.replace(/\s/g, '-').toLowerCase()

    return (
      <div>
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-slate-700 mb-1">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
            'placeholder:text-slate-400 resize-vertical',
            'disabled:bg-slate-50 disabled:text-slate-500',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
