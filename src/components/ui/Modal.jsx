import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, width = 'max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg-primary/30 p-4">
      <div className={`w-full ${width} rounded-card border border-line bg-elevated p-6 shadow-xl`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium text-fg-primary">{title}</h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg-primary">
            <X size={20} />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
