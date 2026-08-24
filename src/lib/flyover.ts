import type { AppearanceSnapshot, FlyoverInputMode } from './settings'
import type { EarconKind } from './earcon'

export const FLYOVER_SNAPSHOT_CHANNEL = 'flyover:snapshot'

export type FlyoverMode = 'assistant' | 'dictation' | 'screen'
export type FlyoverPhase =
  | 'hidden'
  | 'listening'
  | 'thinking'
  | 'tool'
  | 'confirm'
  | 'cleaning'
  | 'capturing'
  | 'looking'
  | 'disclosure'
  | 'composing'
  | 'reply'
  | 'done'
  | 'unavailable'
  | 'error'

export type FlyoverSnapshot = {
  visible: boolean
  mode: FlyoverMode
  inputMode: FlyoverInputMode
  phase: FlyoverPhase
  title: string
  text: string
  hint: string | null
  detail: string | null
  composeText: string | null
  previewImage: string | null
  interactive: boolean
  canCompose: boolean
  canFinish: boolean
  canApprove: boolean
  canRespondToDisclosure: boolean
  canOpenModels: boolean
}

export const INITIAL_FLYOVER_SNAPSHOT: FlyoverSnapshot = {
  visible: false,
  mode: 'assistant',
  inputMode: 'voice',
  phase: 'hidden',
  title: '',
  text: '',
  hint: null,
  detail: null,
  composeText: null,
  previewImage: null,
  interactive: false,
  canCompose: false,
  canFinish: false,
  canApprove: false,
  canRespondToDisclosure: false,
  canOpenModels: false
}

export type FlyoverAPI = {
  getSnapshot: () => Promise<FlyoverSnapshot>
  getAppearance: () => Promise<AppearanceSnapshot>
  cancel: () => void
  finishDictation: () => void
  startCompose: (text: string) => void
  updateCompose: (text: string) => void
  submitCompose: (text: string) => void
  resolveApproval: (approved: boolean) => void
  resolveDisclosure: (accepted: boolean) => void
  openMain: () => void
  openModels: () => void
  onSnapshotChange: (listener: (snapshot: FlyoverSnapshot) => void) => () => void
  onAppearanceChange: (listener: (snapshot: AppearanceSnapshot) => void) => () => void
  onEarcon: (listener: (kind: EarconKind) => void) => () => void
}
