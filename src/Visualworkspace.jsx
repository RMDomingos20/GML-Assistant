// ============================================================
// VisualWorkspace.jsx  —  v4 (Relationship Map + Full Repo Mode)
// Workspace visual drag-and-drop estilo Game Maker Studio.
// Cada nó = um OBJETO/ITEM do projeto.
//
// Novidades v4:
//  - Prop `allFiles` para popular o canvas com o repositório inteiro
//  - Botão "Relacionamentos" no toolbar flutuante
//  - Overlay SVG de linhas linkando nós relacionados
//  - Nós "relacionados" ficam destacados ao selecionar um nó
//  - Peso de cada nó visível no rodapé do card
// ============================================================
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { C, parseGMLFilename } from './constants'
import { buildRelationships, REL_COLORS, REL_TYPES } from './relationshipAnalyzer'

// ── Layout Padrão ───────────────────────────────────────────
const GRID_SIZE      = 26
const DEFAULT_NODE_W = 400
const DEFAULT_NODE_H = 240

// ── Ícones por categoria de asset ───────────────────────────
const CATEGORY_ICONS = {
  objects:    '🎮', scripts:    '📜', rooms:      '🏠',
  fonts:      '🔤', sounds:     '🔊', sprites:    '🖼️',
  shaders:    '⚡', notes:      '📝', sequences:  '🎞️',
  timelines:  '⏱️', paths:      '〰️', extensions: '🔌',
}

// ── Helpers de path ─────────────────────────────────────────
function getGroupKey(filePath) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0]
}

function getCategory(filePath) {
  return filePath.replace(/\\/g, '/').split('/')[0] || 'scripts'
}

function getEventLabel(filePath) {
  const full = parseGMLFilename(filePath)
  const sep  = full.indexOf(' › ')
  return sep >= 0 ? full.slice(sep + 3) : full
}

/**
 * buildGroups — modo "tabs" (comportamento original)
 * Só mostra nós que têm tab aberta.
 */
function buildGroupsFromTabs(tabs) {
  const map = {}
  tabs.forEach(tab => {
    const gk  = getGroupKey(tab.path)
    const cat = getCategory(tab.path)
    if (!map[gk]) map[gk] = { category: cat, events: {} }
    if (!map[gk].events[tab.path]) map[gk].events[tab.path] = { file: null, diff: null }
    if (tab.type === 'diff') map[gk].events[tab.path].diff = tab
    else                     map[gk].events[tab.path].file = tab
  })
  return map
}

/**
 * buildGroupsFromFiles — modo "repositório" (novo)
 * Mostra todos os assets do projeto. Tabs abertas ficam "ativas" dentro do nó.
 * Faz merge: prioriza tab aberta sobre conteúdo bruto do files.
 */
function buildGroupsFromFiles(allFiles, tabs) {
  const map = {}

  // Indexa as tabs para merge rápido
  const tabIndex = {}
  tabs.forEach(tab => {
    if (!tabIndex[tab.path]) tabIndex[tab.path] = {}
    if (tab.type === 'diff') tabIndex[tab.path].diff = tab
    else                     tabIndex[tab.path].file = tab
  })

  Object.keys(allFiles).forEach(filePath => {
    const gk  = getGroupKey(filePath)
    const cat = getCategory(filePath)

    if (!map[gk]) map[gk] = { category: cat, events: {} }
    if (!map[gk].events[filePath]) {
      // Cria um "tab fantasma" com o conteúdo do arquivo para exibir no nó
      const existing = tabIndex[filePath] || {}
      map[gk].events[filePath] = {
        file: existing.file || { id: `ghost_${filePath}`, type: 'file', path: filePath, content: allFiles[filePath] },
        diff: existing.diff || null,
      }
    }
  })

  // Inclui diffs órfãos (arquivos novos que ainda não existem em allFiles)
  tabs.forEach(tab => {
    if (tab.type === 'diff' && tab.isNew && !allFiles[tab.path]) {
      const gk  = getGroupKey(tab.path)
      const cat = getCategory(tab.path)
      if (!map[gk]) map[gk] = { category: cat, events: {} }
      if (!map[gk].events[tab.path]) map[gk].events[tab.path] = { file: null, diff: null }
      map[gk].events[tab.path].diff = tab
    }
  })

  return map
}

