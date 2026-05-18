// ============================================================================
// CONSTANTES GLOBAIS — GML Assistant
// ============================================================================

export const C = {
  bg:         '#07090E',
  surface:    '#0D1018',
  elevated:   '#131722',
  border:     '#1A2035',
  borderHover:'#253050',
  accent:     '#E8832A',
  accentDim:  '#E8832A22',
  teal:       '#1FC8A4',
  tealDim:    '#1FC8A41A',
  text:       '#E2E8F8',
  textMuted:  '#5A6A8A',
  textDim:    '#8A9CC0',
  danger:     '#E84A5A',
  dangerDim:  '#E84A5A1A',
  success:    '#22C55E',
  successDim: '#22C55E1A',
  warning:    '#F59E0B',
  warningDim: '#F59E0B1A',
  code:       '#0A0D14',
  purple:     '#9B8AFF',
  purpleDim:  '#9B8AFF1A',
  blue:       '#4A9EFF',
  blueDim:    '#4A9EFF1A',
}

export const estimateTokens = (text = '') => Math.ceil(text.length / 3)

export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export const formatTokens = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

// ============================================================================
// SYSTEM PROMPTS — VERSÃO BLINDADA E ESCAPADA
// ============================================================================

export const SYSTEM_PROMPT = `Você é um Arquiteto Sênior especialista em GameMaker Studio 2 (GML).

REGRAS OBRIGATÓRIAS DE COMPORTAMENTO:
1. Explique sua solução em Markdown, com snippets ilustrativos usando \`\`\`gml antes de gerar o código XML.
2. NUNCA invente nomes de arquivos que não existem no contexto.
3. Para MODIFICAR um arquivo existente, use SEMPRE <change> com <search>/<replace>.
4. Para CRIAR um arquivo novo do zero, use <file>.
5. Para EXCLUIR um arquivo, use <delete>.
6. Coloque as tags XML APENAS NO FINAL da resposta. Nenhuma palavra após o último fechamento de tag.
7. Para COPIAR, RENOMEAR ou MOVER, use a tag <copy>.

⚠️ PROTOCOLO ANTI-ALUCINAÇÃO (O MAIS IMPORTANTE) ⚠️
8. NÃO CONFIE NA SUA MEMÓRIA! Antes de escrever um bloco <search>, VOCÊ DEVE OBRIGATORIAMENTE ler a seção "ARQUIVOS RELEVANTES" que eu te enviei.
9. CTRL+C / CTRL+V: O conteúdo do bloco <search> DEVE SER UMA CÓPIA EXATA (copiada e colada) do arquivo original. NUNCA tente reescrever o código de memória. Se a variável no arquivo original se chama "categorias", NÃO busque por "abas_diario".
10. NUNCA crie comentários explicativos seus (ex: "// Código original") dentro das tags XML. O XML deve conter apenas código puro do GameMaker.
11. NUNCA use placeholders (ex: "// ... resto do código"). Se você omitir linhas, o arquivo do usuário será destruído. Você deve escrever o bloco de substituição por completo.
12. CONTEXTO DE BUSCA: Inclua sempre 2 linhas inalteradas ANTES e 2 linhas inalteradas DEPOIS do código que você quer mudar dentro do <search>. Isso garante que o sistema encontre o local exato.
13. MÚLTIPLAS MUDANÇAS: Se precisar alterar 3 locais diferentes no MESMO arquivo, faça 3 blocos <change> separados. Nunca tente englobar centenas de linhas num <search> gigante.

EXEMPLO DE COMO MODIFICAR (Siga exatamente este formato):
<change path="objects/obj_player/Step_0.gml">
<search>
// Comentário original que já estava lá
x += hspd;
y += vspd;
if (hp <= 0) {
</search>
<replace>
// Comentário original que já estava lá
x += hspd * delta_time;
y += vspd * delta_time;
if (hp <= 0) {
</replace>
</change>

Para CRIAR arquivo novo:
<file path="scripts/scr_novo/scr_novo.gml">
// Código inteiro aqui
</file>`


