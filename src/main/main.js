const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const chokidar = require('chokidar')

// ─── SANITIZADOR DE ARTEFATOS DE IA ──────────────────────────────────────────
const INVISIBLE_CHARS_RE = /[\u200B\u200C\u200D\uFEFF\u2060\u00AD\u2028\u2029]/g
const WIDE_SPACES_RE = /[\u00A0\u202F\u2008\u2007\u2006\u2005\u2004\u2003\u2002\u2001\u3000]/g

function sanitizeContent(content) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(WIDE_SPACES_RE, ' ')
}

const isDev = process.env.NODE_ENV !== 'production' || !app.isPackaged

let mainWindow

// ─── CONFIGURAÇÕES (SETTINGS) ────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json')

function getSettings() {
  const defaultSettings = {
    modelsPath: path.join(os.homedir(), '.gml-assistant', 'models'),
    temperature: 0.3,
    maxTokens: 2048,
    contextSize: 4096,
    gpuLayers: 999,
    kvCacheType: 'f16',
    audioVolume: 0.5,
    playIntroOnStartup: true,
    aiMode: null,
    onlineBaseUrl: 'https://api.openai.com/v1',
    onlineModel: 'gpt-4o-mini',
    onlineKey: '',
    activeTheme: 'gml_modern',
    customTheme: {}
  }
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...defaultSettings, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) }
    }
  } catch (e) {}
  return defaultSettings
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  return true
}

ipcMain.handle('get-settings', () => getSettings())
ipcMain.handle('save-settings', (_, settings) => saveSettings(settings))

const getModelsDir = () => {
  const dir = getSettings().modelsPath
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ─── SEGURANÇA: VALIDAÇÃO DE PATHS ───────────────────────────────────────────
// [PATCH DE SEGURANÇA] Impede path traversal (ex: ../../arquivo_sensivel)
function isPathSafe(basePath, targetPath) {
  const resolvedBase   = path.resolve(basePath)
  const resolvedTarget = path.resolve(basePath, targetPath)
  // O path resolvido deve começar com a base + separador OU ser idêntico à base
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep)
}

// [PATCH DE SEGURANÇA] Apenas domínios confiáveis para download de modelos
const TRUSTED_DOWNLOAD_DOMAINS = [
  'huggingface.co', // Domínio principal do HuggingFace, onde muitos modelos e LFS estão hospedados
  'cdn-lfs.huggingface.co', // CDN principal dos LFS do HuggingFace
  'cdn-lfs-us-1.huggingface.co', // CDN secundária dos LFS do HuggingFace, usada para balanceamento de carga
  'hf.co', // Domínio curto usado na CDN atual do HuggingFace
  'amazonaws.com', // AWS S3 onde alguns LFS estão armazenados
  'cloudfront.net', // Cloudfront CDN
  'localhost', // para testes locais
  '127.0.0.1',
]

function isUrlTrusted(urlString) {
  try {
    const { URL } = require('url')
    const parsed = new URL(urlString)
    return TRUSTED_DOWNLOAD_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))
  } catch { return false }
}

// ─── WINDOW ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: false, backgroundColor: '#07090E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    },
    icon: path.join(__dirname, '../../public/Icon-GML.png').replace(/\\/g, '/'),
  })

  if (isDev) mainWindow.loadURL('http://localhost:5173')
  else mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
}

// ─── AUTO-REGISTRO DE NOVOS ASSETS NO GAMEMAKER ──────────────────────────────
// [BUG FIX] Registra automaticamente novos assets no .yyp e cria o .yy de metadados,
// para que o GameMaker Studio detecte o novo item sem precisar de drag-and-drop manual.

function findYypFile(folderPath) {
  try {
    const entries = fs.readdirSync(folderPath)
    const yypFile = entries.find(f => f.endsWith('.yyp'))
    return yypFile ? path.join(folderPath, yypFile) : null
  } catch { return null }
}