// ── Grid de pontos escalonável ──────────────────────────────
function GridBackground({ pan, zoom }) {
  const scaledSize = GRID_SIZE * zoom
  const ox = ((pan.x % scaledSize) + scaledSize) % scaledSize
  const oy = ((pan.y % scaledSize) + scaledSize) % scaledSize
  const radius = Math.max(0.5, 1 * zoom)

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <pattern id="gms-grid" x={ox} y={oy} width={scaledSize} height={scaledSize} patternUnits="userSpaceOnUse">
          <circle cx={radius} cy={radius} r={radius} fill={C.border + 'aa'} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#gms-grid)" />
    </svg>
  )
}

// ── Preview de diff compacto ─────────────────────────────────
function DiffPreview({ oldCode, newCode, isNew, isDelete }) {
  if (isNew) return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.success, fontWeight: 'bold', marginBottom: 6 }}>✦ NOVO ARQUIVO</div>
      <pre style={{ margin: 0, fontSize: 10.5, fontFamily: 'monospace', color: C.success + 'cc', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {(newCode || '').slice(0, 900)}{(newCode || '').length > 900 ? '\n···' : ''}
      </pre>
    </div>
  )

  if (isDelete) return (
    <div style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: C.danger, fontWeight: 'bold', marginBottom: 6 }}>🗑 EXCLUSÃO SOLICITADA</div>
      <pre style={{ margin: 0, fontSize: 10.5, fontFamily: 'monospace', color: C.danger + 'aa', lineHeight: 1.55, textDecoration: 'line-through', whiteSpace: 'pre-wrap' }}>
        {(oldCode || '').slice(0, 600)}
      </pre>
    </div>
  )

  const oldLines = (oldCode || '').split('\n')
  const newLines = (newCode || '').split('\n')
  const MAX = 40
  const lines = []
  let oi = 0, ni = 0
  while ((oi < oldLines.length || ni < newLines.length) && lines.length < MAX) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      lines.push({ t: '=', v: oldLines[oi] }); oi++; ni++
    } else if (oi < oldLines.length) {
      lines.push({ t: '-', v: oldLines[oi] }); oi++
    } else {
      lines.push({ t: '+', v: newLines[ni] }); ni++
    }
  }

  return (
    <div style={{ padding: '6px 0' }}>
      {lines.map((ln, i) => (
        <div key={i} style={{
          padding: '0 14px',
          background: ln.t === '-' ? `${C.danger}1a` : ln.t === '+' ? `${C.success}1a` : 'transparent',
          borderLeft: ln.t === '-' ? `2px solid ${C.danger}` : ln.t === '+' ? `2px solid ${C.success}` : '2px solid transparent',
          fontSize: 10.5, fontFamily: 'monospace', lineHeight: '18px',
          color: ln.t === '-' ? C.danger : ln.t === '+' ? C.success : C.textMuted,
          whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {ln.t === '-' ? '− ' : ln.t === '+' ? '+ ' : '  '}{ln.v}
        </div>
      ))}
      {lines.length >= MAX && (
        <div style={{ padding: '4px 14px', fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>···</div>
      )}
    </div>
  )
}

// ── Barra de peso do nó ──────────────────────────────────────
function WeightBar({ weight, isSelected, isRelated }) {
  const MAX = 5
  const color = isSelected ? C.accent : isRelated ? C.teal : C.purple
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 12px 5px',
      borderTop: `1px solid ${C.border}`,
      background: C.code,
    }}>
      <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>peso IA</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: MAX }).map((_, i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i < weight ? color : C.border,
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      {(isSelected || isRelated) && (
        <span style={{ fontSize: 9, color: color, marginLeft: 'auto' }}>
          {isSelected ? '● selecionado' : '◎ relacionado'}
        </span>
      )}
    </div>
  )
}