export const SYSTEM_PROMPT_LOCAL = `Você é um assistente de programação GameMaker Studio 2 (GML). Responda sempre em português.

FORMATO DE RESPOSTA:
- Explique o que vai fazer.
- Mostre blocos \`\`\`gml ilustrativos.
- Coloque as tags de modificação SOMENTE NO FINAL DA RESPOSTA.

TAGS OBRIGATÓRIAS:
Para MODIFICAR arquivo existente:
<change path="CAMINHO_DO_ARQUIVO">
<search>
CÓDIGO ORIGINAL EXATO (COPIADO DO ARQUIVO)
</search>
<replace>
CÓDIGO NOVO (COMPLETO, SEM OMITIR NADA)
</replace>
</change>

Para CRIAR novo:
<file path="CAMINHO">CÓDIGO</file>

Para EXCLUIR:
<delete path="CAMINHO"></delete>

⚠️ PROTOCOLO ANTI-ALUCINAÇÃO ⚠️
- NÃO INVENTE CÓDIGO NO SEARCH: Copie e cole o trecho exato diretamente dos "ARQUIVOS RELEVANTES" enviados no prompt.
- NUNCA invente nomes de variáveis que não existem no código original enviado. Leia o arquivo!
- NUNCA use blocos Markdown (\`\`\`gml) DENTRO das tags <search>, <replace> ou <file>.
- NUNCA invente comentários explicativos dentro do XML.
- NUNCA use placeholders como "// ... resto do código". Omitir código destrói o arquivo do usuário. Escreva TUDO.
- Se for mudar locais distintos do mesmo arquivo, use MÚLTIPLAS tags <change> separadas.
- A tag <file> é EXCLUSIVA para arquivos novos. Nunca a use para arquivos que já existem.`

// ============================================================================
// PARÂMETROS DE INFERÊNCIA POR MODO
// ============================================================================

export const INFERENCE_PARAMS = {
  online: {
    temperature:       0.2,
    top_p:             0.95,
  },
  local: {
    temperature:       0.1,   
    repeatPenalty:     1.15,  
    topK:              40,    
    topP:              0.90,
    minP:              0.05,  
  },
}

// --- PROVEDORES ONLINE ---
export const ONLINE_PROVIDERS = {
  openai:          { url: 'https://api.openai.com/v1',                                  label: 'OpenAI (GPT-4o)',              defModel: 'gpt-4o-mini'                         },
  gemini:          { url: 'https://generativelanguage.googleapis.com/v1beta/openai',     label: 'Google Gemini (Grátis)',       defModel: 'gemini-2.0-flash'                    },
  groq:            { url: 'https://api.groq.com/openai/v1',                              label: 'Groq (Ultra Rápido)',          defModel: 'llama-3.3-70b-versatile'             },
  deepseek:        { url: 'https://api.deepseek.com/v1',                                 label: 'DeepSeek (Oficial)',           defModel: 'deepseek-coder'                      },
  openrouter:      { url: 'https://openrouter.ai/api/v1',                                label: 'OpenRouter (Requer Créditos)', defModel: 'anthropic/claude-3.5-sonnet'         },
  openrouter_free: { url: 'https://openrouter.ai/api/v1',                                label: 'OpenRouter (Grátis)',          defModel: 'google/gemini-2.0-pro-exp-02-05:free'},
  ollama:          { url: 'http://localhost:11434/v1',                                   label: 'Ollama Local (via API)',       defModel: 'llama3.1'                            },
  custom:          { url: '',                                                             label: 'Personalizado...',            defModel: ''                                    },
}