// Mapeia o nome do arquivo de evento GML para eventType + eventNum do GameMaker
function parseEventFromFilename(eventFilename) {
  const base = eventFilename.replace(/\.gml$/i, '')

  const directMap = {
    'Create_0':   { eventType: 0,  eventNum: 0  },
    'Destroy_0':  { eventType: 1,  eventNum: 0  },
    'CleanUp_0':  { eventType: 12, eventNum: 0  },
    'Step_0':     { eventType: 3,  eventNum: 0  },
    'Step_1':     { eventType: 3,  eventNum: 1  },
    'Step_2':     { eventType: 3,  eventNum: 2  },
    'Draw_0':     { eventType: 8,  eventNum: 0  },
    'Draw_64':    { eventType: 8,  eventNum: 64 },
    'Draw_65':    { eventType: 8,  eventNum: 65 },
    'Draw_66':    { eventType: 8,  eventNum: 66 },
    'Draw_72':    { eventType: 8,  eventNum: 72 },
    'Draw_73':    { eventType: 8,  eventNum: 73 },
    'Draw_75':    { eventType: 8,  eventNum: 75 },
    'Draw_76':    { eventType: 8,  eventNum: 76 },
  }

  if (directMap[base]) return directMap[base]

  const alarmMatch = base.match(/^Alarm_(\d+)$/)
  if (alarmMatch) return { eventType: 2, eventNum: parseInt(alarmMatch[1]) }

  const otherMatch = base.match(/^Other_(\d+)$/)
  if (otherMatch) return { eventType: 7, eventNum: parseInt(otherMatch[1]) }

  const collMatch = base.match(/^Collision_(.+)$/)
  if (collMatch) return { eventType: 4, eventNum: 0, collisionObjectId: null }

  return null
}

async function autoRegisterNewAsset(folderPath, relativePath) {
  try {
    const parts    = relativePath.replace(/\\/g, '/').split('/')
    if (parts.length < 2) return { ok: false }

    const category  = parts[0]  // 'scripts', 'objects', 'shaders'
    const assetName = parts[1]  // nome do asset
    const eventFile = parts[2]  // ex: 'Create_0.gml' (só para objects)

    const yypPath = findYypFile(folderPath)
    if (!yypPath) return { ok: false, reason: 'Arquivo .yyp não encontrado' }

    const yypContent = fs.readFileSync(yypPath, 'utf-8')
    let yyp
    try { yyp = JSON.parse(yypContent) }
    catch { return { ok: false, reason: 'Não foi possível parsear o .yyp' } }

    if (!yyp.resources) yyp.resources = []

    const yyRelPath  = `${category}/${assetName}/${assetName}.yy`
    const yyFullPath = path.join(folderPath, yyRelPath)

    // Encontra a pasta pai correta no .yyp (ex: "Scripts", "Objects", "Shaders")
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1)
    const parentFolder  = (yyp.Folders || []).find(
      f => f.name === categoryLabel || (f.folderPath || '').toLowerCase().includes(category)
    )
    const parentRef = parentFolder
      ? { name: parentFolder.name, path: parentFolder.folderPath }
      : { name: categoryLabel,     path: `folders/${categoryLabel}.yy` }

    const alreadyRegistered = yyp.resources.some(
      r => r.id?.name === assetName || (r.id?.path || '').replace(/\\/g, '/') === yyRelPath
    )

    // ── SCRIPT ─────────────────────────────────────────────────────────────
    if (category === 'scripts') {
      if (!fs.existsSync(yyFullPath)) {
        const yyContent = {
          isDnD: false,
          isCompatibility: false,
          parent: parentRef,
          resourceVersion: '1.0',
          name: assetName,
          tags: [],
          resourceType: 'GMScript'
        }
        fs.mkdirSync(path.dirname(yyFullPath), { recursive: true })
        fs.writeFileSync(yyFullPath, JSON.stringify(yyContent, null, 2), 'utf-8')
      }

      if (!alreadyRegistered) {
        yyp.resources.push({ id: { name: assetName, path: yyRelPath } })
        fs.writeFileSync(yypPath, JSON.stringify(yyp, null, 2), 'utf-8')
      }
      return { ok: true, registered: true }
    }

    // ── SHADER ─────────────────────────────────────────────────────────────
    if (category === 'shaders') {
      if (!fs.existsSync(yyFullPath)) {
        const yyContent = {
          type: 1,
          parent: parentRef,
          resourceVersion: '1.0',
          name: assetName,
          tags: [],
          resourceType: 'GMShader'
        }
        fs.mkdirSync(path.dirname(yyFullPath), { recursive: true })
        fs.writeFileSync(yyFullPath, JSON.stringify(yyContent, null, 2), 'utf-8')
      }

      if (!alreadyRegistered) {
        yyp.resources.push({ id: { name: assetName, path: yyRelPath } })
        fs.writeFileSync(yypPath, JSON.stringify(yyp, null, 2), 'utf-8')
      }
      return { ok: true, registered: true }
    }

    // ── OBJECT ─────────────────────────────────────────────────────────────
    if (category === 'objects') {
      const objectYyExists = fs.existsSync(yyFullPath)

      if (!objectYyExists) {
        // Objeto completamente novo: cria o .yy do objeto
        const yyContent = {
          spriteId: null,
          solid: false,
          visible: true,
          managed: true,
          spriteMaskId: null,
          persistent: false,
          parentObjectId: null,
          physicsObject: false,
          physicsSensor: false,
          physicsShape: 1,
          physicsGroup: 1,
          physicsDensity: 0.5,
          physicsRestitution: 0.1,
          physicsLinearDamping: 0.1,
          physicsAngularDamping: 0.1,
          physicsFriction: 0.2,
          physicsStartAwake: true,
          physicsKinematic: false,
          physicsShapePoints: [],
          eventList: [],
          properties: [],
          overriddenProperties: [],
          parent: parentRef,
          resourceVersion: '1.0',
          name: assetName,
          tags: [],
          resourceType: 'GMObject'
        }
        fs.mkdirSync(path.dirname(yyFullPath), { recursive: true })
        fs.writeFileSync(yyFullPath, JSON.stringify(yyContent, null, 2), 'utf-8')

        if (!alreadyRegistered) {
          yyp.resources.push({ id: { name: assetName, path: yyRelPath } })
          fs.writeFileSync(yypPath, JSON.stringify(yyp, null, 2), 'utf-8')
        }
      }

      // Adiciona o evento ao eventList do objeto (seja novo ou existente)
      if (eventFile) {
        const evInfo = parseEventFromFilename(eventFile)
        if (evInfo) {
          let objectYy
          try { objectYy = JSON.parse(fs.readFileSync(yyFullPath, 'utf-8')) }
          catch { return { ok: true, registered: !alreadyRegistered } }

          if (!objectYy.eventList) objectYy.eventList = []

          const eventAlreadyExists = objectYy.eventList.some(
            ev => ev.eventType === evInfo.eventType && ev.eventNum === evInfo.eventNum
          )

          if (!eventAlreadyExists) {
            objectYy.eventList.push({
              isDnD: false,
              eventNum: evInfo.eventNum,
              eventType: evInfo.eventType,
              collisionObjectId: evInfo.collisionObjectId || null,
              parent: { name: assetName, path: yyRelPath },
              resourceVersion: '1.0',
              name: '',
              tags: [],
              resourceType: 'GMEvent'
            })
            fs.writeFileSync(yyFullPath, JSON.stringify(objectYy, null, 2), 'utf-8')
          }
        }
      }

      return { ok: true, registered: true }
    }

    return { ok: false, reason: 'Tipo de asset não suportado para auto-registro' }
  } catch (e) {
    console.error('[autoRegisterNewAsset]', e.message)
    return { ok: false, reason: e.message }
  }
}

