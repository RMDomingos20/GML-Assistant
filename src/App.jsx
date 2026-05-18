import React, { useState, useEffect, useRef } from 'react'
import ModelHub from './ModelHub'
import SettingsModal from './SettingsModal'
import DiffViewer from './DiffViewer'
import TitleBar from './TitleBar'
import { 
  C, estimateTokens, formatTokens, ONLINE_PROVIDERS, parseGMLFilename, 
  SYSTEM_PROMPT, SYSTEM_PROMPT_LOCAL, INFERENCE_PARAMS
} from './constants'
import { soundManager } from './soundManager'
import VisualWorkspace from './VisualWorkspace'
import { buildRelationships } from './relationshipAnalyzer'

const TextRenderer = ({ text }) => {
  const html = text
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, `<h3 style="margin-top: 16px; margin-bottom: 8px; color: ${C.accent};">$1</h3>`)
    .replace(/^## (.*$)/gim, `<h2 style="margin-top: 18px; margin-bottom: 8px; color: ${C.teal}; border-bottom: 1px solid ${C.border}; padding-bottom: 4px;">$1</h2>`)
    .replace(/^# (.*$)/gim, `<h1 style="margin-top: 20px; margin-bottom: 10px; color: ${C.text};">$1</h1>`)
    .replace(/\*\*(.*?)\*\*/g, `<strong style="color: ${C.text};">$1</strong>`)
    .replace(/`([^`]+)`/g, `<code style="background: ${C.border}; padding: 2px 6px; border-radius: 4px; color: ${C.purple}; font-family: monospace; font-size: 0.9em;">$1</code>`)
    .replace(/\n/g, '<br />')

  return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.6, fontSize: 13, color: C.textDim }} />
}

const CodeBlock = ({ language, code }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ margin: '12px 0', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.elevated, padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', fontWeight: 'bold' }}>
          {language || 'code'}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleCopy} style={{ background: 'none', border: 'none', color: copied ? C.success : C.textMuted, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }}>
            {copied ? '✓ COPIADO' : '📋 COPIAR'}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }}>
            {collapsed ? '▼ EXPANDIR' : '▲ OCULTAR'}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div style={{ padding: 12, overflowX: 'auto', background: C.code }}>
          <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#E2E8F8' }}>{code}</pre>
        </div>
      )}
    </div>
  )
}

const MessageRenderer = ({ content, isStreaming }) => {
  if (!content) return null

  const parts = []
  const lines = content.split('\n')
  let inCodeBlock = false
  let currentLang = ''
  let currentBlock = []

  lines.forEach((line) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        parts.push({ type: 'code', language: currentLang, content: currentBlock.join('\n') })
        inCodeBlock = false
        currentBlock = []
      } else {
        if (currentBlock.length > 0) {
          parts.push({ type: 'text', content: currentBlock.join('\n') })
          currentBlock = []
        }
        inCodeBlock = true
        currentLang = line.trim().replace('```', '')
      }
    } else {
      currentBlock.push(line)
    }
  })

  if (currentBlock.length > 0) {
    if (inCodeBlock) {
      parts.push({ type: 'code', language: currentLang, content: currentBlock.join('\n') })
    } else {
      parts.push({ type: 'text', content: currentBlock.join('\n') })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {parts.map((part, idx) => {
        const isLast = idx === parts.length - 1
        if (part.type === 'text') {
          return (
            <div key={idx}>
              <TextRenderer text={part.content} />
              {isStreaming && isLast && !inCodeBlock && <span className="cursor" style={cursorStyle}></span>}
            </div>
          )
        } else {
          return (
            <div key={idx}>
              <CodeBlock language={part.language} code={part.content} />
              {isStreaming && isLast && inCodeBlock && <span className="cursor" style={cursorStyle}></span>}
            </div>
          )
        }
      })}
      {isStreaming && parts.length === 0 && <span className="cursor" style={cursorStyle}></span>}
    </div>
  )
}

const cursorStyle = { display: 'inline-block', width: 6, height: 12, background: C.accent, marginLeft: 5, verticalAlign: 'middle' }

