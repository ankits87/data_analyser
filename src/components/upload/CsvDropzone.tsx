'use client'

import { useRef, useState } from 'react'

interface Props {
  onFileSelected: (file: File) => void
  disabled?: boolean
}

export default function CsvDropzone({ onFileSelected, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) onFileSelected(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
        ${dragging ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-300 hover:border-zinc-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="text-4xl mb-3">📂</div>
      <p className="text-sm font-medium text-zinc-700">
        Drop your CSV file here, or <span className="underline">browse</span>
      </p>
      <p className="text-xs text-zinc-400 mt-1">Only .csv files are supported</p>
    </div>
  )
}