// ── Nó de objeto/asset ───────────────────────────────────────
function ObjectNode({
  groupKey, category, events,
  pos, size, isDragging,
  activeEventPath, onEventSelect,
  onDragStart, onResizeStart,
  onAccept, onReject, onCloseGroup,
  weight, isSelected, isRelated,
  showRelationships, onSelect,
}) {
  const icon       = CATEGORY_ICONS[category] || '📄'
  const eventPaths = Object.keys(events)
  const hasDiff    = eventPaths.some(p => !!events[p].diff)
  const allDiffs   = eventPaths.map(p => events[p].diff).filter(Boolean)

  const shownEv   = events[activeEventPath] || events[eventPaths[0]]
  const activeTab = shownEv?.diff || shownEv?.file

  const w = size?.w || DEFAULT_NODE_W;
  const h = size?.h || DEFAULT_NODE_H;

  // Cor da borda: selecionado > relacionado > diff > default
  const borderColor = isSelected
    ? C.accent
    : isRelated
      ? `${C.teal}88`
      : hasDiff
        ? `${C.warning}55`
        : C.border

  return (
    <div
      style={{
        position: 'absolute', left: pos.x, top: pos.y,
        width: w,
        display: 'flex', flexDirection: 'column',
        zIndex: isDragging ? 100 : isSelected ? 50 : 1,
        filter: isDragging
          ? 'drop-shadow(0 14px 40px rgba(0,0,0,0.8))'
          : isSelected
            ? `drop-shadow(0 0 14px ${C.accent}55)`
            : 'drop-shadow(0 4px 18px rgba(0,0,0,0.5))',
        transition: isDragging ? 'none' : 'filter 0.2s',
      }}
    >
      {hasDiff && (
        <div
          style={{
            background: 'linear-gradient(135deg,#1c1500,#1a1200)',
            border: `1px solid ${C.warning}77`, borderBottom: 'none',
            borderRadius: '10px 10px 0 0', padding: '10px 14px',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: `${C.warning}20`, border: `1px solid ${C.warning}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, animation: 'vw-pulse 2.2s infinite ease-in-out',
            }}>🤖</div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: C.warning }}>
                IA sugere {allDiffs.length > 1 ? `${allDiffs.length} modificações` : 'uma modificação'}
              </div>
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {allDiffs.map(d => getEventLabel(d.path)).join(' · ')}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
              <button
                onClick={async () => {
                  for (const d of allDiffs) { await onAccept(d) }
                }}
                style={{ padding: '4px 12px', fontSize: 11, fontWeight: 'bold', background: C.success, border: 'none', color: '#000', borderRadius: 5, cursor: 'pointer' }}
              >✓ Aceitar</button>
              <button
                onClick={() => allDiffs.forEach(d => onReject(d))}
                style={{ padding: '4px 12px', fontSize: 11, background: 'transparent', border: `1px solid ${C.danger}66`, color: C.danger, borderRadius: 5, cursor: 'pointer' }}
              >✕ Rejeitar</button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          background: C.elevated, position: 'relative',
          border: `1px solid ${borderColor}`,
          borderRadius: hasDiff ? '0 0 10px 10px' : 10,
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          transition: 'border-color 0.2s',
        }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
            background: C.surface, borderBottom: `1px solid ${C.border}`,
            cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none',
          }}
          onMouseDown={e => { e.stopPropagation(); onDragStart(e) }}
        >
          <div style={{ display: 'flex', gap: 4, marginRight: 2, flexShrink: 0 }}>
            {['#ff5f57','#ffbd2e','#28c840'].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c, opacity: 0.9 }} />)}
          </div>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 'bold', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {groupKey}
          </span>
          <span style={{ fontSize: 10, color: C.textMuted, background: C.bg, padding: '2px 7px', borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0 }}>
            {eventPaths.length} evs
          </span>

          {/* Botão de selecionar para relacionamentos */}
          {showRelationships && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(groupKey) }}
              onMouseDown={e => e.stopPropagation()}
              title={isSelected ? 'Desselecionar' : 'Ver relacionamentos'}
              style={{
                background: isSelected ? C.accent : 'none',
                border: `1px solid ${isSelected ? C.accent : C.border}`,
                color: isSelected ? '#000' : C.textMuted,
                cursor: 'pointer', fontSize: 11, borderRadius: 4,
                padding: '1px 6px', flexShrink: 0,
              }}
            >⬡</button>
          )}

          <button onClick={onCloseGroup} onMouseDown={e => e.stopPropagation()} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>

        <div className="vw-event-tabs" style={{ display: 'flex', overflowX: 'auto', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          {eventPaths.map(filePath => {
            const ev        = events[filePath]
            const hasDiffEv = !!ev.diff
            const isActive  = filePath === activeEventPath
            const tabColor  = hasDiffEv ? C.warning : C.accent

            return (
              <button
                key={filePath}
                onClick={() => onEventSelect(filePath)}
                onMouseDown={e => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                  fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
                  background: isActive ? C.elevated : 'transparent', border: 'none',
                  borderBottom: isActive ? `2px solid ${tabColor}` : '2px solid transparent',
                  color: isActive ? (hasDiffEv ? C.warning : C.text) : (hasDiffEv ? C.warning + 'aa' : C.textMuted),
                  cursor: 'pointer', fontWeight: isActive ? 'bold' : 'normal', transition: 'all 0.12s',
                }}
              >
                {hasDiffEv && <span style={{ fontSize: 8, background: C.warning, color: '#000', borderRadius: 3, padding: '1px 4px', fontWeight: 'bold' }}>IA</span>}
                {getEventLabel(filePath)}
                {isActive && hasDiffEv && (
                  <span style={{ display: 'flex', gap: 3, marginLeft: 3 }}>
                    <span onClick={e => { e.stopPropagation(); onAccept(ev.diff) }} style={{ fontSize: 11, color: C.success, cursor: 'pointer', fontWeight: 'bold' }}>✓</span>
                    <span onClick={e => { e.stopPropagation(); onReject(ev.diff) }} style={{ fontSize: 11, color: C.danger, cursor: 'pointer' }}>✕</span>
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ height: h, overflow: 'auto', background: C.bg, position: 'relative' }}>
          {!activeTab ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, fontSize: 12 }}>Sem conteúdo</div>
          ) : activeTab.type === 'diff' ? (
            <>
              <div style={{ position: 'sticky', top: 0, zIndex: 2, background: `${C.warning}18`, borderBottom: `1px solid ${C.warning}33`, padding: '4px 12px', fontSize: 10, color: C.warning, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>⚠️ Diff proposto pela IA</span>
                <span onClick={() => onAccept(activeTab)} style={{ cursor: 'pointer', color: C.success, fontWeight: 'bold', padding: '1px 7px', borderRadius: 3, border: `1px solid ${C.success}55` }}>✓ Aceitar</span>
                <span onClick={() => onReject(activeTab)} style={{ cursor: 'pointer', color: C.danger, padding: '1px 7px', borderRadius: 3, border: `1px solid ${C.danger}55` }}>✕ Rejeitar</span>
              </div>
              <DiffPreview oldCode={activeTab.oldCode} newCode={activeTab.newCode} isNew={activeTab.isNew} isDelete={activeTab.isDelete} />
            </>
          ) : (
            <pre style={{ margin: 0, padding: '12px 14px', fontSize: 11, fontFamily: 'monospace', color: C.textDim, lineHeight: 1.55, whiteSpace: 'pre', overflowX: 'auto' }}>
              {(activeTab.content || '').slice(0, 2200)}{(activeTab.content?.length || 0) > 2200 ? '\n\n···' : ''}
            </pre>
          )}
        </div>

        {/* Barra de peso — só visível se relacionamentos estiver ativo */}
        {showRelationships && (
          <WeightBar weight={weight || 1} isSelected={isSelected} isRelated={isRelated} />
        )}

        {/* Botão de Resize na Canto Inferior Direito */}
        <div
          onMouseDown={e => { e.stopPropagation(); onResizeStart(e); }}
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 18, height: 18, cursor: 'nwse-resize', zIndex: 10,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 4
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 1L9 9L1 9" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  )
}

// ── Overlay SVG de relacionamentos ───────────────────────────
// Renderiza as linhas FORA da camada de pan/zoom para não distorcer
// — as coordenadas são calculadas em espaço de tela (getBoundingClientRect).
function RelationshipOverlay({ links, positions, sizes, zoom, pan, selectedNode, canvasRef }) {
  const [lines, setLines] = useState([])

  useEffect(() => {
    if (!canvasRef.current) return

    const canvasRect = canvasRef.current.getBoundingClientRect()

    // Converte posição de nó (espaço world) para espaço de tela
    const worldToScreen = (pos, size) => {
      const w = size?.w || DEFAULT_NODE_W
      const h = size?.h || DEFAULT_NODE_H
      return {
        cx: pan.x + (pos.x + w / 2) * zoom,
        cy: pan.y + (pos.y + h / 2) * zoom,
      }
    }

    const newLines = []
    const relevantLinks = selectedNode
      ? links.filter(l => l.from === selectedNode || l.to === selectedNode)
      : links

    relevantLinks.forEach(link => {
      const posFrom = positions[link.from]
      const posTo   = positions[link.to]
      if (!posFrom || !posTo) return

      const a = worldToScreen(posFrom, sizes[link.from])
      const b = worldToScreen(posTo,   sizes[link.to])

      newLines.push({ ...link, x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy })
    })

    setLines(newLines)
  }, [links, positions, sizes, zoom, pan, selectedNode])

  if (lines.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 200,
      }}
    >
      <defs>
        {Object.entries(REL_COLORS).map(([type, color]) => (
          <marker
            key={type}
            id={`arrow-${type}`}
            viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse"
          >
            <path d="M2 1L8 5L2 9" fill="none" stroke={color} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>

      {lines.map((line, i) => {
        const color = REL_COLORS[line.type] || C.purple
        const dx = line.x2 - line.x1
        const dy = line.y2 - line.y1
        const mx = (line.x1 + line.x2) / 2 - dy * 0.15
        const my = (line.y1 + line.y2) / 2 + dx * 0.15

        const isHighlighted = !selectedNode || line.from === selectedNode || line.to === selectedNode
        const opacity = isHighlighted ? 0.8 : 0.15

        return (
          <g key={i} opacity={opacity}>
            <path
              d={`M${line.x1},${line.y1} Q${mx},${my} ${line.x2},${line.y2}`}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeDasharray="6 3"
              markerEnd={`url(#arrow-${line.type})`}
            />
            {isHighlighted && (
              <text
                x={(line.x1 + line.x2) / 2}
                y={my - 6}
                textAnchor="middle"
                fill={color}
                fontSize="10"
                fontFamily="monospace"
              >
                {line.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Legenda de tipos de relacionamento ───────────────────────
function RelLegend() {
  const items = [
    { type: REL_TYPES.CALL,       label: 'Chamada de script' },
    { type: REL_TYPES.FUNC_DEF,   label: 'Usa função' },
    { type: REL_TYPES.SHADER,     label: 'shader_set()' },
    { type: REL_TYPES.GLOBAL_VAR, label: 'global.*' },
  ]
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'center',
      background: C.surface + 'ee', backdropFilter: 'blur(6px)',
      padding: '5px 12px', borderRadius: 7,
      border: `1px solid ${C.border}`, fontSize: 10,
    }}>
      {items.map(item => (
        <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 18, height: 2, borderTop: `2px dashed ${REL_COLORS[item.type]}` }} />
          <span style={{ color: C.textMuted }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Componente Raiz ──────────────────────────────────────────
export default function VisualWorkspace({ tabs, allFiles, onAccept, onReject, onClose }) {
  const [pan, setPan]               = useState({ x: 60, y: 60 })
  const [zoom, setZoom]             = useState(0.6)
  const [isPanning, setIsPanning]   = useState(false)
  const panRef  = useRef(null)
  const canvasRef = useRef(null)

  const [dragging, setDragging]     = useState(null)
  const dragRef = useRef(null)

  const [resizing, setResizing]     = useState(null)
  const resizeRef = useRef(null)

  const [positions, setPositions]   = useState({})
  const [sizes, setSizes]           = useState({})
  const [activeEvent, setActiveEvent] = useState({})

  // ── Estado do modo de relacionamentos ──
  const [showRelationships, setShowRelationships] = useState(false)
  const [selectedNode, setSelectedNode]           = useState(null)
  const [lastMiddleClick, setLastMiddleClick] = useState(0)

  // ── Modo: repositório ou só tabs abertas ──
  // Se allFiles foi passado e tem conteúdo, usa modo repositório
  const hasRepo = allFiles && Object.keys(allFiles).length > 0
  const groups  = useMemo(() => {
    if (hasRepo) return buildGroupsFromFiles(allFiles, tabs)
    return buildGroupsFromTabs(tabs)
  }, [hasRepo, allFiles, tabs])

  const entries = Object.entries(groups)

  // ── Análise de relacionamentos (recalcula quando files mudam) ──
  const { links, weights } = useMemo(
    () => (hasRepo ? buildRelationships(allFiles) : { links: [], weights: {} }),
    [allFiles, hasRepo]
  )

  // ── Nós relacionados ao selecionado ──
  const relatedNodes = useMemo(() => {
    if (!selectedNode) return new Set()
    const s = new Set()
    links.forEach(l => {
      if (l.from === selectedNode) s.add(l.to)
      if (l.to   === selectedNode) s.add(l.from)
    })
    return s
  }, [selectedNode, links])

  // ── Algoritmo de "Sistema Solar" + "Grid de Órfãos" ──
  useEffect(() => {
    setPositions(prev => {
      const next = { ...prev }
      
      let unplaced = entries.map(e => e[0]).filter(k => !next[k])
      if (unplaced.length === 0) return next

      unplaced.sort((a, b) => (weights[b] || 1) - (weights[a] || 1))

      const placed = new Set()
      let clusterX = 200
      let clusterY = 200
      let maxRowHeight = 800

      // FASE 1: Montagem dos Sistemas Solares
      while (unplaced.length > 0) {
        const root = unplaced[0] 
        
        const neighbors = new Set()
        links.forEach(l => {
          if (l.from === root && !placed.has(l.to) && unplaced.includes(l.to)) neighbors.add(l.to)
          if (l.to === root && !placed.has(l.from) && unplaced.includes(l.from)) neighbors.add(l.from)
        })

        // Se esse nó não possui "planetas" pra puxar, ele e o resto da fila são órfãos.
        // Interrompe o loop de galáxias e manda todos para a Grade Final (Fase 2).
        if (neighbors.size === 0) {
          break; 
        }

        unplaced.shift() // Remove o root da fila
        if (placed.has(root)) continue

        next[root] = { x: clusterX, y: clusterY }
        placed.add(root)

        const neighborsArray = Array.from(neighbors)
        let clusterWidth = DEFAULT_NODE_W
        let clusterHeight = DEFAULT_NODE_H

        neighborsArray.forEach((neighbor, i) => {
          const orbitLevel = Math.floor(i / 10) + 1
          const nodesInThisOrbit = Math.min(10, neighborsArray.length - (orbitLevel - 1) * 10)
          
          const radiusX = 650 * orbitLevel
          const radiusY = 500 * orbitLevel
          
          const angleStep = (Math.PI * 2) / nodesInThisOrbit
          const angle = (i % 10) * angleStep + (orbitLevel * 0.5) 

          next[neighbor] = {
            x: clusterX + Math.cos(angle) * radiusX,
            y: clusterY + Math.sin(angle) * radiusY
          }
          placed.add(neighbor)
          
          clusterWidth = Math.max(clusterWidth, radiusX * 2.2)
          clusterHeight = Math.max(clusterHeight, radiusY * 2.2)
        })

        unplaced = unplaced.filter(k => !placed.has(k)) // Limpa os vizinhos colocados

        clusterX += clusterWidth + 600
        maxRowHeight = Math.max(maxRowHeight, clusterHeight)

        if (clusterX > 6000) {
          clusterX = 200
          clusterY += maxRowHeight + 600
          maxRowHeight = 800
        }
      }

      // FASE 2: Alojamento dos Órfãos (Grid Compacta)
      if (unplaced.length > 0) {
        let orphanX = 200
        let orphanY = 200
        
        // Acha o ponto mais baixo do projeto atual para posicionar os órfãos abaixo de tudo
        Object.values(next).forEach(pos => {
          if (pos.y > orphanY) orphanY = pos.y
        })
        orphanY += 800 // Margem inferior
        
        const initialOrphanY = orphanY

        unplaced.forEach(orphan => {
          if (placed.has(orphan)) return
          
          next[orphan] = { x: orphanX, y: orphanY }
          placed.add(orphan)
          
          orphanX += DEFAULT_NODE_W + 150 // Espaçamento normal
          
          // Quebra de linha da Grid (Mais curta que a galáxia, tela mais limpa)
          if (orphanX > 5000) {
            orphanX = 200
            orphanY += DEFAULT_NODE_H + 150
          }
        })

        // Centraliza a grade de órfãos visualmente
        const lastRowWidth = orphanX - 200;
        if (lastRowWidth < 4800 && orphanY > initialOrphanY) {
            // (Opcional, mas deixa a estética de grade intacta)
        }
      }
      
      return next
    })
  }, [entries.length, links, weights])

  useEffect(() => {
    entries.forEach(([key, { events }]) => {
      if (!activeEvent[key]) {
        const paths    = Object.keys(events)
        const diffPath = paths.find(p => !!events[p].diff)
        const def      = diffPath || paths[0]
        if (def) setActiveEvent(prev => ({ ...prev, [key]: def }))
      }
    })
  }, [tabs])

  // ── Handlers do mouse e Zoom ──
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prevZoom => {
      let newZoom = Math.min(Math.max(0.15, prevZoom * zoomDelta), 3)
      setPan(prevPan => {
        const mouseX = e.clientX
        const mouseY = e.clientY
        const unscaledX = (mouseX - prevPan.x) / prevZoom
        const unscaledY = (mouseY - prevPan.y) / prevZoom
        return { x: mouseX - unscaledX * newZoom, y: mouseY - unscaledY * newZoom }
      })
      return newZoom
    })
  }, [])

  // ── 1. Função Inteligente de Enquadramento ──
  const recenterView = useCallback(() => {
    if (entries.length === 0) {
      setPan({ x: 60, y: 60 }); setZoom(0.6); return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Descobre as bordas extremas do projeto
    Object.entries(positions).forEach(([key, pos]) => {
      const size = sizes[key] || { w: DEFAULT_NODE_W, h: DEFAULT_NODE_H };
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + size.w > maxX) maxX = pos.x + size.w;
      if (pos.y + size.h > maxY) maxY = pos.y + size.h;
    });

    if (minX === Infinity) return;

    const padding = 200;
    const contentWidth = (maxX - minX) + padding * 2;
    const contentHeight = (maxY - minY) + padding * 2;
    
    const viewportWidth = canvasRef.current ? canvasRef.current.clientWidth : window.innerWidth;
    const viewportHeight = canvasRef.current ? canvasRef.current.clientHeight : window.innerHeight;

    // Calcula o zoom exato para caber tudo na tela (limitado entre 15% e 100%)
    const zoomX = viewportWidth / contentWidth;
    const zoomY = viewportHeight / contentHeight;
    const newZoom = Math.max(0.15, Math.min(zoomX, zoomY, 1)); 

    // Calcula a posição de Pan para centralizar
    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    setZoom(newZoom);
    setPan({
      x: (viewportWidth / 2) - (centerX * newZoom),
      y: (viewportHeight / 2) - (centerY * newZoom)
    });
  }, [positions, sizes, entries.length]);

  // ── 2. Novo Handler de Clique (Com detecção de Duplo Clique no Meio) ──
  const handleBgDown = useCallback((e) => {
    const isCanvas = e.target === e.currentTarget || e.target.dataset.canvas
    if (isCanvas) {
      // Verifica clique do meio (Wheel/Scroll)
      if (e.button === 1) {
        const now = Date.now()
        // Se clicou duas vezes rápido (menos de 400ms)
        if (now - lastMiddleClick < 400) {
          recenterView()
          setLastMiddleClick(0)
          return
        }
        setLastMiddleClick(now)
      }

      setIsPanning(true)
      panRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    }
  }, [pan, lastMiddleClick, recenterView])

  const handleMouseMove = useCallback((e) => {
    if (isPanning && panRef.current) {
      setPan({ x: panRef.current.px + e.clientX - panRef.current.mx, y: panRef.current.py + e.clientY - panRef.current.my })
    }
    if (dragging && dragRef.current) {
      const target = dragging
      const newX = dragRef.current.ox + (e.clientX - dragRef.current.mx) / zoom
      const newY = dragRef.current.oy + (e.clientY - dragRef.current.my) / zoom
      setPositions(prev => ({ ...prev, [target]: { x: newX, y: newY } }))
    }
    if (resizing && resizeRef.current) {
      const target = resizing
      const newW = Math.max(280, resizeRef.current.ow + (e.clientX - resizeRef.current.mx) / zoom)
      const newH = Math.max(100, resizeRef.current.oh + (e.clientY - resizeRef.current.my) / zoom)
      setSizes(prev => ({ ...prev, [target]: { w: newW, h: newH } }))
    }
  }, [isPanning, dragging, resizing, zoom])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false); setDragging(null); setResizing(null)
    panRef.current = null; dragRef.current = null; resizeRef.current = null
  }, [])

  const startNodeDrag = useCallback((key, e) => {
    e.preventDefault()
    const pos = positions[key] || { x: 0, y: 0 }
    setDragging(key)
    dragRef.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }
  }, [positions])

  const startNodeResize = useCallback((key, e) => {
    e.preventDefault()
    const size = sizes[key] || { w: DEFAULT_NODE_W, h: DEFAULT_NODE_H }
    setResizing(key)
    resizeRef.current = { mx: e.clientX, my: e.clientY, ow: size.w, oh: size.h }
  }, [sizes])

  const closeGroup = useCallback((events) => {
    Object.values(events).forEach(({ file, diff }) => {
      // Nós "fantasma" (modo repositório) não têm tab real para fechar
      if (file && !file.id?.startsWith('ghost_')) onClose(file.id)
      if (diff) onClose(diff.id)
    })
  }, [onClose])

  const handleSelectNode = useCallback((groupKey) => {
    setSelectedNode(prev => prev === groupKey ? null : groupKey)
  }, [])

  // Desmarca ao desativar modo relacionamentos
  const handleToggleRelationships = useCallback(() => {
    setShowRelationships(prev => {
      if (prev) setSelectedNode(null)
      return !prev
    })
  }, [])

  return (
    <>
      <style>{`
        @keyframes vw-pulse { 0%,100% { transform:scale(0.9); opacity:0.6; } 50% { transform:scale(1.1); opacity:1; } }
        .vw-event-tabs { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
        .vw-event-tabs::-webkit-scrollbar { height: 3px; }
        .vw-event-tabs::-webkit-scrollbar-thumb { background:${C.border}; border-radius:2px; }
      `}</style>

      <div
        ref={canvasRef}
        style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: C.bg, cursor: isPanning ? 'grabbing' : 'default' }}
        onMouseDown={handleBgDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        data-canvas="true"
      >
        <GridBackground pan={pan} zoom={zoom} />

        {/* Overlay SVG de relacionamentos (fora da camada de zoom) */}
        {showRelationships && links.length > 0 && (
          <RelationshipOverlay
            links={links}
            positions={positions}
            sizes={sizes}
            zoom={zoom}
            pan={pan}
            selectedNode={selectedNode}
            canvasRef={canvasRef}
          />
        )}

        {entries.length === 0 && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: C.textMuted, textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.25 }}>🎮</div>
            <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Visual Workspace Vazio</div>
            <div style={{ fontSize: 12 }}>Abra um arquivo ou peça à IA para modificar o projeto</div>
          </div>
        )}

        {/* Camada que aplica o Pan e o Zoom */}
        <div
          data-canvas="true"
          style={{
            position: 'absolute', top: 0, left: 0,
            transformOrigin: '0 0',
            transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`
          }}
        >
          {entries.map(([groupKey, { category, events }]) => {
            const pos      = positions[groupKey] || { x: 0, y: 0 }
            const size     = sizes[groupKey] || { w: DEFAULT_NODE_W, h: DEFAULT_NODE_H }
            const evPath   = activeEvent[groupKey] || Object.keys(events)[0]
            const isSelected = showRelationships && selectedNode === groupKey
            const isRelated  = showRelationships && selectedNode !== null && relatedNodes.has(groupKey)

            return (
              <ObjectNode
                key={groupKey} groupKey={groupKey} category={category} events={events}
                pos={pos} size={size} isDragging={dragging === groupKey} activeEventPath={evPath}
                onEventSelect={fp => setActiveEvent(prev => ({ ...prev, [groupKey]: fp }))}
                onDragStart={e => startNodeDrag(groupKey, e)}
                onResizeStart={e => startNodeResize(groupKey, e)}
                onAccept={onAccept} onReject={onReject} onCloseGroup={() => closeGroup(events)}
                weight={weights[groupKey] || 1}
                isSelected={isSelected}
                isRelated={isRelated}
                showRelationships={showRelationships}
                onSelect={handleSelectNode}
              />
            )
          })}
        </div>

        {/* UI Flutuante: Controles de Zoom */}
        <div style={{
          position: 'absolute', bottom: 10, left: 12, display: 'flex', gap: 6,
          background: C.surface + 'ee', backdropFilter: 'blur(6px)', padding: 6,
          borderRadius: 8, border: `1px solid ${C.border}`,
        }}>
          <button onClick={() => setZoom(prev => Math.max(0.15, prev * 0.8))}
            style={{ width: 24, height: 24, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
          <button onClick={() => { setZoom(1); setPan({x: 60, y: 60}); }}
            style={{ padding: '0 8px', fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: 'pointer' }}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
            style={{ width: 24, height: 24, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>

        {/* UI Flutuante: Botão Relacionamentos */}
        <div style={{
          position: 'absolute', bottom: 10, left: 130, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button
            onClick={handleToggleRelationships}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '5px 13px', fontSize: 11, cursor: 'pointer',
              background: showRelationships ? C.purpleDim : C.surface + 'ee',
              backdropFilter: 'blur(6px)',
              border: `1px solid ${showRelationships ? C.purple : C.border}`,
              borderRadius: 7,
              color: showRelationships ? C.purple : C.textMuted,
              fontWeight: showRelationships ? 'bold' : 'normal',
              transition: 'all 0.2s',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: showRelationships ? C.purple : C.textMuted,
              flexShrink: 0,
            }} />
            Relacionamentos
          </button>

          {showRelationships && links.length > 0 && <RelLegend />}
        </div>

        {/* UI Flutuante: Rodapé Info */}
        <div style={{
          position: 'absolute', bottom: 10, right: 12, fontSize: 10, color: C.textMuted,
          background: C.surface + 'ee', backdropFilter: 'blur(6px)', padding: '4px 12px',
          borderRadius: 6, border: `1px solid ${C.border}`, pointerEvents: 'none', display: 'flex', gap: 10,
        }}>
          <span>🖱 Arraste p/ mover | Rolar p/ zoom</span>
          <span style={{ color: C.border }}>|</span>
          <span>{entries.length} {entries.length === 1 ? 'item' : 'itens'}</span>
          {hasRepo && <><span style={{ color: C.border }}>|</span><span style={{ color: C.teal }}>● repositório</span></>}
        </div>
      </div>
    </>
  )
}