export default function App() {
  const [appSettings, setAppSettings] = useState(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)

  const [projectPath, setProjectPath] = useState(null)
  const [files, setFiles] = useState({})
  const [relationships, setRelationships] = useState({ links: [], weights: {} })

  const [showArtifactModal, setShowArtifactModal]   = useState(false)
  const [artifactScanResult, setArtifactScanResult] = useState(null) 
  
  const [workspaceTabs, setWorkspaceTabs] = useState([])
  const [activeTabId, setActiveTabId] = useState(null)
  const [downloads, setDownloads] = useState({})

  const [undoStack, setUndoStack] = useState([])

  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('gml_chat_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [chatPanelWidth, setChatPanelWidth] = useState(420) // 420 | 650 | 260

  // ── Painel esquerdo retrátil ──
  const [leftCollapsed, setLeftCollapsed] = useState(false)

  // ── Modo do workspace: 'code' | 'visual' ──
  const [workspaceMode, setWorkspaceMode] = useState('code')

  const [inputText, setInputText] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [aiStatus, setAiStatus] = useState("ready")
  const [streamingText, setStreamingText] = useState("")
  
  const chatScrollRef = useRef(null)
  const textareaRef = useRef(null)
  
  const [showModelHub, setShowModelHub] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedModel, setSelectedModel] = useState(null)

  const getChatBlockReason = () => {
    if (!appSettings?.aiMode)
      return '⚙️ Configure o modo de IA em "Configs" para começar.'
    if (appSettings.aiMode === 'local') {
      if (!selectedModel)
        return '🤖 Selecione um modelo local clicando em "Modelos".'
      if (aiStatus === 'loading')
        return '⏳ Aguarde — carregando o modelo de IA na memória...'
      if (aiStatus.includes('Erro') || aiStatus.includes('error'))
        return `❌ Erro ao carregar modelo. Tente um modelo menor ou ajuste o contexto em Configs.\nDetalhe: ${aiStatus}`
    }
    if (appSettings.aiMode === 'online') {
      if (!appSettings?.onlineKey?.trim() && !appSettings?.onlineBaseUrl?.includes('localhost') && !appSettings?.onlineBaseUrl?.includes('ollama'))
        return '🔑 Insira sua API Key em "⚙️ Configs" para usar o modo nuvem.'
      if (aiStatus.includes('Erro') || aiStatus.includes('error'))
        return `❌ Erro na API online: ${aiStatus}. Verifique a API Key e URL em Configs.`
    }
    return null
  }
  const chatBlockReason = getChatBlockReason()
  
  useEffect(() => {
    try {
      const toSave = chatHistory.slice(-50)
      localStorage.setItem('gml_chat_history', JSON.stringify(toSave))
    } catch {}
  }, [chatHistory])

  useEffect(() => {
    window.electron.getSettings().then(s => {
      setAppSettings(s)
      setIsLoadingSettings(false)

      soundManager.setVolume(s.audioVolume ?? 0.5)

      if (s.aiMode) {
        if (s.playIntroOnStartup !== false) {
          soundManager.play('intro.mp3')
        }
        
        setChatHistory(prev => {
          if (prev.length === 0) {
            return [{ 
              role: 'assistant', 
              analysis: 'Olá! Sou seu GML Assistant. 🎮\nEstou pronto para ajudar você a programar, criar sistemas ou corrigir bugs no seu projeto. O que vamos fazer hoje?' 
            }]
          }
          return prev;
        });

        if (s.aiMode === 'local') {
          const saved = localStorage.getItem('selected_model')
          if (saved) handleModelChange(JSON.parse(saved), s, true) 
        } else if (s.aiMode === 'online') {
          setAiStatus("ready (Online)")
        }
      }
    })
    
  }, [])

  useEffect(() => {
    const handleDl = (data) => setDownloads(prev => ({ ...prev, [data.modelId]: data }))
    const handleOllama = (data) => {
      const pct = data.completed && data.total ? Math.round((data.completed / data.total) * 100) : -1
      const id = `ollama:${data.modelName}`
      setDownloads(prev => ({ ...prev, [id]: { modelId: id, pct, downloaded: data.completed || 0, total: data.total || 0 } }))
      if (data.status === 'success') {
        setTimeout(() => setDownloads(prev => { const n = { ...prev }; delete n[id]; return n }), 2000)
      }
    }
    
    window.electron?.on('download-progress', handleDl)
    window.electron?.on('ollama-pull-progress', handleOllama)
    
    return () => {
      window.electron?.off('download-progress', handleDl)
      window.electron?.off('ollama-pull-progress', handleOllama)
    }
  }, [])

  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (isNearBottom || isProcessing) {
      el.scrollTop = el.scrollHeight
    }
  }, [chatHistory, streamingText, isProcessing])

  // Listener do Watcher (Monitoramento ao Vivo do GameMaker)
  useEffect(() => {
    const handleFileChange = (data) => {
      // 1. Atualiza a lista de arquivos lateral
      setFiles(prev => {
        const newFiles = { ...prev }
        if (data.type === 'delete') {
          delete newFiles[data.path]
        } else {
          newFiles[data.path] = data.content
        }
        return newFiles
      })

      // 2. Se o usuário estiver com o arquivo aberto na tab, atualiza lá também
      setWorkspaceTabs(prevTabs => prevTabs.map(tab => {
        if (tab.type === 'file' && tab.path === data.path) {
          if (data.type === 'delete') {
            return { ...tab, content: '// Arquivo foi excluído fora do assistente.' }
          }
          return { ...tab, content: data.content }
        }
        return tab
      }))
    }

    window.electron?.on('file-changed', handleFileChange)
    return () => {
      window.electron?.off('file-changed', handleFileChange)
    }
  }, [])

  const handleSetupComplete = async (mode, onlineConfig) => {
    const newSettings = { ...appSettings, aiMode: mode, ...onlineConfig }
    await window.electron.saveSettings(newSettings)
    setAppSettings(newSettings)
    if (mode === 'online') setAiStatus("ready (Online)")
    soundManager.play('intro.mp3')
  }

  const handleModelChange = async (model, currentSettings = appSettings, isStartup = false) => {
    setSelectedModel(model)
    localStorage.setItem('selected_model', JSON.stringify(model))

    if (model && model.isNative) {
      setAiStatus("loading")
      try {
        const result = await window.electron.startNativeModel({
          modelPath: model.localPath,
          contextSize: currentSettings.contextSize,
          gpuLayers: currentSettings.gpuLayers === 999 ? 'auto' : currentSettings.gpuLayers,
          kvCacheType: currentSettings.kvCacheType ?? 'f16'
        })
        if (result.warning) {
          console.warn(result.warning)
          setChatHistory(prev => [...prev, { role: 'system_msg', content: `⚠️ ${result.warning}` }])
        }
        if (!result.ok) throw new Error(result.error)
        setAiStatus("ready")
        setIsModelLoaded(true)
      } catch (e) {
        console.error(e)
        setAiStatus("Erro de Memória")
        setIsModelLoaded(false)
        if (!isStartup) {
          setChatHistory(prev => [...prev, { role: 'error', content: `❌ Erro ao carregar modelo: ${e.message}\n\nVá em "⚙️ Configs" e diminua o "Tamanho do Contexto" ou as "Camadas na GPU".` }])
        }
      }
    } else {
      setAiStatus("ready")
    }
  }

  const handleUnloadModel = async () => {
    try {
      await window.electron.unloadNativeModel?.()
    } catch {}
    setIsModelLoaded(false)
    setSelectedModel(null)
    setAiStatus("ready")
    localStorage.removeItem('selected_model')
    setChatHistory(prev => [...prev, { role: 'system_msg', content: '🔌 IA descarregada da memória.' }])
  }

  const handleSettingsSave = (newSettings) => {
    setAppSettings(newSettings)
    soundManager.setVolume(newSettings.audioVolume ?? 1.0)
    if (newSettings.aiMode === 'online') {
      setAiStatus("ready (Online)")
    } else if (selectedModel?.isNative) {
      handleModelChange(selectedModel, newSettings)
    }
  }

  const handleSelectFolder = async () => {
    const folderPath = await window.electron.selectProject()
    if (folderPath) {
      setProjectPath(folderPath)
      const loadedFiles = await window.electron.readProjectFolder(folderPath)
      setFiles(loadedFiles)

      // ATUALIZADO:
      const relData = buildRelationships(loadedFiles)
      setRelationships(relData)

      setWorkspaceTabs([])
      setArtifactScanResult(null)
      setShowArtifactModal(true)

      window.electron.watchProject(folderPath)
    }
  }

  const openFileTab = (path) => {
    const existingTab = workspaceTabs.find(t => t.path === path && t.type === 'file')
    if (existingTab) {
      setActiveTabId(existingTab.id)
    } else {
      const newTab = { id: `file_${Date.now()}`, type: 'file', path, content: files[path] }
      setWorkspaceTabs(prev => [...prev, newTab])
      setActiveTabId(newTab.id)
    }
  }

  const closeTab = (e, id) => {
    if (e && e.stopPropagation) e.stopPropagation()
    
    setWorkspaceTabs(prev => {
      const index = prev.findIndex(t => t.id === id)
      const closedTab = prev[index]
      const newTabs = prev.filter(t => t.id !== id)
      
      if (activeTabId === id) {
        if (closedTab && closedTab.type === 'diff') {
          const nextDiff = newTabs.find(t => t.type === 'diff')
          if (nextDiff) {
            setActiveTabId(nextDiff.id)
            return newTabs
          }
        }
        if (newTabs.length > 0) {
          const nextIndex = Math.min(index, newTabs.length - 1)
          setActiveTabId(newTabs[nextIndex].id)
        } else {
          setActiveTabId(null)
        }
      }
      return newTabs
    })
  }

  const openDiffTabs = (changes, analysisText = '') => {
    if (!changes || changes.length === 0) return

    const recentUserMsgs = chatHistory
      .filter(m => m.role === 'user')
      .slice(-3)
      .map(m => `❯ ${m.content.substring(0, 130)}${m.content.length > 130 ? '…' : ''}`)
      .join('\n')

    const newTabs = changes.map(ch => {
      const fileName = ch.path.split(/[\/\\]/).pop().replace(/\.(gml|fsh|vsh|json|txt)$/i, '').toLowerCase()
      const paragraphs = analysisText.split(/\n{2,}/)
      const relevant = paragraphs.filter(p => p.toLowerCase().includes(fileName))
      const fileSpecificAnalysis = relevant.length > 0 ? relevant.join('\n\n') : analysisText.substring(0, 600)

      const isNew = !files[ch.path] && !ch.isDelete;
      let typeLabel = "✏️ MODIFICAÇÃO DE CÓDIGO";
      if (ch.isDelete) typeLabel = "🗑️ EXCLUSÃO DE ARQUIVO";
      else if (ch.isCopy) typeLabel = "📋 CÓPIA DE ARQUIVO";
      else if (isNew) typeLabel = "✨ CRIAÇÃO DE ARQUIVO";

      const fullAnalysis = `🏷️ AÇÃO: ${typeLabel}\n\n🗨️ CONTEXTO DA CONVERSA:\n${recentUserMsgs || 'Nenhum'}\n\n💡 ANÁLISE:\n${fileSpecificAnalysis}`

      return {
        id: `diff_${Date.now()}_${Math.random()}`, type: 'diff',
        path: ch.path,
        oldCode: files[ch.path] || "",
        newCode: ch.newCode,
        analysisText: fullAnalysis,
        searchFailed: ch.searchFailed,
        suggestedBlock: ch.suggestedBlock,
        searchedBlock: ch.searchedBlock,
        isDelete: ch.isDelete,
        isNew: isNew,
        isCopy: ch.isCopy,
        fromPath: ch.fromPath
      }
    })
    setWorkspaceTabs(prev => [...prev.filter(t => !(t.type === 'diff' && changes.some(c => c.path === t.path))), ...newTabs])
    setActiveTabId(newTabs[0].id)
  }

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1]
    if (!last) return

    let response;
    if (last.code === undefined) {
      response = await window.electron.deleteFile({ folderPath: projectPath, relativePath: last.path })
    } else {
      response = await window.electron.saveFile({ folderPath: projectPath, relativePath: last.path, content: last.code })
    }

    if (response.ok) {
      setFiles(prev => {
        const n = { ...prev }
        if (last.code === undefined) delete n[last.path]
        else n[last.path] = last.code
        return n
      })
      setUndoStack(prev => prev.slice(0, -1))
      setChatHistory(prev => [...prev, { role: 'system_msg', content: `↩ Desfeito: ${last.path.split(/[\/\\]/).pop()}` }])
      soundManager.play('acepted.mp3')
    }
  }

  const handleApplyChange = async (tab) => {
    if (!projectPath) return alert("Projeto não selecionado.")

    setUndoStack(prev => [...prev.slice(-9), { path: tab.path, code: files[tab.path] }])

    if (tab.isDelete) {
      try {
        const response = await window.electron.deleteFile({ folderPath: projectPath, relativePath: tab.path })
        if (response.ok) {
          const remainingTabs = workspaceTabs.filter(t => t.id !== tab.id && t.path !== tab.path)
          const nextDiff = remainingTabs.find(t => t.type === 'diff')
          const nextId = nextDiff ? nextDiff.id : (remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].id : null)

          setFiles(prev => { const n = { ...prev }; delete n[tab.path]; return n })
          setWorkspaceTabs(remainingTabs)
          setActiveTabId(nextId)
          
          setChatHistory(prev => [...prev, { 
            role: 'system_msg', 
            content: `🗑️ Arquivo apagado do disco: ${tab.path.split(/[\/\\]/).pop()}\n\n⚠️ Vá no GameMaker e exclua o item que ficou com o triângulo amarelo para limpar o projeto.` 
          }])
        } else {
          setChatHistory(prev => [...prev, { role: 'error', content: `Erro ao excluir: ${response.error}` }])
        }
      } catch (e) {
        setChatHistory(prev => [...prev, { role: 'error', content: `Erro ao excluir: ${e.message}` }])
      }
      return
    }

    try {
      const response = await window.electron.saveFile({
        folderPath: projectPath,
        relativePath: tab.path,
        content: tab.newCode
      })
      
      if (response.ok) {
        soundManager.play('acepted.mp3')
        const newId = `file_${Date.now()}`
        const remainingDiff = workspaceTabs.find(t => t.type === 'diff' && t.id !== tab.id)

        setFiles(prev => ({ ...prev, [tab.path]: tab.newCode }))

        // [BUG FIX] No modo visual, remove a tab diff completamente em vez de
        // converter para file — o node do VisualWorkspace já exibe o conteúdo.
        // No modo código, converte para file normalmente para manter a aba aberta.
        if (workspaceMode === 'visual') {
          setWorkspaceTabs(prev => prev.filter(t => t.id !== tab.id))
          setActiveTabId(remainingDiff ? remainingDiff.id : null)
        } else {
          setWorkspaceTabs(prev =>
            prev.map(t =>
              t.id === tab.id
                ? { id: newId, type: 'file', path: tab.path, content: tab.newCode }
                : t
            )
          )
          setActiveTabId(remainingDiff ? remainingDiff.id : newId)
        }
        
        if (response.isNew) {
          if (response.autoRegistered) {
            // [BUG FIX] Asset registrado automaticamente no .yyp → GameMaker detecta sozinho
            setChatHistory(prev => [...prev, { 
              role: 'system_msg', 
              content: `✨ Asset criado e registrado no projeto!\n\nO GameMaker Studio deve detectar o novo item automaticamente.\n⚠️ Se não aparecer, salve o projeto no GameMaker (Ctrl+S) para forçar a atualização.` 
            }])
          } else {
            // Fallback: tipo de asset não suportado para auto-registro (ex: rooms, sequences)
            setChatHistory(prev => [...prev, { 
              role: 'system_msg', 
              content: `✨ Arquivo Gerado!\nUma janela de pasta foi aberta.\n\n👉 Arraste o arquivo selecionado para dentro do GameMaker para importá-lo.` 
            }])
          }
        } else {
          setChatHistory(prev => [...prev, { 
            role: 'system_msg', 
            content: `✅ Arquivo modificado com sucesso: ${tab.path.split(/[\/\\]/).pop()}` 
          }])
        }
      } else {
        setChatHistory(prev => [...prev, { role: 'error', content: `Erro ao salvar: ${response.error}` }])
      }
    } catch (e) {
      setChatHistory(prev => [...prev, { role: 'error', content: `Erro ao salvar: ${e.message}` }])
    }
  }

  const handleDeleteFile = async (e, pathToDelete) => {
    e.stopPropagation()
    
    const confirm = window.confirm(`Tem certeza absoluta que deseja' excluir o arquivo:\n${pathToDelete}\n\nIsso irá apagá-lo do GameMaker também. Esta ação não pode ser desfeita.`)
    if (!confirm) return

    const response = await window.electron.deleteFile({ folderPath: projectPath, relativePath: pathToDelete })
    
    if (response.ok) {
      setFiles(prev => {
        const newFiles = { ...prev }
        delete newFiles[pathToDelete]
        return newFiles
      })

      setWorkspaceTabs(prev => {
        const newTabs = prev.filter(t => t.path !== pathToDelete)
        if (activeTabId && !newTabs.find(t => t.id === activeTabId)) {
          setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
        }
        return newTabs
      })

      setChatHistory(prev => [...prev, { role: 'system_msg', content: `🗑️ Arquivo excluído: ${pathToDelete.split(/[\/\\]/).pop()}` }])
    } else {
      alert(`Erro ao excluir: ${response.error}`)
    }
  }

  // ── NOVA FUNÇÃO ROBUST REPLACE (Mais Segura) ──
  const robustReplace = (originalCode, searchBlock, replaceBlock) => {
    // 1. Tentativa exata (mais rápida e precisa)
    if (originalCode.includes(searchBlock)) {
      return originalCode.replace(searchBlock, replaceBlock);
    }

    // 2. Normalização de quebras de linha
    const normOrig   = originalCode.replace(/\r\n/g, '\n')
    const normSearch = searchBlock.replace(/\r\n/g, '\n')
    if (normOrig.includes(normSearch)) {
      return normOrig.replace(normSearch, replaceBlock);
    }

    // 3. Tokenizador Avançado: Ignora espaços e comentários GML, preservando strings!
    const tokenize = (code) => {
      const tokens = []
      let inString = false, stringChar = ''
      let inLineComment = false, inBlockComment = false

      for (let i = 0; i < code.length; i++) {
        const c = code[i], next = code[i + 1] || ''

        // Pula comentários em bloco /* ... */
        if (inBlockComment) {
          if (c === '*' && next === '/') { inBlockComment = false; i++; }
          continue;
        }
        // Pula comentários de linha // ...
        if (inLineComment) {
          if (c === '\n' || c === '\r') inLineComment = false;
          continue;
        }
        // Identifica abertura de strings (protege URLs como http://)
        if (!inString && (c === '"' || c === "'")) {
          inString = true; stringChar = c;
          tokens.push({ char: c, idx: i });
          continue;
        }
        // Dentro de strings
        if (inString) {
          tokens.push({ char: c, idx: i });
          if (c === '\\') { // Caractere de escape \"
            tokens.push({ char: next, idx: i+1 });
            i++;
          } else if (c === stringChar) {
            inString = false;
          }
          continue;
        }
        // Identifica início de comentários
        if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
        if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }

        // Ignora espaços e quebras de linha
        if (/\s/.test(c)) continue;

        tokens.push({ char: c, idx: i })
      }
      return tokens
    }

    const origTokens   = tokenize(originalCode)
    const searchTokens = tokenize(searchBlock)

    if (searchTokens.length === 0) return null

    const origChars   = origTokens.map(t => t.char).join('')
    const searchChars = searchTokens.map(t => t.char).join('')

    const matchIdx = origChars.indexOf(searchChars)
    if (matchIdx === -1) return null // Falhou de vez

    // Mapeia de volta para as posições originais exatas
    const realStart = origTokens[matchIdx].idx
    const realEnd   = origTokens[matchIdx + searchTokens.length - 1].idx

    const before = originalCode.substring(0, realStart)
    const after  = originalCode.substring(realEnd + 1)

    return before + replaceBlock + after
  }

  // ── NOVO PARSE DA RESPOSTA (Resolve Tags Vazias e Markdown Intruso) ──
  const parseAIResponse = (rawText, currentFiles) => {
    let analysis = rawText;
    let firstTagIndex = rawText.length;

    const fileStates = { ...currentFiles };
    const finalChangesMap = new Map();

    const normalizePath = (p) => p.replace(/\\/g, '/');

    // Helper para limpar marcações Markdown de dentro do XML
    const cleanCodeBlock = (text) => {
      if (!text) return "";
      return text
        .replace(/^\s*```[a-zA-Z]*\s*\n?/i, '') // Remove inicio ```gml ou ```json
        .replace(/\n?\s*```\s*$/i, '')          // Remove final ```
        .replace(/^\n+|\n+$/g, '');             // Remove quebras de linha em excesso nas pontas
    };

    const getChangeEntry = (path) => {
      const normPath = normalizePath(path);
      if (!finalChangesMap.has(normPath)) {
        finalChangesMap.set(normPath, {
          path: normPath,
          oldCode: currentFiles[normPath] || "",
          newCode: currentFiles[normPath] || "",
          isDelete: false,
          isNew: false,
          isCopy: false,
          searchFailed: false,
          searchedBlock: "",
          suggestedBlock: ""
        });
      }
      return finalChangesMap.get(normPath);
    }

    // 1. COPY (O loop que estava faltando!)
    const copyRegex = /<copy\s+from=["']([^"']+)["']\s+to=["']([^"']+)["']\s*\/?>/gi;
    let copyMatch;
    while ((copyMatch = copyRegex.exec(rawText)) !== null) {
      if (copyMatch.index < firstTagIndex) firstTagIndex = copyMatch.index;
      
      const fromPath = normalizePath(copyMatch[1]);
      const toPath = normalizePath(copyMatch[2]);
      
      const entry = getChangeEntry(toPath);
      entry.isCopy = true;
      entry.fromPath = fromPath;
      entry.newCode = currentFiles[fromPath] || "// Código original não encontrado. Verifique o arquivo no Workspace.";
      fileStates[toPath] = entry.newCode;
    }
    
    // 2. FILE
    const fileRegex = /<file\s+path=["']([^"']+)["']>([\s\S]*?)<\/file>/gi;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(rawText)) !== null) {
      if (fileMatch.index < firstTagIndex) firstTagIndex = fileMatch.index;
      const path = normalizePath(fileMatch[1]);
      let code = cleanCodeBlock(fileMatch[2]);
      
      if (code === '') continue; // Escudo Anti-Wipe

      // Proteção: se o arquivo já existe e a IA tentou reescrever ele minúsculo, bloqueia
      if (currentFiles[path] && code.length < currentFiles[path].length * 0.15) continue;

      fileStates[path] = code;
      const entry = getChangeEntry(path);
      entry.newCode = code;
      if (!currentFiles[path]) entry.isNew = true;
    }

    // 3. CHANGE (Search & Replace)
    const changeRegex = /<change\s+path=["']([^"']+)["']>([\s\S]*?)<\/change>/gi;
    let changeMatch;
    while ((changeMatch = changeRegex.exec(rawText)) !== null) {
      if (changeMatch.index < firstTagIndex) firstTagIndex = changeMatch.index;
      const path = normalizePath(changeMatch[1]);
      const innerContent = changeMatch[2];
      
      const searchMatch = /<search>([\s\S]*?)<\/search>/i.exec(innerContent);
      const replaceMatch = /<replace>([\s\S]*?)<\/replace>/i.exec(innerContent);

      if (searchMatch && replaceMatch) {
        // Limpa formatação Markdown que a IA insistir em colocar
        const searchBlock = cleanCodeBlock(searchMatch[1]);
        const replaceBlock = cleanCodeBlock(replaceMatch[1]);
        
        if (replaceBlock === '' && searchBlock !== '') continue; // Escudo Anti-Wipe

        const currentCode = fileStates[path] || "";
        const newCode = robustReplace(currentCode, searchBlock, replaceBlock);
        const entry = getChangeEntry(path);

        if (newCode !== null) {
          if (newCode.trim() === '') continue; // Impede arquivo de ficar 100% vazio sem tag Delete
          fileStates[path] = newCode;
          entry.newCode = newCode;
        } else {
          entry.searchFailed = true;
          entry.searchedBlock += (entry.searchedBlock ? "\n\n--- PRÓXIMO BLOCO ---\n\n" : "") + searchBlock;
          entry.suggestedBlock += (entry.suggestedBlock ? "\n\n--- PRÓXIMO BLOCO ---\n\n" : "") + replaceBlock;
        }
      }
    }

    // 4. DELETE
    const deleteRegex = /<delete\s+path=["']([^"']+)["'](?:\s*\/>|>[\s\S]*?<\/delete>)/gi;
    let deleteMatch;
    while ((deleteMatch = deleteRegex.exec(rawText)) !== null) {
      if (deleteMatch.index < firstTagIndex) firstTagIndex = deleteMatch.index;
      const path = normalizePath(deleteMatch[1]);
      delete fileStates[path];
      
      const entry = getChangeEntry(path);
      entry.isDelete = true;
      entry.newCode = '';
    }

    if (firstTagIndex < rawText.length) {
      analysis = rawText.substring(0, firstTagIndex).trim();
    }

    // Cleanup de mensagem caso não tenha texto
    if (!analysis && finalChangesMap.size > 0) {
      const fileList = Array.from(finalChangesMap.keys()).map(p => p.split(/[/\\]/).pop()).join(', ')
      analysis = `✅ Modificações aplicadas em: **${fileList}**`
    }

    const changes = Array.from(finalChangesMap.values());
    return { analysis, changes };
  }

  const hideStreamingCode = (text) => {
    const tagIndexFile = text.search(/<file\s+path=/i)
    const tagIndexChange = text.search(/<change\s+path=/i)
    const tagIndexCopy = text.search(/<copy\s+from=/i)
    
    let minIndex = -1
    if (tagIndexFile !== -1) minIndex = tagIndexFile
    if (tagIndexChange !== -1) minIndex = minIndex === -1 ? tagIndexChange : Math.min(minIndex, tagIndexChange)
    if (tagIndexCopy !== -1) minIndex = minIndex === -1 ? tagIndexCopy : Math.min(minIndex, tagIndexCopy)

    if (minIndex !== -1) return text.substring(0, minIndex).trim() + "\n\n*[Enviando atualizações para o Workspace...]*"
    return text
  }

  const minifyGML = (code) => {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove blocos de comentário
      .replace(/\/\/.*/g, '')           // Remove comentários de linha
      .replace(/^\s*[\r\n]/gm, '')      // Remove linhas em branco
      .trim()
  }

  const handleAskAI = async () => {
    // 1. Validações iniciais
    if (!inputText.trim() || isProcessing) return
  
    const userPrompt = inputText
    setInputText('')
    setIsProcessing(true)
    setStreamingText('')
    
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    soundManager.play('sent.mp3')
  
    // Adiciona pergunta do usuário ao chat
    setChatHistory(prev => [...prev, { role: 'user', content: userPrompt }])
  
    const isLocalMode = !appSettings?.aiMode || appSettings.aiMode === 'local'
    const activeSystemPrompt = isLocalMode ? SYSTEM_PROMPT_LOCAL : SYSTEM_PROMPT
    const promptLower = userPrompt.toLowerCase()
    
    // 2. Cálculo de Orçamento de Memória (Contexto)
    const contextSizeLimit = appSettings?.contextSize || (isLocalMode ? 4096 : 32768)
    const tokensBudget = Math.floor(contextSizeLimit * (isLocalMode ? 0.50 : 0.75))
  
    // 3. Sistema de Pontuação de Relevância (RAG Local)
    const allEntries = Object.entries(files)
    let relevantFiles = []
    let repoContext = ""
    let sentFilesCount = 0
    
    const activeTabObj = workspaceTabs.find(t => t.id === activeTabId)
    const activeFilePath = activeTabObj ? activeTabObj.path : null
    const activeGroup = activeFilePath ? activeFilePath.split(/[\\/]/).slice(-2, -1)[0] : null
    const openFilePaths = workspaceTabs.filter(t => t.type === 'file' || t.type === 'diff').map(t => t.path)

    const stopWords = ['como', 'para', 'fazer', 'onde', 'qual', 'quem', 'aqui', 'esse', 'isso', 'esta', 'este', 'mais', 'pode', 'sobre', 'então', 'quando', 'algum', 'alguma', 'quero', 'preciso'];
    const keywords = promptLower.replace(/[^\w\s_]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !stopWords.includes(w))
    const technicalWords = userPrompt.match(/[a-zA-Z]+_[a-zA-Z0-9_]+/g) || []
  
    if (allEntries.length > 0) {
      const scored = allEntries.map(([path, content]) => {
        let score = 0
        const currentGroup = path.split(/[\\/]/).slice(-2, -1)[0]
        
        // PRIORIDADE 1: Arquivo que o usuário está olhando agora
        if (path === activeFilePath) score += 10000 
        
        // PRIORIDADE 2: Arquivos abertos em abas
        else if (openFilePaths.includes(path)) score += 2000

        // PRIORIDADE 3: Relacionamentos (Dependency Graph) usando a nova lógica de Links
        if (activeGroup && relationships.links) {
          // Se o arquivo ativo chama/usa o arquivo iterado
          const isDependency = relationships.links.some(l => l.from === activeGroup && l.to === currentGroup)
          if (isDependency) score += 5000 
          
          // Se o arquivo iterado é quem chama o arquivo ativo
          const isParent = relationships.links.some(l => l.to === activeGroup && l.from === currentGroup)
          if (isParent) score += 3000
        }

        // NOVO - PRIORIDADE ESPECIAL: Boost de Peso (Arquitetura central)
        // A IA agora saberá instintivamente quais arquivos são as "veias principais" do código
        if (relationships.weights && relationships.weights[currentGroup]) {
          score += (relationships.weights[currentGroup] - 1) * 300 // Nós com peso máximo 5 ganham +1200
        }

        // PRIORIDADE 4: Match de termos técnicos (variáveis, nomes de objetos)
        technicalWords.forEach(tw => {
          if (path.includes(tw)) score += 1500
          if (content.includes(tw)) score += 800
        })

        // PRIORIDADE 5: Match de palavras-chave simples
        keywords.forEach(kw => {
          if (path.toLowerCase().includes(kw)) score += 200
          if (content.toLowerCase().includes(kw)) score += 100
        })

        return { path, content, score, tokens: estimateTokens(content) }
      })
      
      // Ordena pelos mais relevantes primeiro
      const sorted = scored.sort((a, b) => b.score - a.score)
  
      // Preenche o contexto até atingir o limite de tokens
      let usedTokens = 0
      for (const entry of sorted) {
        if (usedTokens + entry.tokens > tokensBudget) break
        relevantFiles.push(entry)
        usedTokens += entry.tokens
      }
      
      sentFilesCount = relevantFiles.length
      if (relevantFiles.length > 0) {
        repoContext = `ARQUIVOS RELEVANTES (Use estes arquivos como base):\n\n` + 
          relevantFiles.map(e => `--- FILE: ${e.path} ---\n${minifyGML(e.content)}\n`).join('\n')
      }
    }
  
    // 4. Construção do Prompt Final
    const focusNote = activeFilePath ? `[FOCO ATUAL: O usuário está editando o arquivo "${activeFilePath}"]\n` : ""
    const treeLines = Object.entries(files).map(([p, c]) => `- ${p} (${c.split('\n').length} linhas)`)
    const treeContext = `ESTRUTURA DO PROJETO:\n${treeLines.join('\n')}\n\n`
    
    const fullPrompt = `${focusNote}${treeContext}${repoContext}\nSOLICITAÇÃO DO USUÁRIO: ${userPrompt}`
  
    // 5. Execução da Inferência (Local ou Online)
    try {
      let rawResponseText = ""
      
      if (isLocalMode) {
        // --- MODO LOCAL ---
        let writingSoundStarted = false
        const tokenHandler = ({ chunk, done, aborted }) => {
          if (aborted) { soundManager.stopWritingSound(); return }
          if (!done) {
            if (!writingSoundStarted && chunk) { soundManager.startWritingSound(); writingSoundStarted = true }
            rawResponseText += chunk
            setStreamingText(hideStreamingCode(rawResponseText))
          } else { soundManager.stopWritingSound() }
        }

        window.electron.on('llm-token', tokenHandler)
        const response = await window.electron.chatNativeModelStream({
          systemPrompt: activeSystemPrompt,
          userPrompt:   fullPrompt,
          temperature:  appSettings?.temperature ?? 0.3,
          maxTokens:    appSettings?.maxTokens ?? 2048,
        })
        setStreamingText("")
        if (response.aborted) rawResponseText += "\n\n*[Interrompido]*"
        else if (!response.ok) throw new Error(response.error)
        else if (!rawResponseText.trim() && response.data) rawResponseText = response.data

      } else {
        // --- MODO ONLINE (API) ---
        let writingSoundStarted = false
        const tokenHandler = ({ chunk, done, error, aborted }) => {
          if (aborted) { soundManager.stopWritingSound(); return }
          if (error) throw new Error(error)
          if (!done) {
            if (!writingSoundStarted && chunk) { soundManager.startWritingSound(); writingSoundStarted = true }
            rawResponseText += chunk
            setStreamingText(hideStreamingCode(rawResponseText))
          } else { soundManager.stopWritingSound() }
        }

        window.electron.on('online-llm-token', tokenHandler)
        const messages = [
          { role: 'system', content: activeSystemPrompt },
          ...chatHistory.slice(-6).map(m => ({ 
            role: m.role, 
            content: m.role === 'user' ? m.content : (m.raw || m.analysis) 
          })),
          { role: 'user', content: fullPrompt }
        ]

        const response = await window.electron.aiChatRequestStream({
          baseUrl: appSettings.onlineBaseUrl,
          headers: { 'Authorization': `Bearer ${appSettings.onlineKey}` },
          body: {
            model: appSettings.onlineModel,
            messages,
            temperature: appSettings.temperature ?? 0.3,
            max_tokens: appSettings.maxTokens === -1 ? undefined : appSettings.maxTokens,
          }
        })
        setStreamingText("")
        if (!response.ok) throw new Error(response.error)
      }
      
      // 6. Verificação de Integridade (Security Lock)
      // Se a resposta terminar com uma tag aberta, a IA provavelmente foi cortada por limite de tokens.
      const hasUnclosedTags = (
        (rawResponseText.includes('<change') && !rawResponseText.includes('</change>')) ||
        (rawResponseText.includes('<file') && !rawResponseText.includes('</file>')) ||
        (rawResponseText.includes('<search') && !rawResponseText.includes('</search>'))
      );

      if (hasUnclosedTags) {
        rawResponseText += "\n\n> ⚠️ **ERRO DE INTEGRIDADE:** O código foi cortado por limite de tokens. Alterações automáticas bloqueadas para evitar corrupção de arquivos.";
      }

      // 7. Processamento Final e UI
      const { analysis, changes } = parseAIResponse(rawResponseText, files)
      
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        analysis: analysis || rawResponseText,
        raw: rawResponseText,
        changes: hasUnclosedTags ? [] : changes, // Bloqueia mudanças se o código estiver incompleto
        filesAnalyzed: sentFilesCount
      }])

      if (changes.length > 0 && !hasUnclosedTags) {
        openDiffTabs(changes, analysis || rawResponseText)
      }
  
    } catch (e) {
      setStreamingText("")
      setChatHistory(prev => [...prev, { role: 'error', content: `Erro na IA: ${e.message}` }])
    } finally {
      window.electron.off('llm-token'); 
      window.electron.off('online-llm-token'); 
      soundManager.stopWritingSound()
      setIsProcessing(false)
      if (textareaRef.current) textareaRef.current.focus()
    }
  }

  const handleStopGeneration = async () => {
    // 1. Desabilita o status de "isProcessing" na UI imediatamente
    setIsProcessing(false)
    soundManager.stopWritingSound()
    
    // 2. Manda o backend acionar o Kill Switch do C++ (offline) ou cancelar a request (online)
    if (appSettings?.aiMode === 'online') {
      window.electron.abortOnlineGeneration?.()
    } else {
      window.electron.abortNativeGeneration?.()
    }
  }

  const handleClearChat = () => {
    setChatHistory([])
    setStreamingText("")
    localStorage.removeItem('gml_chat_history')
    if (selectedModel?.isNative) window.electron.resetNativeSession?.()
  }

  if (isLoadingSettings) {
    return (
      <div style={{ background: C.bg, height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.text }}>
        <div style={{ fontSize: 90, marginBottom: 20, animation: 'pulse 2s infinite ease-in-out' }}>🎮</div>
        <h1 style={{ color: C.accent, marginBottom: 10, fontWeight: 'bold' }}>GML Assistant</h1>
        <p style={{ color: C.textMuted, fontSize: 14 }}>Iniciando o cérebro da operação...</p>
        
        <style>{`
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.05); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
          }
        `}</style>
      </div>
    )
  }

  if (!appSettings.aiMode) {
    return <SetupWizard onComplete={handleSetupComplete} />
  }

  const activeTab = workspaceTabs.find(t => t.id === activeTabId)
  
  let totalChatTokens = 0
  chatHistory.forEach(msg => {
    totalChatTokens += estimateTokens(msg.content || msg.analysis || "")
    if (msg.changes) msg.changes.forEach(ch => totalChatTokens += estimateTokens(ch.code))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, overflow: 'hidden' }}>
      <TitleBar title="GML Assistant" subtitle={projectPath ? projectPath.split(/[\/\\]/).pop() : 'Nenhum projeto'} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* --- PAINEL ESQUERDO: ARQUIVOS (RETRÁTIL) --- */}
        <aside style={{
          width: leftCollapsed ? 44 : 240,
          background: C.elevated,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.22s ease',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {/* Cabeçalho: toggle + ações */}
          <div style={{ padding: leftCollapsed ? '8px 6px' : '10px 15px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
            {/* Botão de collapse SEMPRE visível */}
            <div style={{ display: 'flex', justifyContent: leftCollapsed ? 'center' : 'flex-end' }}>
              <button
                onClick={() => setLeftCollapsed(p => !p)}
                title={leftCollapsed ? 'Expandir painel' : 'Recolher painel'}
                style={{
                  background: 'none', border: `1px solid ${C.border}`,
                  borderRadius: 5, color: C.textMuted,
                  cursor: 'pointer', padding: '3px 7px',
                  fontSize: 11, transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = C.text}
                onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
              >
                {leftCollapsed ? '▶' : '◀'}
              </button>
            </div>

            {/* Conteúdo visível só quando expandido */}
            {!leftCollapsed && (
              <>
                <button
                  onClick={handleSelectFolder}
                  style={{ width: '100%', padding: '8px', borderRadius: 6, background: C.accent, color: '#000', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Abrir .yyp
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  {appSettings.aiMode === 'local' && (
                    <button
                      onClick={() => setShowModelHub(true)}
                      style={{ flex: 1, padding: '6px', borderRadius: 6, background: C.surface, color: C.text, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 11 }}
                    >🤖 Modelos</button>
                  )}
                  <button
                    onClick={() => setShowSettings(true)}
                    style={{ flex: 1, padding: '6px', borderRadius: 6, background: C.surface, color: C.text, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 11 }}
                  >⚙️ Configs</button>
                </div>
              </>
            )}
          </div>

          {/* Label de seção + contagem (só expandido) */}
          {!leftCollapsed && (
            <div style={{ padding: '8px 15px', borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.textMuted, display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
              <span>ARQUIVOS DE CÓDIGO</span>
              <span>{Object.keys(files).length}</span>
            </div>
          )}

          {/* Lista de arquivos (só expandido) */}
          {!leftCollapsed && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {Object.keys(files).length === 0
                ? <p style={{ color: C.textMuted, textAlign: 'center', fontSize: 12, marginTop: 20 }}>Nenhum projeto lido</p>
                : Object.keys(files).map(path => (
                  <div
                    key={path}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '4px 6px', borderRadius: 4, marginBottom: 2,
                      border: '1px solid transparent',
                      background: activeTab?.path === path ? C.border : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.border}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  >
                    <div
                      onClick={() => openFileTab(path)}
                      style={{ flex: 1, fontSize: 11, color: C.textDim, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={path}
                    >
                      {parseGMLFilename(path)}
                    </div>
                    <button
                      onClick={e => handleDeleteFile(e, path)}
                      title="Excluir arquivo"
                      style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 14, opacity: 0.6, padding: '0 4px', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
                    >×</button>
                  </div>
                ))
              }
            </div>
          )}

          {/* Ícone de arquivo quando colapsado */}
          {leftCollapsed && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 6, overflowY: 'auto' }}>
              {Object.keys(files).slice(0, 20).map(path => (
                <div
                  key={path}
                  onClick={() => { openFileTab(path); setLeftCollapsed(false) }}
                  title={parseGMLFilename(path)}
                  style={{
                    width: 30, height: 30, borderRadius: 6,
                    background: activeTab?.path === path ? C.border : C.surface,
                    border: `1px solid ${activeTab?.path === path ? C.accent : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                  onMouseLeave={e => e.currentTarget.style.borderColor = activeTab?.path === path ? C.accent : C.border}
                >
                  📄
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* --- PAINEL CENTRAL: WORKSPACE --- */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.bg }}>
          <div style={{ display: 'flex', alignItems: 'stretch', background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 8px 0 8px', gap: 0, overflow: 'hidden' }}>
            {/* Abas de arquivo — só no modo Code */}
            {workspaceMode === 'code' && (
              <div style={{ flex: 1, display: 'flex', overflowX: 'auto', gap: 0 }}>
                {workspaceTabs.length === 0
                  ? <div style={{ padding: '8px', color: C.textMuted, fontSize: 12, alignSelf: 'center' }}>Workspace Vazio</div>
                  : workspaceTabs.map(tab => (
                    <div
                      key={tab.id}
                      onClick={() => setActiveTabId(tab.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 15px', minWidth: 120, maxWidth: 200,
                        cursor: 'pointer',
                        background: activeTabId === tab.id ? C.bg : 'transparent',
                        border: `1px solid ${activeTabId === tab.id ? C.border : 'transparent'}`,
                        borderBottom: 'none',
                        borderRadius: '6px 6px 0 0',
                        color: activeTabId === tab.id ? (tab.type === 'diff' ? C.warning : C.text) : C.textMuted,
                        fontWeight: activeTabId === tab.id ? 'bold' : 'normal',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tab.path}>
                        {tab.type === 'diff' ? '⚠️ ' : ''}{parseGMLFilename(tab.path)}
                      </span>
                      <button onClick={e => closeTab(e, tab.id)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.6, fontSize: 14 }}>×</button>
                    </div>
                  ))
                }
              </div>
            )}

            {/* No modo visual, espaço em branco para empurrar o toggle para a direita */}
            {workspaceMode === 'visual' && <div style={{ flex: 1 }} />}

            {/* Toggle Código ↔ Visual */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', paddingBottom: 6, paddingLeft: 8, flexShrink: 0 }}>
              {(['code', 'visual']).map(mode => (
                <button
                  key={mode}
                  onClick={() => setWorkspaceMode(mode)}
                  style={{
                    padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                    borderRadius: '6px 6px 0 0',
                    border: `1px solid ${workspaceMode === mode ? C.border : 'transparent'}`,
                    borderBottom: workspaceMode === mode ? `1px solid ${C.bg}` : '1px solid transparent',
                    background: workspaceMode === mode ? C.bg : 'transparent',
                    color: workspaceMode === mode ? C.accent : C.textMuted,
                    fontWeight: workspaceMode === mode ? 'bold' : 'normal',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (workspaceMode !== mode) e.currentTarget.style.color = C.text }}
                  onMouseLeave={e => { if (workspaceMode !== mode) e.currentTarget.style.color = C.textMuted }}
                >
                  {mode === 'code' ? '📝 Código' : '🎮 Visual'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {workspaceMode === 'visual' ? (
              /* ── MODO VISUAL: canvas drag-and-drop ── */
              <VisualWorkspace
                tabs={workspaceTabs}
                allFiles={files}
                onAccept={(tab) => handleApplyChange(tab)}
                onReject={(tab) => { soundManager.play('negated.mp3'); closeTab({ stopPropagation: () => {} }, tab.id) }}
                onClose={(tabId) => closeTab({ stopPropagation: () => {} }, tabId)}
              />
            ) : (
              /* ── MODO CODE: texto bruto puro ── */
              !activeTab ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.textMuted, fontSize: 14 }}>
                  Abra um arquivo ou faça uma pergunta à IA.
                </div>
              ) : activeTab.type === 'diff' ? (
                <DiffViewer
                  key={activeTab.id}
                  fileName={activeTab.path}
                  oldCode={activeTab.oldCode}
                  newCode={activeTab.newCode}
                  analysisText={activeTab.analysisText || ''}
                  searchFailed={activeTab.searchFailed}
                  suggestedBlock={activeTab.suggestedBlock}
                  searchedBlock={activeTab.searchedBlock}
                  isDelete={activeTab.isDelete}
                  isNew={activeTab.isNew}
                  onAccept={() => handleApplyChange(activeTab)}
                  onReject={() => { soundManager.play('negated.mp3'); closeTab({ stopPropagation: () => {} }, activeTab.id) }}
                />
              ) : (
                <textarea
                  readOnly
                  value={activeTab.content}
                  style={{
                    width: '100%', height: '100%',
                    background: C.bg, color: C.textDim,
                    border: 'none', padding: 20,
                    fontSize: 13, fontFamily: 'monospace',
                    resize: 'none', outline: 'none',
                  }}
                />
              )
            )}
          </div>
        </main>

        {/* --- PAINEL DIREITO: CHAT --- */}
        <aside style={{ width: chatPanelWidth, minWidth: chatPanelWidth, maxWidth: chatPanelWidth, background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', transition: 'width 0.25s, min-width 0.25s, max-width 0.25s', overflow: 'hidden' }}>
          <header style={{ padding: '10px 15px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* ── Status da IA + botão Ligar/Desligar (modo local) ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {(() => {
                const isLoading   = aiStatus === 'loading'
                const isError     = aiStatus.includes('Erro') || aiStatus.includes('error')
                const statusColor = isLoading ? C.warning : isError ? C.danger : C.success
                return (
                  <span style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b style={{ color: statusColor }}>{aiStatus.toUpperCase()}</b>
                  </span>
                )
              })()}
              {appSettings?.aiMode === 'local' && (
                isModelLoaded ? (
                  <button
                    onClick={handleUnloadModel}
                    title="Desligar IA e liberar RAM/VRAM"
                    style={{ padding: '3px 8px', borderRadius: 4, background: C.dangerDim, border: `1px solid ${C.danger}55`, color: C.danger, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >⏹ Desligar</button>
                ) : (
                  <button
                    onClick={() => setShowModelHub(true)}
                    title="Carregar um modelo na memória"
                    style={{ padding: '3px 8px', borderRadius: 4, background: C.successDim || '#1a2a1a', border: `1px solid ${C.success}55`, color: C.success, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >▶ Ligar IA</button>
                )
              )}
            </div>

            {/* ── Botões direita ── */}
            <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
              {undoStack.length > 0 && (
                <button onClick={handleUndo} style={{ background: C.warningDim, border: `1px solid ${C.warning}55`, color: C.warning, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 'bold' }}>↩</button>
              )}
              <button onClick={handleClearChat} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>🗑</button>
              {/* Botão expandir/recolher painel de chat */}
              <button
                onClick={() => setChatPanelWidth(w => w === 420 ? 650 : w === 650 ? 260 : 420)}
                title={chatPanelWidth === 420 ? 'Expandir chat' : chatPanelWidth === 650 ? 'Recolher chat' : 'Restaurar chat'}
                style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textMuted, padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                {chatPanelWidth >= 650 ? '▶▶' : chatPanelWidth <= 260 ? '◀◀' : '◀▶'}
              </button>
            </div>
          </header>

          <div ref={chatScrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>
            {chatHistory.length === 0 && !streamingText && !isProcessing && (
              <div style={{ textAlign: 'center', marginTop: 50, color: C.textMuted }}>
                <p style={{ fontSize: 13 }}>Como posso ajudar a melhorar seu código hoje?</p>
              </div>
            )}
            
            {chatHistory.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '95%', width: msg.role === 'assistant' ? '100%' : 'auto' }}>
                {msg.role === 'user' && <div style={{ background: C.elevated, padding: '12px 15px', borderRadius: '12px 12px 0 12px', border: `1px solid ${C.border}`, fontSize: 13 }}>{msg.content}</div>}
                
                {msg.role === 'assistant' && (
                  <div style={{ background: C.bg, padding: 15, borderRadius: '0 12px 12px 12px', border: `1px solid ${C.border}` }}>
                    <MessageRenderer content={msg.analysis} />

                    <div style={{ marginTop: 15, paddingTop: 15, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

                      {msg.changes?.length > 0 && (
                        <>
                          <span style={{ fontSize: 11, color: C.textMuted, flex: 1 }}>
                            📁 {msg.changes.length} arquivo(s) modificado(s)
                          </span>
                          <button
                            onClick={() => openDiffTabs(msg.changes, msg.analysis)}
                            style={{
                              padding: '5px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                              background: C.accentDim, color: C.accent,
                              border: `1px solid ${C.accent}55`, fontWeight: 'bold',
                            }}
                          >
                            📂 Abrir no Workspace
                          </button>
                        </>
                      )}

                      {(!msg.changes || msg.changes.length === 0) && msg.raw && (
                        <button
                          onClick={() => {
                            const { changes: extracted, analysis: exAnal } = parseAIResponse(msg.raw, files)
                            if (extracted.length > 0) {
                              openDiffTabs(extracted, exAnal || msg.analysis)
                            } else {
                              alert('Nenhuma modificação de arquivo encontrada nesta resposta.\n\nDica: peça à IA que use as tags <file path="..."> ou <change path="..."> para enviar mudanças automaticamente.')
                            }
                          }}
                          style={{
                            padding: '5px 14px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
                            background: C.surface, color: C.textDim,
                            border: `1px solid ${C.border}`,
                          }}
                        >
                          🔍 Tentar enviar para Workspace
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {msg.role === 'error' && <div style={{ color: C.danger, background: C.dangerDim, padding: 10, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>{msg.content}</div>}
                {msg.role === 'system_msg' && <div style={{ color: C.success, background: C.successDim, padding: '6px 12px', borderRadius: 8, fontSize: 11, border: `1px solid ${C.success}44`, textAlign: 'center', maxWidth: '100%', width: 'fit-content', margin: '0 auto', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{msg.content}</div>}
              </div>
            ))}

            {isProcessing && !streamingText && (
              <div style={{ alignSelf: 'flex-start', background: C.bg, padding: '15px 20px', borderRadius: '0 12px 12px 12px', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', height: 16 }}>
                  <span className="dot" style={{ backgroundColor: C.accent }}></span>
                  <span className="dot" style={{ backgroundColor: C.accent }}></span>
                  <span className="dot" style={{ backgroundColor: C.accent }}></span>
                </div>
              </div>
            )}

            {streamingText && (
              <div style={{ alignSelf: 'flex-start', width: '95%', background: C.bg, padding: 15, borderRadius: '0 12px 12px 12px', border: `1px solid ${C.border}` }}>
                 <MessageRenderer content={streamingText} isStreaming={true} />
              </div>
            )}
          </div>
            {chatBlockReason && (
              <div style={{
                margin: '8px 12px 0',
                padding: '10px 14px',
                borderRadius: 8,
                background: '#FF990010',
                border: `1px solid ${C.warning}55`,
                fontSize: 12,
                color: C.warning,
                lineHeight: 1.6,
                boxSizing: 'border-box',
                width: 'calc(100% - 24px)',   /* ← responsivo ao tamanho do painel */
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                flexShrink: 0,
              }}>
                {chatBlockReason}
              </div>
            )}
          <div style={{ padding: 15, background: C.elevated, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!isProcessing && !chatBlockReason) handleAskAI()
                  }
                }}
                onInput={(e) => {
                  e.target.style.height = 'auto'
                  e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
                }}
                disabled={isProcessing || !!chatBlockReason}
                placeholder={
                  chatBlockReason
                    ? '⚠️ Configure a IA para usar o chat...'
                    : isProcessing
                      ? 'A IA está pensando...'
                      : 'O que deseja mudar ou criar? (Shift+Enter para linha)'
                }
                style={{
                  width: '100%',
                  background: C.bg,
                  border: `1px solid ${chatBlockReason ? C.warning + '66' : C.border}`,
                  color: C.text,
                  opacity: (isProcessing || chatBlockReason) ? 0.5 : 1,
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  minHeight: 40,
                  maxHeight: 150,
                  cursor: chatBlockReason ? 'not-allowed' : 'text',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {(() => {
                  const pct = Math.min(100, Math.round((totalChatTokens / (appSettings?.contextSize || 4096)) * 100))
                  const barColor = pct > 90 ? C.danger : pct > 70 ? C.warning : C.teal
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150 }}>
                      <span style={{ fontSize: 10, color: pct > 90 ? C.danger : C.textMuted }}>
                        Memória: {formatTokens(totalChatTokens)}/{formatTokens(appSettings?.contextSize || 4096)} ({pct}%)
                      </span>
                      <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: barColor,
                          transition: 'width 0.3s, background 0.3s',
                          borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  )
                })()}
                
                {isProcessing ? (
                  <button onClick={handleStopGeneration} style={{ background: C.dangerDim, color: C.danger, border: `1px solid ${C.danger}66`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>Parar</button>
                ) : (
                  <button
                    onClick={handleAskAI}
                    disabled={!!chatBlockReason || !inputText.trim()}
                    style={{
                      background: (!chatBlockReason && inputText.trim()) ? C.accent : C.bg,
                      color: (!chatBlockReason && inputText.trim()) ? '#000' : C.textMuted,
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 6,
                      cursor: (!chatBlockReason && inputText.trim()) ? 'pointer' : 'not-allowed',
                      fontWeight: 'bold',
                      fontSize: 12,
                    }}
                  >
                    Enviar
                  </button>
                )}
                
              </div>
            </div>
          </div>
        </aside>

      </div>
      
      {showArtifactModal && projectPath && (
        <ArtifactScanModal
          projectPath={projectPath}
          onClose={() => setShowArtifactModal(false)}
        />
      )}

      {showModelHub && <ModelHub onClose={() => setShowModelHub(false)} onUseModel={handleModelChange} downloads={downloads} setDownloads={setDownloads} />}
      {showSettings && <SettingsModal currentSettings={appSettings} onClose={() => setShowSettings(false)} onSave={handleSettingsSave} />}

      <style>{`
        .cursor { animation: blink 0.8s infinite; }
        
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        
        @keyframes bounceWave {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
        .dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 5px;
          animation: bounceWave 0.6s infinite ease-in-out;
        }
        .dot:nth-child(1) { animation-delay: 0s; }
        .dot:nth-child(2) { animation-delay: 0.1s; }
        .dot:nth-child(3) { animation-delay: 0.2s; margin-right: 0; }
      `}</style>
    </div>
  )
}

function ArtifactScanModal({ projectPath, onClose }) {
  const [phase,  setPhase]  = useState('ask')     // 'ask' | 'scanning' | 'done'
  const [result, setResult] = useState(null)

  const handleScan = async () => {
    setPhase('scanning')
    try {
      const r = await window.electron.scanSanitizeProject(projectPath)
      setResult(r)
      setPhase('done')
    } catch (e) {
      setResult({ fixed: [], checked: 0, errors: [e.message] })
      setPhase('done')
    }
  }

  const overlay = {
    position: 'fixed', inset: 0, background: '#00000088',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9999,
  }
  const box = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: 32, width: 520, display: 'flex',
    flexDirection: 'column', gap: 18, color: C.text,
  }

  return (
    <div style={overlay}>
      <div style={box}>
        {phase === 'ask' && (
          <>
            <div>
              <h2 style={{ fontSize: 17, color: C.accent, marginBottom: 8 }}>
                🔍 Verificar Artefatos de IA
              </h2>
              <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.7 }}>
                IAs às vezes salvam <b style={{ color: C.text }}>caracteres invisíveis</b> nos
                arquivos (espaços zero-width, non-breaking spaces etc.).<br />
                Isso pode causar falhas no "buscar e substituir" do assistente.<br /><br />
                Deseja <b style={{ color: C.text }}>escanear e corrigir</b> automaticamente os
                arquivos <code style={{ color: C.teal }}>.gml / .txt / .fsh / .vsh</code> do projeto?
              </p>
              <p style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                ⚠️ Backups <code>.bak</code> serão criados para cada arquivo alterado.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{ padding: '8px 18px', borderRadius: 8, background: C.bg, color: C.textDim, border: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 13 }}
              >
                Agora não
              </button>
              <button
                onClick={handleScan}
                style={{ padding: '8px 20px', borderRadius: 8, background: C.accent, color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 }}
              >
                Escanear e Corrigir
              </button>
            </div>
          </>
        )}

        {phase === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
            <p style={{ color: C.textMuted, fontSize: 14 }}>Escaneando arquivos do projeto...</p>
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <h2 style={{ fontSize: 17, color: result.fixed.length > 0 ? C.success : C.textDim }}>
              {result.fixed.length > 0 ? '✅ Limpeza Concluída' : '✓ Nenhum artefato encontrado'}
            </h2>

            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.8 }}>
              <p>📂 Arquivos verificados: <b style={{ color: C.text }}>{result.checked}</b></p>
              <p>🧹 Arquivos corrigidos: <b style={{ color: result.fixed.length > 0 ? C.success : C.text }}>{result.fixed.length}</b></p>
              {result.errors.length > 0 && (
                <p>⚠️ Erros: <b style={{ color: C.warning }}>{result.errors.length}</b></p>
              )}
            </div>

            {result.fixed.length > 0 && (
              <div style={{ background: C.bg, borderRadius: 8, padding: 12, maxHeight: 150, overflowY: 'auto', border: `1px solid ${C.border}` }}>
                {result.fixed.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.success, fontFamily: 'monospace', marginBottom: 3 }}>
                    ✓ {f}
                  </div>
                ))}
              </div>
            )}

            {result.errors.length > 0 && (
              <div style={{ background: C.dangerDim, borderRadius: 8, padding: 10, border: `1px solid ${C.danger}44` }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.danger, fontFamily: 'monospace' }}>⚠️ {e}</div>
                ))}
              </div>
            )}

            <button
              onClick={onClose}
              style={{ padding: '8px 20px', borderRadius: 8, background: C.accent, color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 13, alignSelf: 'flex-end' }}
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function SetupWizard({ onComplete }) {
  const [mode, setMode] = useState(null) 
  
  const [onlineProvider, setOnlineProvider] = useState('openai')
  const [onlineKey, setOnlineKey] = useState('')
  const [onlineModel, setOnlineModel] = useState(ONLINE_PROVIDERS.openai.defModel)
  const [onlineUrl, setOnlineUrl] = useState(ONLINE_PROVIDERS.openai.url)

  const handleProviderSelect = (e) => {
    const key = e.target.value
    setOnlineProvider(key)
    if (ONLINE_PROVIDERS[key]) {
      setOnlineModel(ONLINE_PROVIDERS[key].defModel)
      setOnlineUrl(ONLINE_PROVIDERS[key].url)
    }
  }

  const handleFinish = () => {
    if (mode === 'local') {
      onComplete('local', {})
    } else {
      if (!onlineKey.trim() && onlineProvider !== 'ollama') return alert("Insira a API Key para prosseguir.")
      onComplete('online', {
        onlineBaseUrl: onlineUrl,
        onlineModel: onlineModel,
        onlineKey: onlineKey.trim()
      })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: 600, padding: 40, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <h1 style={{ fontSize: 24, color: C.accent, marginBottom: 10 }}>Bem-vindo ao GML Assistant 🎮</h1>
          <p style={{ color: C.textMuted, fontSize: 14 }}>Como você deseja processar a Inteligência Artificial?</p>
        </div>

        {!mode ? (
          <div style={{ display: 'flex', gap: 20 }}>
            <div onClick={() => setMode('local')} style={{ flex: 1, padding: 20, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = C.accent} onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>💻</div>
              <h3 style={{ fontSize: 16, marginBottom: 5 }}>Modo Local (Offline)</h3>
              <p style={{ fontSize: 12, color: C.textMuted }}>Usa a placa de vídeo do seu PC para rodar a IA. Gratuito, privado, requer hardware forte (GPU de 6GB+ recomendada).</p>
            </div>

            <div onClick={() => setMode('online')} style={{ flex: 1, padding: 20, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 12, cursor: 'pointer', transition: '0.2s' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = C.teal} onMouseLeave={(e) => e.currentTarget.style.borderColor = C.border}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>☁️</div>
              <h3 style={{ fontSize: 16, marginBottom: 5 }}>Modo Nuvem (API)</h3>
              <p style={{ fontSize: 12, color: C.textMuted }}>Ultra rápido e não pesa no seu PC. Suporta OpenAI, Gemini, Groq, OpenRouter e DeepSeek.</p>
            </div>
          </div>
        ) : mode === 'online' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15, background: C.elevated, padding: 20, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 16, color: C.teal }}>Configuração de Nuvem</h3>
            
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5 }}>Preencher com Provedor</label>
                <select value={onlineProvider} onChange={handleProviderSelect} style={{ width: '100%', padding: 10, background: C.code, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6 }}>
                  {Object.entries(ONLINE_PROVIDERS).map(([key, val]) => <option key={key} value={key}>{val.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5 }}>URL Base (Modificável)</label>
                <input type="text" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} style={{ width: '100%', padding: 10, background: C.code, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5 }}>API Key (Token de Autorização)</label>
              <input type="password" value={onlineKey} onChange={(e) => setOnlineKey(e.target.value)} placeholder="Cole sua API Key aqui..." style={{ width: '100%', padding: 10, background: C.code, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6 }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: C.textDim, marginBottom: 5 }}>Nome do Modelo</label>
              <input type="text" value={onlineModel} onChange={(e) => setOnlineModel(e.target.value)} style={{ width: '100%', padding: 10, background: C.code, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6 }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <button onClick={() => setMode(null)} style={{ padding: '10px 20px', background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>Voltar</button>
              <button onClick={handleFinish} style={{ padding: '10px 20px', background: C.teal, color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Concluir Setup</button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', background: C.elevated, padding: 20, borderRadius: 12, border: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 16, color: C.accent, marginBottom: 10 }}>Configuração Local</h3>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>Você será redirecionado para a interface principal onde poderá baixar e selecionar os modelos GGUF na aba "Modelos".</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setMode(null)} style={{ padding: '10px 20px', background: 'transparent', color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>Voltar</button>
              <button onClick={handleFinish} style={{ padding: '10px 20px', background: C.accent, color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Avançar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
