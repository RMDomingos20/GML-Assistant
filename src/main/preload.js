const { contextBridge, ipcRenderer } = require('electron')

// [PATCH DE SEGURANÇA] Lista explícita de canais permitidos para on() e off()
const ALLOWED_CHANNELS = [
  'llm-token',
  'online-llm-token',
  'download-progress',
  'ollama-pull-progress',
  'file-changed'
]

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  getSettings:        ()        => ipcRenderer.invoke('get-settings'),
  saveSettings:       (s)       => ipcRenderer.invoke('save-settings', s),
  selectCustomModelsFolder: ()  => ipcRenderer.invoke('select-custom-models-folder'),
  getSystemSpecs:     ()        => ipcRenderer.invoke('get-system-specs'),

  selectProject:      ()        => ipcRenderer.invoke('select-project'),
  readProjectFolder:  (p)       => ipcRenderer.invoke('read-project-folder', p),
  saveFile:           (opts)    => ipcRenderer.invoke('save-file', opts),
  deleteFile:         (opts)    => ipcRenderer.invoke('delete-file', opts),

  getModelsDir:       ()        => ipcRenderer.invoke('get-models-dir'),
  listLocalModels:    ()        => ipcRenderer.invoke('list-local-models'),
  deleteLocalModel:   (p)       => ipcRenderer.invoke('delete-local-model', p),

  downloadModel:      (opts)    => ipcRenderer.invoke('download-model', opts),
  cancelDownload:     (id)      => ipcRenderer.invoke('cancel-download', id),
  checkOllama:        ()        => ipcRenderer.invoke('check-ollama'),
  ollamaPull:         (name)    => ipcRenderer.invoke('ollama-pull', name),

  toggleAlwaysOnTop:  (isPinned) => ipcRenderer.send('toggle-always-on-top', isPinned),
  watchProject:       (folderPath) => ipcRenderer.invoke('watch-project', folderPath),

  resetNativeSession:    ()     => ipcRenderer.invoke('reset-native-session'),
  abortOnlineGeneration: ()     => ipcRenderer.invoke('abort-online-generation'),
  abortNativeGeneration: ()     => ipcRenderer.invoke('abort-native-generation'),
  unloadNativeModel:     ()     => ipcRenderer.invoke('unload-native-model'),

  aiChatRequestStream:   (opts) => ipcRenderer.invoke('ai-chat-request-stream', opts),
  startNativeModel:      (opts) => ipcRenderer.invoke('start-native-model', opts),
  chatNativeModelStream: (opts) => ipcRenderer.invoke('chat-native-model-stream', opts),

  openExternal:       (url)     => ipcRenderer.invoke('open-external', url),
  openFolder:         (p)       => ipcRenderer.invoke('open-folder', p),

  scanSanitizeProject: (folderPath) => ipcRenderer.invoke('scan-sanitize-project', folderPath),

  on: (channel, fn) => {
    // [PATCH DE SEGURANÇA] Apenas canais explicitamente permitidos
    if (ALLOWED_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => fn(...args))
    }
  },
  off: (channel, fn) => {
    // [PATCH DE SEGURANÇA] Valida o canal antes de remover o listener
    if (ALLOWED_CHANNELS.includes(channel)) {
      if (fn) {
        ipcRenderer.removeListener(channel, fn)
      } else {
        ipcRenderer.removeAllListeners(channel)
      }
    }
  },
})