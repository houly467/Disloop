'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'

export function ImageViewer({ src, alt, label, closeLabel, className = '' }: {
  src: string
  alt: string
  label: string
  closeLabel: string
  className?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  return (
    <>
      <button type="button" className="image-viewer-trigger" aria-label={label} onClick={() => dialogRef.current?.showModal()}>
        <img className={className} src={src} alt={alt} loading="lazy" />
      </button>
      <dialog
        className="image-viewer-dialog"
        ref={dialogRef}
        aria-label={label}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="image-viewer-content">
          <button className="image-viewer-close" type="button" aria-label={closeLabel} onClick={() => dialogRef.current?.close()}>
            <X aria-hidden="true" />
          </button>
          <img src={src} alt={alt} />
        </div>
      </dialog>
    </>
  )
}
