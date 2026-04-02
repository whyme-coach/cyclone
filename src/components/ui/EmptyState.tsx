interface EmptyStateProps {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="flex justify-center mb-4 text-slate-400">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-slate-500 mb-4">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  )
}