export const KNOWN_MODELS = [
  {
    id: 'qwen2.5-coder-7b-instruct-q4_k_m',
    name: 'Qwen 2.5 Coder 7B',
    family: 'Qwen',
    source: 'huggingface',
    hfRepo: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
    filename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
    sizeGB: 4.7,
    ramGB: 6,
    contextK: 32,
    quantization: 'Q4_K_M',
    description: 'Excelente para código. Muito rápido em CPU, ótimo para GML.',
    tags: ['código', 'rápido', 'CPU-friendly'],
    recommended: true,
  },
  {
    id: 'llama-3.1-8b-instruct-q4_k_m',
    name: 'Llama 3.1 8B Instruct',
    family: 'Llama',
    source: 'huggingface',
    hfRepo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    sizeGB: 4.9,
    ramGB: 7,
    contextK: 128,
    quantization: 'Q4_K_M',
    description: 'Janela de contexto gigante (128k). Ótimo para projetos grandes.',
    tags: ['contexto-longo', 'geral'],
    recommended: true,
  }
]

const GML_EVENT_MAP = {
  'Create_0':   'Create',      'Destroy_0':  'Destroy',    'CleanUp_0':  'Clean Up',
  'Step_0':     'Step',        'Step_1':     'Begin Step', 'Step_2':     'End Step',
  'Draw_0':     'Draw',        'Draw_64':    'Draw GUI',   'Draw_65':    'Draw GUI Begin',
  'Draw_66':    'Draw GUI End','Draw_72':    'Draw Begin', 'Draw_73':    'Draw End',
  'Draw_75':    'Pre-Draw',    'Draw_76':    'Post-Draw',
  'Other_10':   'Room Start',  'Other_11':   'Room End',
  'Other_12':   'Game Start',  'Other_13':   'Game End',
  'Other_14':   'Room Start',  'Other_15':   'Room End',
  'Other_2':    'Outside Room','Other_3':    'Intersect Boundary',
  'Other_4':    'Game Start',  'Other_5':    'Game End',
  'Other_30':   'Async - Image Loaded',
  'Other_45':   'Async - Audio Playback',
  'Other_46':   'Async - Audio Playback Ended',
  'Other_60':   'Async - HTTP',
  'Other_62':   'User Event 0','Other_63':   'User Event 1',
  'Other_64':   'User Event 2','Other_65':   'User Event 3',
  'Other_66':   'User Event 4','Other_67':   'User Event 5',
  'Other_68':   'User Event 6','Other_69':   'User Event 7',
  'Other_70':   'User Event 8','Other_71':   'User Event 9',
  'Other_72':   'User Event 10','Other_73':  'User Event 11',
  'Other_74':   'User Event 12','Other_75':  'User Event 13',
  'Other_76':   'User Event 14','Other_77':  'User Event 15',
}

export const parseGMLFilename = (filePath) => {
  if (!filePath) return '?'
  const parts   = filePath.replace(/\\/g, '/').split('/')
  const filename = parts[parts.length - 1]
  const parent   = parts[parts.length - 2] || ''
  const category = parts[0] || ''
  const base     = filename.replace(/\.(gml|fsh|vsh)$/i, '')

  if (/\.fsh$/i.test(filename)) return `${parent} › Fragment Shader`
  if (/\.vsh$/i.test(filename)) return `${parent} › Vertex Shader`
  if (category === 'scripts') return parent || base
  if (category === 'objects') {
    const alarm = base.match(/^Alarm_(\d+)$/)
    if (alarm) return `${parent} › Alarm ${alarm[1]}`
    const coll = base.match(/^Collision_(.+)$/)
    if (coll) return `${parent} › Colisão (${coll[1]})`
    const other = base.match(/^Other_(\d+)$/)
    if (other && parseInt(other[1]) >= 62) return `${parent} › User Event ${parseInt(other[1]) - 62}`
    const friendly = GML_EVENT_MAP[base]
    if (friendly) return `${parent} › ${friendly}`
    return `${parent} › ${base}`
  }
  return parent ? `${parent} › ${base}` : base
}