// ─── SCANNER E SANITIZADOR DE ARTEFATOS DE IA ────────────────────────────────
ipcMain.handle('scan-sanitize-project', async (_, folderPath) => {
  const results = { fixed: [], checked: 0, errors: [] }
  const CODE_EXTENSIONS = /\.(gml|fsh|vsh|txt|md)$/i
  const IGNORED_DIRS = ['node_modules', '.git', 'sounds', 'sprites', 'rooms', 'options', 'fonts', 'paths', 'tilesets', 'animcurves', 'sequences', 'notes', 'extensions', 'datafiles']

  const walk = async (dir) => {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.includes(entry.name)) await walk(full)
        } else if (CODE_EXTENSIONS.test(entry.name)) {
          results.checked++
          try {
            const original  = await fs.promises.readFile(full, 'utf-8')
            const sanitized = sanitizeContent(original)
            if (original !== sanitized) {
              await fs.promises.copyFile(full, full + '.bak')
              await fs.promises.writeFile(full, sanitized, 'utf-8')
              results.fixed.push(path.relative(folderPath, full).replace(/\\/g, '/'))
            }
          } catch (e) {
            results.errors.push(`${entry.name}: ${e.message}`)
          }
        }
      }
    } catch {}
  }
  await walk(folderPath)
  return results
})

