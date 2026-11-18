/** @jsxImportSource @gambrel/view */
import { Alert, AlertDescription, StatusBadge as GambrelStatusBadge } from '@gambrel/components'
import type { StatusTone } from '@gambrel/components'
import { ArrowDown, Clock, CircleAlert, CircleCheck, CirclePause, CircleX, Search, ShieldCheck } from '@gambrel/icons'
import type { IconComponent } from '@gambrel/icons'
import type { Child } from '@gambrel/view'
import type { DownloadStatus } from '../../downloads/domain/status'
import { statusLabel } from '../format'
import type { FlashView } from '../view-model'

const TONES: Readonly<Record<DownloadStatus, StatusTone>> = {
  queued: 'neutral',
  probing: 'info',
  downloading: 'info',
  verifying: 'info',
  paused: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral'
}

const ICONS: Readonly<Record<DownloadStatus, IconComponent>> = {
  queued: Clock,
  probing: Search,
  downloading: ArrowDown,
  verifying: ShieldCheck,
  paused: CirclePause,
  completed: CircleCheck,
  failed: CircleAlert,
  cancelled: CircleX
}

export function StatusBadge(props: { status: DownloadStatus }): Child {
  return (
    <GambrelStatusBadge tone={TONES[props.status]} data-field="status" data-status={props.status}>
      {statusLabel(props.status)}
    </GambrelStatusBadge>
  )
}

export function StatusIcon(props: { status: DownloadStatus }): Child {
  const Icon = ICONS[props.status]
  return (
    <span class={`status-icon tone-${TONES[props.status]}`}>
      <Icon size={20} />
    </span>
  )
}

export function Flash(props: { flash: FlashView | null }): Child {
  if (props.flash === null) return null
  const error = props.flash.kind === 'error'
  return (
    <Alert variant={error ? 'destructive' : 'default'} role={error ? 'alert' : 'status'} class="flash">
      {error ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
      <AlertDescription>{props.flash.message}</AlertDescription>
    </Alert>
  )
}
