import { IconAlert, IconCheck, IconDownload, IconInfo, IconX } from './Icons'

export type ToastKind = 'success' | 'error' | 'info' | 'clipboard'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastStackProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps): React.JSX.Element {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.kind}`} role="status">
          <span className="toast__icon" aria-hidden="true">
            {toast.kind === 'success' ? (
              <IconCheck size={18} />
            ) : toast.kind === 'error' ? (
              <IconAlert size={18} />
            ) : toast.kind === 'clipboard' ? (
              <IconDownload size={18} />
            ) : (
              <IconInfo size={18} />
            )}
          </span>
          <div className="toast__content">
            <strong className="toast__title">{toast.title}</strong>
            {toast.body ? <p className="toast__body">{toast.body}</p> : null}
            {toast.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  toast.action?.onClick()
                  onDismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button icon-button--small"
            onClick={() => onDismiss(toast.id)}
            aria-label="Fermer la notification"
          >
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