// ─── LEITURA DE HARDWARE ─────────────────────────────────────────────────────
ipcMain.handle('get-system-specs', () => ({
  totalRamGB: os.totalmem() / (1024 ** 3),
  freeRamGB:  os.freemem()  / (1024 ** 3),
  cpuCores:   os.cpus().length
}))

app.whenReady().then(() => {
  createWindow()

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      const wasPinned = mainWindow.isAlwaysOnTop()
      mainWindow.setAlwaysOnTop(true)
      mainWindow.show()
      mainWindow.focus()
      mainWindow.setAlwaysOnTop(wasPinned)
    }
  })
})

app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.on('window-minimize', () => mainWindow.minimize())
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.on('window-close', () => mainWindow.close())

// ─── SEMPRE NO TOPO ──────────────────────────────────────────────────────────
ipcMain.on('toggle-always-on-top', (event, isPinned) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(isPinned)
})

// ─── MONITORAMENTO DE ARQUIVOS (CHOKIDAR) ────────────────────────────────────
let projectWatcher = null

ipcMain.handle('watch-project', async (event, folderPath) => {
  if (projectWatcher) await projectWatcher.close()

  projectWatcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\..| node_modules|sounds|sprites|rooms|options|fonts|paths|tilesets|animcurves|sequences|extensions|datafiles/,
    persistent: true,
    ignoreInitial: true
  })

  projectWatcher.on('all', (eventName, filePath) => {
    const CODE_EXTENSIONS = /\.(gml|fsh|vsh|md|txt)$/i
    if (!CODE_EXTENSIONS.test(filePath)) return

    const relPath = path.relative(folderPath, filePath).replace(/\\/g, '/')

    if (eventName === 'add' || eventName === 'change') {
      try {
        const raw     = fs.readFileSync(filePath, 'utf-8')
        const content = sanitizeContent(raw)
        if (mainWindow) mainWindow.webContents.send('file-changed', { path: relPath, content, type: 'update' })
      } catch (e) {}
    } else if (eventName === 'unlink') {
      if (mainWindow) mainWindow.webContents.send('file-changed', { path: relPath, type: 'delete' })
    }
  })

  return { ok: true }
})

// ─── FILE SYSTEM / PROJECTS ──────────────────────────────────────────────────
ipcMain.handle('select-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Selecione o arquivo do projeto GameMaker (.yyp)',
    filters: [{ name: 'GameMaker Project', extensions: ['yyp'] }]
  })
  if (result.canceled) return null
  return path.dirname(result.filePaths[0])
})

ipcMain.handle('read-project-folder', async (_, folderPath) => {
  const files = {}
  const ignoredDirs = [
    'node_modules', '.git', 'sounds', 'sprites', 'rooms',
    'options', 'fonts', 'paths', 'tilesets', 'animcurves',
    'sequences', 'notes', 'extensions', 'datafiles'
  ]

  const walk = async (dir) => {
    let entries
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) }
    catch { return }

    await Promise.all(entries.map(async (entry) => {
      const full = path.join(dir, entry.name)
      const rel  = path.relative(folderPath, full).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        if (!ignoredDirs.includes(entry.name)) await walk(full)
      } else {
        if (/\.(gml|fsh|vsh|md|txt)$/.test(entry.name)) {
          if (!rel.includes('CreationCode') && !rel.includes('RoomCreationCode')) {
            try {
              const raw     = await fs.promises.readFile(full, 'utf-8')
              const content = sanitizeContent(raw)
              files[rel] = content
            } catch {}
          }
        }
      }
    }))
  }

  await walk(folderPath)
  return files
})

