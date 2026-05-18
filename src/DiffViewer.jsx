import React, { useRef, useState } from 'react'
import { C, parseGMLFilename } from './constants'
import { soundManager } from './soundManager'

export default function DiffViewer({ 
  fileName, oldCode, newCode, analysisText, 
  searchFailed, suggestedBlock, searchedBlock, 
  isDelete, isNew, isCopy, fromPath,
  onAccept, onReject 
}) {
  
  const [showFullFile, setShowFullFile]       = useState(false)
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const [copiedNew, setCopiedNew]             = useState(false)
  const [showFailedBlocks, setShowFailedBlocks] = useState(false) // NOVO ESTADO
  const leftScrollRef  = useRef(null)
  const rightScrollRef = useRef(null)

  const handleScroll = (e, targetRef) => {
    if (targetRef.current) {
      targetRef.current.scrollTop  = e.target.scrollTop
      targetRef.current.scrollLeft = e.target.scrollLeft
    }
  }

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        onAccept();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAccept]);

  const [copiedAll, setCopiedAll] = useState(false);
  const handleCopyAll = () => {
    navigator.clipboard.writeText(newCode);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // ── 1. SE A IA PEDIU PARA EXCLUIR ──────────────────────────────────────────
  if (isDelete) {
    // ... [MANTENHA O CÓDIGO DE DELETE EXISTENTE AQUI]
    const hasContent = oldCode && oldCode.trim().length > 0
    return (
      <div style={{ padding: 30, color: C.text, height: '100%', overflowY: 'auto' }}>
        <div style={{ background: C.dangerDim, border: `1px solid ${C.danger}`, padding: 20, borderRadius: 12 }}>
          <h2 style={{ color: C.danger, marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            🗑️ Exclusão Solicitada pela IA
          </h2>
          <p style={{ color: C.textDim, marginBottom: 20 }}>
            A IA solicitou a exclusão permanente de {fileName}.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 20 }}>
            <button onClick={onReject} style={{ padding: '8px 16px', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>✕ Rejeitar</button>
            <button onClick={onAccept} style={{ padding: '8px 16px', background: C.danger, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>✓ Confirmar</button>
          </div>
        </div>
      </div>
    )
  }

  // Lógica para definir se foi uma Falha Total ou Sucesso Parcial
  const isTotalFailure = searchFailed && (oldCode === newCode);
  const isPartialSuccess = searchFailed && (oldCode !== newCode);

  // ── 2. SE FALHOU TUDO (FALHA TOTAL) ────────────────────────────────────────
  if (isTotalFailure) {
    const handleCopyBlock = (text, setter) => {
      navigator.clipboard.writeText(text)
      setter(true)
      setTimeout(() => setter(false), 2000)
    }

    return (
      <div style={{ padding: 30, color: C.text, height: '100%', overflowY: 'auto' }}>
        <div style={{ background: C.warningDim, border: `1px solid ${C.warning}`, padding: 20, borderRadius: 12 }}>
          <h2 style={{ color: C.warning, marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            ⚠️ A IA não encontrou o trecho exato para substituir
          </h2>
          <p style={{ color: C.textDim, marginBottom: 20 }}>
            Nenhuma das alterações pôde ser aplicada automaticamente. Copie os trechos abaixo manualmente.
          </p>

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: C.danger, fontSize: 12 }}>TRECHO PROCURADO:</strong>
              <pre style={{ background: C.bg, padding: 15, borderRadius: 8, fontSize: 12, border: `1px solid ${C.border}`, overflowX: 'auto' }}>{searchedBlock}</pre>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ color: C.success, fontSize: 12 }}>NOVO CÓDIGO:</strong>
                <button onClick={() => handleCopyBlock(suggestedBlock, setCopiedNew)} style={{ fontSize: 10, padding: '4px 8px', background: C.successDim, color: copiedNew ? C.success : C.textMuted, border: `1px solid ${C.success}33`, borderRadius: 4, cursor: 'pointer' }}>{copiedNew ? '✓ Copiado!' : '📋 Copiar'}</button>
              </div>
              <pre style={{ background: C.bg, padding: 15, borderRadius: 8, fontSize: 12, border: `1px solid ${C.border}`, overflowX: 'auto' }}>{suggestedBlock}</pre>
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onReject} style={{ padding: '8px 16px', background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>Fechar e Descartar</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Lógica do Diff (Para Sucesso e Sucesso Parcial) ────────────────────────
  const oldLines = (oldCode || '').split('\n')
  const newLines = (newCode || '').split('\n')

  let start = 0
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++

  let oldEnd = oldLines.length - 1
  let newEnd = newLines.length - 1
  while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) { oldEnd--; newEnd-- }

  const CONTEXT_LINES = 4
  const displayStart   = Math.max(0, start - CONTEXT_LINES)
  const displayOldEnd  = Math.min(oldLines.length, oldEnd + CONTEXT_LINES + 1)
  const displayNewEnd  = Math.min(newLines.length, newEnd + CONTEXT_LINES + 1)

  // Verifica se a visualização parcial já mostra o arquivo inteiro
  const isAlreadyFull = (displayOldEnd - displayStart >= oldLines.length) &&
                        (displayNewEnd - displayStart >= newLines.length)

  const oldSlice   = showFullFile ? oldLines : oldLines.slice(displayStart, displayOldEnd)
  const newSlice   = showFullFile ? newLines : newLines.slice(displayStart, displayNewEnd)
  const lineOffset = showFullFile ? 0 : displayStart

  const renderLines = (lines, isOld, offset = 0, overrideColor = null) =>
    lines.map((line, idx) => {
      const realIdx   = idx + offset
      const isChanged = isOld
        ? (realIdx >= start && realIdx <= oldEnd)
        : (realIdx >= start && realIdx <= newEnd)

      let bg        = 'transparent'
      let color     = C.textDim
      let indicator = ' '

      if (overrideColor) {
        bg        = `${overrideColor}15`
        color     = overrideColor
        indicator = '+'
      } else if (isChanged) {
        bg        = isOld ? '#E84A5A22' : '#22C55E22'
        color     = isOld ? C.danger : C.success
        indicator = isOld ? '-' : '+'
      }

      return (
        <div
          key={realIdx}
          style={{ display: 'flex', background: bg, color, minWidth: 'max-content', cursor: (isChanged || overrideColor) ? 'help' : 'default' }}
          onMouseEnter={() => (isChanged || overrideColor) && analysisText && setAnalysisVisible(true)}
          onMouseLeave={() => setAnalysisVisible(false)}
        >
          <div style={{ width: 45, flexShrink: 0, textAlign: 'right', paddingRight: 10, color: C.textMuted, userSelect: 'none', background: C.elevated, borderRight: `1px solid ${C.border}`, fontSize: 11, paddingTop: 1 }}>
            {realIdx + 1}
          </div>
          <div style={{ paddingLeft: 10, whiteSpace: 'pre', paddingRight: 20 }}>
            <span style={{ userSelect: 'none', opacity: 0.5, marginRight: 5 }}>{indicator}</span>{line}
          </div>
        </div>
      )
    })

  const cleanAnalysis   = (analysisText || '').replace(/```[\s\S]*?```/g, '[bloco de código]').replace(/<[^>]+>/g, '').replace(/[#*`]/g, '').trim()
  const previewAnalysis = cleanAnalysis.length > 450 ? cleanAnalysis.substring(0, 450) + '…' : cleanAnalysis

  // Contagem de linhas alteradas para mostrar no header
  const changedLinesCount = isNew ? newLines.length : Math.max(oldEnd - start + 1, newEnd - start + 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, overflow: 'hidden', position: 'relative' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 15px', background: C.surface, borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            {isCopy ? '📋 Copiando para:' : (isNew ? '✨ Criando:' : '✏️ Mudanças em:')}{' '}
            <span style={{ color: isNew || isCopy ? C.teal : C.warning, fontFamily: 'monospace' }}>
              {parseGMLFilename(fileName)}
            </span>
            
            {/* Mostrar arquivo de origem se for cópia */}
            {isCopy && (
              <span style={{ fontSize: 10, color: C.purple, fontWeight: 'bold', marginLeft: 10, background: C.purpleDim, padding: '2px 6px', borderRadius: 4 }}>
                ← Vem de: {parseGMLFilename(fromPath)}
              </span>
            )}

            {!isNew && !isCopy && (
              <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 'normal', marginLeft: 10 }}>
                {changedLinesCount} linha(s) modificada(s)
              </span>
            )}
          </span>
          <span style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            💬 Passe o mouse sobre o código para ver o contexto e a análise.
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          
          <button
            onClick={handleCopyAll}
            style={{ padding: '6px 14px', borderRadius: 6, background: C.bg, color: copiedAll ? C.success : C.textDim, border: `1px solid ${copiedAll ? C.success : C.border}`, cursor: 'pointer', fontSize: 11, marginRight: 10, transition: 'all 0.15s' }}
          >
            {copiedAll ? '✓ Copiado!' : '📋 Copiar Código Todo'}
          </button>

          {!isNew && !isAlreadyFull && (
            <button
              onClick={() => setShowFullFile(v => !v)}
              style={{ padding: '6px 14px', borderRadius: 6, background: showFullFile ? C.accentDim : C.bg, color: showFullFile ? C.accent : C.textDim, border: `1px solid ${showFullFile ? C.accent + '55' : C.border}`, cursor: 'pointer', fontSize: 11, marginRight: 10, transition: 'all 0.15s' }}
            >
              {showFullFile ? '📍 Mostrar só a mudança' : '📄 Ver arquivo completo'}
            </button>
          )}
          {!isNew && isAlreadyFull && (
            <span style={{ fontSize: 10, color: C.textMuted, marginRight: 10, fontStyle: 'italic' }}>
              Arquivo inteiro visível
            </span>
          )}
          <button onClick={onReject} style={{ padding: '6px 14px', borderRadius: 6, background: C.dangerDim, color: C.danger, border: `1px solid ${C.danger}44`, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>✕ Rejeitar</button>
          <button onClick={onAccept} title="Atalho: Ctrl + Enter" style={{ padding: '6px 14px', borderRadius: 6, background: C.successDim, color: C.success, border: `1px solid ${C.success}44`, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>✓ Aceitar (Ctrl+Enter)</button>
        </div>
      </div>
      
      {/* ── BANNER DE SUCESSO PARCIAL (NOVO) ───────────────────────────────── */}
      {isPartialSuccess && (
        <div style={{ flexShrink: 0, background: C.warningDim, borderBottom: `1px solid ${C.warning}55`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 15px' }}>
            <span style={{ color: C.warning, fontSize: 12 }}>
              ⚠️ <b>Atenção:</b> Algumas modificações extras sugeridas pela IA falharam ao buscar o código original (mas as alterações abaixo <b>deram certo</b>).
            </span>
            <button 
              onClick={() => setShowFailedBlocks(!showFailedBlocks)} 
              style={{ background: 'transparent', border: `1px solid ${C.warning}`, color: C.warning, padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
            >
              {showFailedBlocks ? 'Ocultar Erros' : 'Ver Trechos Falhos'}
            </button>
          </div>
          
          {showFailedBlocks && (
            <div style={{ display: 'flex', gap: 15, padding: 15, background: C.bg, borderTop: `1px dashed ${C.warning}55`, maxHeight: 250, overflowY: 'auto' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: C.danger, fontSize: 10 }}>FALHOU EM ACHAR:</strong>
                <pre style={{ background: C.elevated, padding: 10, borderRadius: 6, fontSize: 11, border: `1px solid ${C.border}`, marginTop: 4 }}>{searchedBlock}</pre>
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ color: C.success, fontSize: 10 }}>A IA QUERIA TROCAR POR:</strong>
                <pre style={{ background: C.elevated, padding: 10, borderRadius: 6, fontSize: 11, border: `1px solid ${C.border}`, marginTop: 4 }}>{suggestedBlock}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Labels das colunas ─────────────────────────────────────────────── */}
      {!isNew && (
        <div style={{ display: 'flex', background: C.elevated, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: C.danger, borderRight: `1px solid ${C.border}` }}>
            ANTES {!showFullFile && !isAlreadyFull ? `(linhas ${displayStart + 1}–${displayOldEnd})` : '(arquivo inteiro)'}
          </div>
          <div style={{ flex: 1, padding: '4px 12px', fontSize: 10, fontWeight: 700, color: C.success }}>
            DEPOIS {!showFullFile && !isAlreadyFull ? `(linhas ${displayStart + 1}–${displayNewEnd})` : '(arquivo inteiro)'}
          </div>
        </div>
      )}

      {/* ── Área de diff ou Código Novo Único ──────────────────────────────── */}
      {isNew ? (
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
          {renderLines(newLines, false, 0, C.teal)}
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div
            ref={leftScrollRef}
            onScroll={e => handleScroll(e, rightScrollRef)}
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', borderRight: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'monospace' }}
          >
            {renderLines(oldSlice, true, lineOffset)}
          </div>
          <div
            ref={rightScrollRef}
            onScroll={e => handleScroll(e, leftScrollRef)}
            style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}
          >
            {renderLines(newSlice, false, lineOffset)}
          </div>
        </div>
      )}

      {/* ── Painel de análise da IA (hover) ───────────────────────────────── */}
      {analysisVisible && previewAnalysis && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: C.elevated + 'FA', borderTop: `2px solid ${C.accent}`,
          padding: '12px 20px', maxHeight: 200, overflowY: 'auto',
          backdropFilter: 'blur(8px)', zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {previewAnalysis}
          </div>
        </div>
      )}

    </div>
  )
}