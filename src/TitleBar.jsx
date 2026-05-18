import React, { useState } from 'react'
import { C } from './constants.js'

export default function TitleBar({ title, subtitle }) {
  const isMac = navigator.userAgent.includes('Mac')
  const [isPinned, setIsPinned] = useState(false)

  // Funções para controlar a janela
  const handleMinimize = () => window.electron.minimize()
  const handleMaximize = () => window.electron.maximize()
  const handleClose = () => window.electron.close()
  
  const handleTogglePin = () => {
    const nextState = !isPinned
    setIsPinned(nextState)
    window.electron.toggleAlwaysOnTop(nextState)
  }

  return (
    <div style={{
      height: 44,
      background: C.surface,
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      paddingInline: isMac ? '80px 16px' : '16px',
      gap: 12,
      flexShrink: 0,
      WebkitAppRegion: 'drag', 
      userSelect: 'none',
    }}>
      <div style={{ fontSize: 16, WebkitAppRegion: 'no-drag' }}>🎮</div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1 }}>
          GML Assistant
        </div>
        {subtitle && (
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>

      {!isMac && (
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          height: '100%',
          WebkitAppRegion: 'no-drag', 
        }}>
          {/* Botão de Fixar / Sempre no topo */}
          <ControlButton 
            label="📌" 
            onClick={handleTogglePin} 
            isActive={isPinned} 
            title={isPinned ? "Desafixar do topo" : "Fixar no topo da tela"}
          />
          <ControlButton label="─" onClick={handleMinimize} />
          <ControlButton label="□" onClick={handleMaximize} />
          <ControlButton label="✕" onClick={handleClose} isClose />
        </div>
      )}
    </div>
  )
}

function ControlButton({ label, onClick, isClose, isActive, title }) {
  return (
    <button 
      onClick={onClick}
      title={title}
      style={{
        width: 46,
        height: 44,
        background: isActive ? C.borderHover : 'none',
        border: 'none',
        color: isActive ? C.text : C.textDim,
        fontSize: 14,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = isClose ? '#E81123' : C.elevated
        e.currentTarget.style.color = isClose ? '#FFF' : C.text
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isActive ? C.borderHover : 'none'
        e.currentTarget.style.color = isActive ? C.text : C.textDim
      }}
    >
      {label}
    </button>
  )
}