// ─── SALVAR / CRIAR ARQUIVO ──────────────────────────────────────────────────
ipcMain.handle('save-file', async (_, { folderPath, relativePath, content }) => {
  try {
    // [SEGURANÇA] Rejeita paths que tentam escapar da pasta do projeto
    if (!isPathSafe(folderPath, relativePath)) {
      return { ok: false, error: 'Caminho inválido (tentativa de path traversal detectada).' }
    }
    if (content === undefined || content === null) {
      return { ok: false, error: 'Conteúdo do arquivo está vazio ou indefinido. A IA pode ter gerado uma resposta em branco.' }
    }
    const safeContent = String(content)

    const fullPath  = path.join(folderPath, relativePath)
    const isNewFile = !fs.existsSync(fullPath)

    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    // [BUG FIX] Backup não deve impedir o salvamento se falhar
    if (!isNewFile) {
      try { fs.copyFileSync(fullPath, fullPath + '.bak') } catch (bakErr) {
        console.warn('[save-file] Não foi possível criar backup:', bakErr.message)
      }
    }
    fs.writeFileSync(fullPath, safeContent, 'utf-8')

    if (isNewFile) {
      // [BUG FIX] Tenta registrar automaticamente no .yyp + criar .yy
      const regResult = await autoRegisterNewAsset(folderPath, relativePath)

      if (regResult.registered) {
        // Sucesso: GameMaker vai detectar o novo asset automaticamente
        return { ok: true, isNew: true, autoRegistered: true }
      } else {
        // Fallback: abre o Explorer para o usuário arrastar manualmente
        shell.showItemInFolder(fullPath)
        return { ok: true, isNew: true, autoRegistered: false }
      }
    }
    // Limpa .bak com mais de 7 dias para não acumular lixo
    try {
      const bakPath = fullPath + '.bak'
      if (fs.existsSync(bakPath)) {
        const bakStat = fs.statSync(bakPath)
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        if (Date.now() - bakStat.mtimeMs > sevenDaysMs) fs.unlinkSync(bakPath)
      }
    } catch {}
    return { ok: true, isNew: false }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── EXCLUIR ARQUIVO ─────────────────────────────────────────────────────────
// [PATCH DE SEGURANÇA] Valida path traversal antes de deletar
ipcMain.handle('delete-file', async (_, { folderPath, relativePath }) => {
  try {
    // [SEGURANÇA] Rejeita paths que tentam escapar da pasta do projeto
    if (!isPathSafe(folderPath, relativePath)) {
      return { ok: false, error: 'Caminho inválido (tentativa de path traversal detectada).' }
    }

    const fullPath = path.join(folderPath, relativePath)
    const ext      = path.extname(relativePath)
    const yyPath   = fullPath.replace(new RegExp(`${ext}$`), '.yy')

    if (fs.existsSync(fullPath))        fs.unlinkSync(fullPath)
    if (fs.existsSync(yyPath))          fs.unlinkSync(yyPath)
    if (fs.existsSync(fullPath + '.bak')) fs.unlinkSync(fullPath + '.bak')

    return { ok: true, isDelete: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── UTILS EXTERNOS ──────────────────────────────────────────────────────────
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))
ipcMain.handle('open-folder',   (_, folderPath) => shell.openPath(folderPath))
ipcMain.handle('select-custom-models-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})
ipcMain.handle('get-models-dir', () => getModelsDir())

// ─── CHAT API (ONLINE STREAMING) ─────────────────────────────────────────────
let onlineAbortController = null

ipcMain.handle('ai-chat-request-stream', async (event, { baseUrl, headers, body }) => {
  try {
    onlineAbortController = new AbortController()
    // [BUG FIX] Timeout de 90s + mensagem de erro mais clara
    const timeoutId = setTimeout(() => {
      onlineAbortController?.abort()
      mainWindow?.webContents.send('online-llm-token', { 
        chunk: '', done: true, 
        error: 'Tempo limite excedido (90s). A API demorou muito para responder.' 
      })
    }, 90_000)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ ...body, stream: true }),
      signal: onlineAbortController.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const err = await response.text()
      onlineAbortController = null
      return { ok: false, error: `HTTP ${response.status}: ${err}` }
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          const dataStr = line.replace(/^data:\s*/, '').trim()
          if (dataStr === '[DONE]') continue
          try {
            const parsed  = JSON.parse(dataStr)
            const content = parsed.choices[0]?.delta?.content || ''
            if (content) mainWindow?.webContents.send('online-llm-token', { chunk: content })
          } catch(e) {}
        }
      }
    }
    onlineAbortController = null
    mainWindow?.webContents.send('online-llm-token', { chunk: '', done: true })
    return { ok: true }
  } catch (e) {
    onlineAbortController = null
    if (e.name === 'AbortError') {
      mainWindow?.webContents.send('online-llm-token', { chunk: '', done: true, aborted: true })
      return { ok: false, aborted: true }
    }
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('abort-online-generation', () => {
  if (onlineAbortController) { onlineAbortController.abort(); return { ok: true } }
  return { ok: false }
})

// ─── GERENCIADOR DE DOWNLOADS (GGUF) E OLLAMA ────────────────────────────────
const activeDownloads = new Map()

ipcMain.handle('download-model', async (event, { modelId, downloadUrl, filename }) => {
  // [PATCH DE SEGURANÇA] Apenas permite downloads de domínios confiáveis
  if (!isUrlTrusted(downloadUrl)) {
    return { ok: false, error: 'URL de download não permitida por motivos de segurança.' }
  }

  try {
    const modelsDir = getModelsDir()
    const destPath  = path.join(modelsDir, filename)
    const tempPath  = destPath + '.part'

    return await new Promise((resolve, reject) => {
      let downloaded    = 0
      let total         = 0
      let currentRequest = null
      let isAborted     = false

      const https = require('https')
      const http  = require('http')
      const { URL } = require('url')

      const doRequest = (currentUrl) => {
        const parsedUrl = new URL(currentUrl)
        const lib = parsedUrl.protocol === 'https:' ? https : http

        currentRequest = lib.get(currentUrl, {
          headers: { 'User-Agent': 'GML-Assistant-Desktop/1.0' }
        }, (res) => {

          if (isAborted) { res.destroy(); return reject(new Error('Cancelado pelo usuário')) }

          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location
            if (!nextUrl.startsWith('http')) nextUrl = new URL(nextUrl, currentUrl).href
            // [SEGURANÇA] Valida também redirects
            if (!isUrlTrusted(nextUrl)) return reject(new Error('Redirect para domínio não confiável bloqueado.'))
            return doRequest(nextUrl)
          }

          if (res.statusCode >= 400) return reject(new Error(`Erro HTTP no servidor: ${res.statusCode}`))

          total = parseInt(res.headers['content-length'] || '0', 10)
          const fileStream = fs.createWriteStream(tempPath)
          let lastUpdate   = 0

          res.on('data', (chunk) => {
            downloaded += chunk.length
            const now = Date.now()
            if (now - lastUpdate > 100) {
              const pct = total ? Math.round((downloaded / total) * 100) : -1
              mainWindow?.webContents.send('download-progress', { modelId, pct, downloaded, total })
              lastUpdate = now
            }
          })

          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            if (isAborted) return

            mainWindow?.webContents.send('download-progress', { modelId, pct: 100, downloaded: total, total })

            if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
            fs.renameSync(tempPath, destPath)

            activeDownloads.delete(modelId)
            resolve({ ok: true })
          })

          fileStream.on('error', (err) => { fileStream.close(); reject(err) })
        }).on('error', (err) => { reject(err) })
      }

      activeDownloads.set(modelId, () => {
        isAborted = true
        if (currentRequest) currentRequest.destroy()
        if (fs.existsSync(tempPath)) { try { fs.unlinkSync(tempPath) } catch (e) {} }
      })

      doRequest(downloadUrl)
    })
  } catch (e) {
    activeDownloads.delete(modelId)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('cancel-download', (_, modelId) => {
  if (activeDownloads.has(modelId)) {
    activeDownloads.get(modelId)()
    activeDownloads.delete(modelId)
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('check-ollama', async () => {
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    if (res.ok) {
      const data = await res.json()
      return { running: true, models: data.models || [] }
    }
    return { running: false, models: [] }
  } catch(e) { return { running: false, models: [] } }
})

ipcMain.handle('ollama-pull', async (event, modelName) => {
  try {
    const response = await fetch('http://localhost:11434/api/pull', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName })
    })
    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const lines = decoder.decode(value).split('\n').filter(Boolean)
      for (const line of lines) {
        const data = JSON.parse(line)
        event.sender.send('ollama-pull-progress', { modelName, status: data.status, completed: data.completed, total: data.total })
      }
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
})

// VARIÁVEIS DA IA E KILL SWITCH
let nativeModel              = null
let nativeContext            = null
let nativeSession            = null
let _cachedLlamaInstance     = null
let generationAbortController = null
let forceStopNative          = false
let lastContextParams        = null

async function createLlamaInstance() {
  if (_cachedLlamaInstance) return _cachedLlamaInstance
  const { getLlama, LlamaLogLevel } = await import('node-llama-cpp')
  const backends = [
    { name: 'cuda',   gpu: 'cuda'   },
    { name: 'vulkan', gpu: 'vulkan' },
    { name: 'cpu',    gpu: false    },
  ]
  for (const backend of backends) {
    try {
      _cachedLlamaInstance = await getLlama({ gpu: backend.gpu, logLevel: LlamaLogLevel.error })
      return _cachedLlamaInstance
    } catch (err) {}
  }
  throw new Error('Nenhum backend disponível (cuda/vulkan/cpu falharam).')
}

ipcMain.handle('start-native-model', async (_, { modelPath, contextSize, gpuLayers, kvCacheTypeK, kvCacheTypeV }) => {
  try {
    nativeSession = null
    if (nativeContext) { try { await nativeContext.dispose() } catch {} nativeContext = null }
    if (nativeModel)   { try { await nativeModel.dispose()   } catch {} nativeModel   = null }

    const llama        = await createLlamaInstance()
    const effectiveCtx = (contextSize && contextSize > 0) ? contextSize : 4096

    // typeK e typeV podem ser diferentes: keys precisam de mais precisão (produto interno)
    // values toleram mais compressão (só multiplicados por pesos de atenção)
    const tryLoad = async (layers, useFA, tK, tV) => {
      let tempModel = null
      let tempCtx   = null
      try {
        tempModel = await llama.loadModel({ modelPath, gpuLayers: layers, useMmap: true })
        tempCtx   = await tempModel.createContext({
          contextSize: effectiveCtx, flashAttention: useFA,
          threads: Math.max(1, os.cpus().length - 1),
          batchSize: 512, typeK: tK, typeV: tV
        })
        return { model: tempModel, ctx: tempCtx }
      } catch (e) {
        if (tempCtx)   await tempCtx.dispose().catch(()=>{})
        if (tempModel) await tempModel.dispose().catch(()=>{})
        throw e
      }
    }

    let result
    let warning = null

    // Tipos efetivos: default q8_0 para K (mais preciso), q4_0 para V (mais comprimido)
    let activeTypeK = kvCacheTypeK || 'q8_0'
    let activeTypeV = kvCacheTypeV || 'q4_0'

    // Cadeia de 4 tentativas — preserva a escolha do usuário o máximo possível
    try {
      // 1. Ideal: Flash Attention + tipos escolhidos pelo usuário
      result = await tryLoad(gpuLayers, true, activeTypeK, activeTypeV)
    } catch (e1) {
      try {
        // 2. Sem Flash Attention, mas ainda com os tipos escolhidos
        result = await tryLoad(gpuLayers, false, activeTypeK, activeTypeV)
        warning = `Flash Attention não suportada pela GPU. Carregando sem ela (KV Cache: K=${activeTypeK} / V=${activeTypeV}).`
      } catch (e2) {
        try {
          // 3. Sem FA + fallback para f16 (sem compressão, mas estável)
          activeTypeK = 'f16'
          activeTypeV = 'f16'
          result  = await tryLoad(gpuLayers, false, 'f16', 'f16')
          warning = 'KV Cache comprimido não suportado pela GPU. Carregando no modo padrão (F16).'
        } catch (e3) {
          // 4. Último recurso: apenas CPU
          result  = await tryLoad(0, false, 'f16', 'f16')
          warning = 'Sem VRAM suficiente ou GPU incompatível. Modelo carregado usando apenas CPU. Ficará mais lento.'
        }
      }
    }

    nativeModel   = result.model
    nativeContext = result.ctx
    lastContextParams = { effectiveCtx, typeK: activeTypeK, typeV: activeTypeV }

    return { ok: true, contextSize: nativeContext.contextSize, warning, actualKvTypeK: activeTypeK, actualKvTypeV: activeTypeV }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('reset-native-session', () => { nativeSession = null; return { ok: true } })

ipcMain.handle('abort-native-generation', async () => {
  forceStopNative = true
  if (generationAbortController) generationAbortController.abort()

  nativeSession = null
  if (nativeContext) {
    const oldCtx = nativeContext
    nativeContext = null
    oldCtx.dispose().catch(() => {})

    if (nativeModel && lastContextParams) {
      try {
        nativeContext = await nativeModel.createContext({
          contextSize: lastContextParams.effectiveCtx,
          flashAttention: false,
          threads: Math.max(1, os.cpus().length - 1),
          batchSize: 512,
          typeK: lastContextParams.typeK || 'q8_0',
          typeV: lastContextParams.typeV || 'q4_0',
        })
      } catch (e) { nativeContext = null }
    }
  }

  return { ok: true }
})

ipcMain.handle('unload-native-model', async () => {
  forceStopNative = true
  if (generationAbortController) generationAbortController.abort()

  nativeSession = null
  if (nativeContext) { try { await nativeContext.dispose() } catch {} nativeContext = null }
  if (nativeModel)   { try { await nativeModel.dispose()   } catch {} nativeModel   = null }
  lastContextParams = null
  forceStopNative   = false

  return { ok: true }
})

ipcMain.handle('chat-native-model-stream', async (_, { systemPrompt, userPrompt, temperature, maxTokens }) => {
  try {
    if (!nativeContext) throw new Error('Modelo local não carregado.')
    if (nativeSession && !nativeContext) {
      nativeSession = null
    }
    if (!userPrompt || !String(userPrompt).trim()) {
      return { ok: false, error: 'Prompt do usuário está vazio.' }
    }
    const safeUserPrompt   = String(userPrompt)
    const safeSystemPrompt = systemPrompt ? String(systemPrompt) : ''

    const { LlamaChatSession } = await import('node-llama-cpp')

    if (!nativeSession) {
      nativeSession = new LlamaChatSession({
        contextSequence: nativeContext.getSequence(),
        systemPrompt: safeSystemPrompt,
      })
    }

    // Estimativa conservadora de tokens usados na sessão atual
    // nativeContext.contextSize = tamanho total; getSequence não expõe uso diretamente
    // então rastreamos manualmente via contador simples
    if (!nativeSession._tq_tokenCount) nativeSession._tq_tokenCount = 0
    nativeSession._tq_tokenCount += Math.ceil((safeUserPrompt.length + safeSystemPrompt.length) / 3.5)

    const usageRatio = nativeSession._tq_tokenCount / lastContextParams.effectiveCtx  // Acessando o objeto global correto
    if (usageRatio > 0.80 && nativeSession._tq_tokenCount > 1000) {
      // Reseta a sessão proativamente antes de estourar, mantendo o system prompt
      nativeSession = null
      nativeSession = new LlamaChatSession({
        contextSequence: nativeContext.getSequence(),
        systemPrompt: safeSystemPrompt,
      })
      nativeSession._tq_tokenCount = Math.ceil((safeSystemPrompt.length) / 3.5)
      mainWindow?.webContents.send('llm-token', { chunk: '[🔄 Sessão renovada automaticamente para liberar contexto]\n\n' })
    }

    generationAbortController = new AbortController()
    const signal  = generationAbortController.signal
    let fullText  = ''

    forceStopNative = false

    await nativeSession.prompt(safeUserPrompt, {
      signal,
      temperature:   temperature ?? 0.3,
      maxTokens:     maxTokens === -1 ? undefined : (maxTokens || 2048),
      repeatPenalty: 1.08,
      topK:          40,
      topP:          0.90,
      minP:          0.05,
      stopOn: ['User:', 'Human:', '\n\n\n\n\n', '</file>\n<file'],

      onTextChunk: (chunk) => {
        if (forceStopNative || signal.aborted) throw new Error('FORCED_STOP')
        fullText += chunk
        mainWindow?.webContents.send('llm-token', { chunk })
      },
    })

    generationAbortController = null
    mainWindow?.webContents.send('llm-token', { chunk: '', done: true })
    return { ok: true, data: fullText }
  } catch (err) {
    generationAbortController = null

    if (err.message === 'FORCED_STOP' || err.name === 'AbortError' || err.message?.includes('aborted')) {
      mainWindow?.webContents.send('llm-token', { chunk: '', done: true, aborted: true })
      return { ok: false, aborted: true, data: '' }
    }

    if (/context|sequence|full/i.test(err.message)) {
      nativeSession = null
      mainWindow?.webContents.send('llm-token', { chunk: '', done: true, error: 'Contexto cheio — sessão reiniciada.' })
      return { ok: false, error: 'Contexto cheio.' }
    }

    mainWindow?.webContents.send('llm-token', { chunk: '', done: true, error: err.message })
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('list-local-models', () => {
  const dir = getModelsDir()
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith('.gguf')).map(f => {
      const full = path.join(dir, f)
      const stat = fs.statSync(full)
      return { name: f, path: full, size: stat.size, mtime: stat.mtime }
    })
  } catch { return [] }
})

ipcMain.handle('delete-local-model', (_, p) => {
  try { fs.unlinkSync(p); return { ok: true } }
  catch(e) { return { ok: false } }
})