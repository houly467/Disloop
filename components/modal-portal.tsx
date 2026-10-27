'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
let modalSequence = 0

export function ModalPortal({ backdropClassName, dialogClassName, labelId, onClose, children }: {
  backdropClassName: string
  dialogClassName: string
  labelId: string
  onClose: () => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const modalHistoryId = useRef(`disloop-modal-${++modalSequence}`)
  const historyPushedRef = useRef(false)
  const activeEffectCount = useRef(0)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    activeEffectCount.current += 1
    if (!historyPushedRef.current) {
      const historyState = window.history.state
      window.history.pushState(
        { ...(historyState && typeof historyState === 'object' ? historyState : {}), disloopModalId: modalHistoryId.current },
        '',
      )
      historyPushedRef.current = true
    }
    const handlePopState = () => {
      if (window.history.state?.disloopModalId !== modalHistoryId.current) onCloseRef.current()
    }
    window.addEventListener('popstate', handlePopState)

    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const backdrop = dialog?.parentElement
    const themeRoot = previousFocus?.closest<HTMLElement>('.disloop-shell') ?? document.querySelector<HTMLElement>('.disloop-shell')
    if (backdrop && themeRoot) {
      const themeStyles = getComputedStyle(themeRoot)
      const variables = [
        '--page', '--surface', '--surface-raised', '--surface-soft', '--surface-hover',
        '--line', '--line-soft', '--text', '--text-secondary', '--text-muted',
        '--accent-soft', '--accent-strong', '--warm', '--danger', '--shadow',
        '--background', '--foreground', '--border', '--accent',
      ]
      backdrop.dir = themeRoot.dir
      backdrop.lang = themeRoot.lang
      backdrop.style.fontFamily = themeStyles.fontFamily
      backdrop.style.colorScheme = themeStyles.colorScheme
      for (const variable of variables) backdrop.style.setProperty(variable, themeStyles.getPropertyValue(variable))
    }

    const focusInitial = () => {
      const target = dialog?.querySelector<HTMLElement>(focusableSelector) ?? dialog
      target?.focus()
    }
    const containFocus = (event: FocusEvent) => {
      if (dialog && event.target instanceof Node && !dialog.contains(event.target)) focusInitial()
    }
    focusInitial()
    document.addEventListener('focusin', containFocus)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      document.removeEventListener('focusin', containFocus)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
      activeEffectCount.current -= 1
      queueMicrotask(() => {
        if (activeEffectCount.current === 0 && window.history.state?.disloopModalId === modalHistoryId.current) window.history.back()
      })
    }
  }, [mounted])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0)
    if (!focusable.length) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
      event.preventDefault()
      first.focus()
    }
  }

  function closeModal() {
    if (window.history.state?.disloopModalId === modalHistoryId.current) window.history.back()
    else onCloseRef.current()
  }

  if (!mounted) return null

  return createPortal(
    <div className={backdropClassName} onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeModal()
    }}>
      <section ref={dialogRef} className={dialogClassName} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} onKeyDown={handleKeyDown}>
        {children}
      </section>
    </div>,
    document.body,
  )
}
