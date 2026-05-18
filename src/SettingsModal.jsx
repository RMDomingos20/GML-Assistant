import React, { useState, useEffect } from 'react'
import { C, ONLINE_PROVIDERS, THEMES, applyTheme } from './constants'
import { soundManager } from './soundManager'

export default function SettingsModal({ currentSettings, onClose, onSave }) {
  const [settings, setSettings] = useState(currentSettings || {})
  const [tab, setTab] = useState(currentSettings?.aiMode || 'local')
  
  // Garante inicialização segura dos atributos de tema
  useEffect(() => {
    setSettings(prev => ({
      ...prev,
      activeTheme: prev.activeTheme || 'gml_modern',
      customTheme: prev.customTheme || {}
    }))
  }, [])

  if (!settings) return null

  // Atualiza o visual em TEMPO REAL para o usuário testar
  const handleThemeChange = (newThemeId) => {
    const newSettings = { ...settings, activeTheme: newThemeId };
    setSettings(newSettings);
    applyTheme(newThemeId, newSettings.customTheme);
  }

  const handleCustomColorChange = (key, val) => {
    const newCustom = { ...settings.customTheme, [key]: val };
    const newSettings = { ...settings, customTheme: newCustom, activeTheme: 'custom' };
    setSettings(newSettings);
    applyTheme('custom', newCustom);
  }

  const handleCancel = () => {
    // Reverte o tema pro estado anterior se o usuário cancelar
    applyTheme(currentSettings.activeTheme, currentSettings.customTheme);
    onClose();
  }

  const handleSave = async () => {
    const finalSettings = { ...settings, aiMode: tab !== 'appearance' ? tab : currentSettings.aiMode }
    await window.electron.saveSettings(finalSettings)
    onSave(finalSettings)
    onClose()
  }

  const handleChangeFolder = async () => {
    const newPath = await window.electron.selectCustomModelsFolder()
    if (newPath) setSettings({ ...settings, modelsPath: newPath })
  }

  const gpuLayers = settings.gpuLayers ?? 999
  const temperature = settings.temperature ?? 0.3
  const maxTokens = settings.maxTokens ?? 2048
  const contextSize = settings.contextSize ?? 4096
  const kvCacheType = settings.kvCacheType ?? 'f16'

  // Paleta de customização
  const colorFields = [
    { key: 'bg', label: 'Fundo Escuro', group: 'Backgrounds' },
    { key: 'surface', label: 'Painéis Base', group: 'Backgrounds' },
    { key: 'elevated', label: 'Cartões / Modais', group: 'Backgrounds' },
    { key: 'border', label: 'Bordas', group: 'Backgrounds' },
    { key: 'code', label: 'Fundo Código', group: 'Backgrounds' },
    
    { key: 'accent', label: 'Destaque Principal', group: 'Identidade' },
    { key: 'teal', label: 'Secundária (Teal)', group: 'Identidade' },
    { key: 'purple', label: 'Terciária (Roxa)', group: 'Identidade' },
    { key: 'blue', label: 'Info (Azul)', group: 'Identidade' },
    
    { key: 'text', label: 'Texto Principal', group: 'Textos' },
    { key: 'textMuted', label: 'Texto Secundário', group: 'Textos' },
    
    { key: 'danger', label: 'Erro / Excluir', group: 'Status' },
    { key: 'success', label: 'Sucesso / Adicionar', group: 'Status' },
    { key: 'warning', label: 'Aviso / Alterar', group: 'Status' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000DD', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 0, width: 620,
        display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflowY: 'auto',
      }}>
        
        {/* TABS HEADER */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.elevated }}>
          <TabButton label="💻 IA Local" isActive={tab === 'local'} onClick={() => setTab('local')} color={C.accent} />
          <TabButton label="☁️ IA Nuvem" isActive={tab === 'online'} onClick={() => setTab('online')} color={C.teal} />
          <TabButton label="🎨 Interface" isActive={tab === 'appearance'} onClick={() => setTab('appearance')} color={C.purple} />
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* ABA: APARÊNCIA */}
          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={labelStyle}>Tema Principal</label>
                <select 
                  value={settings.activeTheme} 
                  onChange={(e) => handleThemeChange(e.target.value)} 
                  style={{...inputStyle, padding: 12, fontSize: 14}}
                >
                  {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
                  <option value="custom">Tema Personalizado Livre</option>
                </select>
              </div>

              {settings.activeTheme === 'custom' && (
                <div style={{ background: C.bg, padding: 15, borderRadius: 8, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 15 }}>
                  <h4 style={{ color: C.accent, margin: 0, fontSize: 13 }}>Paleta de Cores (Hex)</h4>
                  
                  {['Backgrounds', 'Identidade', 'Textos', 'Status'].map(group => (
                    <div key={group}>
                      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: 'uppercase', fontWeight: 'bold' }}>{group}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {colorFields.filter(f => f.group === group).map(field => {
                          const val = (settings.customTheme && settings.customTheme[field.key]) || THEMES.gml_modern.colors[field.key];
                          return (
                            <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}` }}>
                              <input 
                                type="color" 
                                value={val.slice(0, 7)} // Remove o Alpha se tiver para o color picker
                                onChange={e => handleCustomColorChange(field.key, e.target.value.toUpperCase())}
                                style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 11, color: C.text }}>{field.label}</span>
                                <span style={{ fontSize: 9, color: C.textMuted }}>{val}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <hr style={{ borderColor: C.border, margin: '5px 0' }} />

              <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Volume da Interface ({Math.round((settings.audioVolume ?? 0.5) * 100)}%)</label>
                  <input 
                    type="range" min="0" max="1" step="0.05" value={settings.audioVolume ?? 0.5} 
                    onChange={e => {
                      setSettings({ ...settings, audioVolume: parseFloat(e.target.value) });
                      soundManager.setVolume(parseFloat(e.target.value));
                    }} 
                    onMouseUp={() => soundManager.play('sent.mp3')} 
                    style={{ width: '100%', marginTop: 8 }} 
                  />
                </div>
                
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, marginTop: 15 }}>
                  <input 
                    type="checkbox" id="introToggle" checked={settings.playIntroOnStartup ?? true} 
                    onChange={e => setSettings({ ...settings, playIntroOnStartup: e.target.checked })} 
                    style={{ cursor: 'pointer', width: 16, height: 16, accentColor: C.accent }}
                  />
                  <label htmlFor="introToggle" style={{ fontSize: 13, color: C.textDim, cursor: 'pointer' }}>Tocar Boas-Vindas</label>
                </div>
              </div>
            </div>
          )}

          {/* ABA: LOCAL */}
          {tab === 'local' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={labelStyle}>Pasta de Modelos Locais (GGUF)</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input readOnly value={settings.modelsPath || ''} style={inputStyle} />
                  <button onClick={handleChangeFolder} style={btnStyle}>Procurar</button>
                </div>
              </div>

              <div style={{ background: C.elevated, padding: 15, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <label style={{...labelStyle, color: C.accent}}>Camadas na GPU (VRAM)</label>
                <input type="range" min="0" max="999" step="1" value={gpuLayers} onChange={e => setSettings({ ...settings, gpuLayers: parseInt(e.target.value) })} style={{ width: '100%', accentColor: C.accent }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                  <span>0 (CPU puro)</span>
                  <span style={{ color: C.accent, fontWeight: 'bold' }}>Atual: {gpuLayers >= 999 ? 'MAX' : gpuLayers}</span>
                  <span>999 (GPU Total)</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 15 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Otimização de KV Cache (VRAM)</label>
                  <select value={kvCacheType} onChange={e => setSettings({ ...settings, kvCacheType: e.target.value })} style={inputStyle}>
                    <option value="f16">F16 (Padrão - Alta VRAM, Mais Rápido)</option>
                    <option value="q8_0">Q8_0 (Metade da VRAM, Boa Velocidade)</option>
                    <option value="q4_0">Q4_0 (Mínima VRAM, Pode ser Lento)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ABA: ONLINE */}
          {tab === 'online' && (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div style={{ background: C.tealDim, padding: 15, borderRadius: 8, border: `1px solid ${C.teal}44` }}>
                <label style={{...labelStyle, color: C.teal}}>Autocompletar com Provedor</label>
                <select 
                  onChange={(e) => {
                    const p = ONLINE_PROVIDERS[e.target.value]
                    if (p) setSettings({ ...settings, onlineBaseUrl: p.url, onlineModel: p.defModel })
                  }} 
                  style={{...inputStyle, background: C.surface, cursor: 'pointer'}}
                  defaultValue=""
                >
                  <option value="" disabled>Selecione uma API pronta...</option>
                  {Object.entries(ONLINE_PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Base URL da API</label>
                <input type="text" value={settings.onlineBaseUrl || ''} onChange={e => setSettings({ ...settings, onlineBaseUrl: e.target.value })} style={inputStyle} placeholder="https://api.openai.com/v1" />
              </div>
              
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Nome do Modelo</label>
                  <input type="text" value={settings.onlineModel || ''} onChange={e => setSettings({ ...settings, onlineModel: e.target.value })} style={inputStyle} placeholder="gpt-4o-mini" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>API Key (Bearer Token)</label>
                  <input type="password" value={settings.onlineKey || ''} onChange={e => setSettings({ ...settings, onlineKey: e.target.value })} style={inputStyle} placeholder="sk-..." />
                </div>
              </div>
            </div>
          )}

          {/* SHARED SETTINGS (Para Online ou Local) */}
          {tab !== 'appearance' && (
            <>
              <hr style={{ borderColor: C.border, margin: '5px 0' }} />
              <div style={{ display: 'flex', gap: 15 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Máx Tokens de Saída</label>
                  <select value={maxTokens} onChange={e => setSettings({ ...settings, maxTokens: parseInt(e.target.value) })} style={inputStyle}>
                    <option value={1024}>1024</option><option value={2048}>2048</option><option value={4096}>4096</option><option value={8192}>8192</option><option value={-1}>Ilimitado</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Temperatura ({temperature})</label>
                  <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={e => setSettings({ ...settings, temperature: parseFloat(e.target.value) })} style={{ width: '100%', marginTop: 8, accentColor: tab === 'local' ? C.accent : C.teal }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Tamanho do Contexto</label>
                  <select value={contextSize} onChange={e => setSettings({ ...settings, contextSize: parseInt(e.target.value) })} style={inputStyle}>
                    <option value={2048}>2K</option><option value={4096}>4K</option><option value={8192}>8K</option><option value={16384}>16K</option><option value={32768}>32K</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button onClick={handleCancel} style={{ ...btnStyle, background: 'transparent', color: C.text }}>Cancelar</button>
            <button onClick={handleSave} style={{ ...btnStyle, background: C.successDim, color: C.success, borderColor: C.success }}>Salvar e Aplicar</button>
          </div>

        </div>
      </div>
    </div>
  )
}

function TabButton({ label, isActive, onClick, color }) {
  return (
    <div 
      onClick={onClick} 
      style={{ 
        flex: 1, padding: 15, textAlign: 'center', cursor: 'pointer', fontWeight: 'bold', 
        color: isActive ? color : C.textMuted, 
        borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 'bold', color: C.textDim, marginBottom: 5 }
const inputStyle  = { flex: 1, padding: '8px', borderRadius: 6, background: C.code, border: `1px solid ${C.border}`, color: C.text, width: '100%', outline: 'none' }
const btnStyle    = { padding: '8px 14px', borderRadius: 6, background: C.elevated, border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', fontWeight: 'bold' }