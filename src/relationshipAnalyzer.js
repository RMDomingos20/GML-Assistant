// ============================================================================
// relationshipAnalyzer.js — GML Relationship Analyzer
// Analisa o objeto `files` já carregado e devolve um mapa de vínculos entre
// arquivos, detectando chamadas de scripts, shader_set, funções globais e
// variáveis global.* usadas em múltiplos arquivos.
// ============================================================================

export const REL_TYPES = {
  CALL:        'call',        // Chamada de script:  scr_algo()
  SHADER:      'shader',      // shader_set(shd_algo)
  GLOBAL_VAR:  'global_var',  // global.nome usado em múltiplos arquivos
  FUNC_DEF:    'func_def',    // função definida aqui, chamada em outro lugar
}

export const REL_COLORS = {
  [REL_TYPES.CALL]:       '#9B8AFF', // purple
  [REL_TYPES.SHADER]:     '#F59E0B', // warning/amber
  [REL_TYPES.GLOBAL_VAR]: '#1FC8A4', // teal
  [REL_TYPES.FUNC_DEF]:   '#4A9EFF', // blue
}

function normalizePath(p) {
  return (p || '').replace(/\\/g, '/')
}

function getGroupKey(filePath) {
  const parts = normalizePath(filePath).split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0]
}

function getCategory(filePath) {
  return normalizePath(filePath).split('/')[0] || 'scripts'
}

export function buildRelationships(files) {
  if (!files || Object.keys(files).length === 0) {
    return { links: [], weights: {} }
  }

  const paths    = Object.keys(files)
  const links    = []
  const linkSet  = new Set()

  const addLink = (fromPath, toPath, type, label) => {
    const fromGK = getGroupKey(fromPath)
    const toGK   = getGroupKey(toPath)
    if (fromGK === toGK) return   // mesmo nó, ignora self-links
    const key = `${fromGK}→${toGK}:${type}`
    if (linkSet.has(key)) return
    linkSet.add(key)
    links.push({ from: fromGK, to: toGK, type, label, fromPath, toPath })
  }

  const scriptIndex = {}
  paths.forEach(p => {
    if (getCategory(p) === 'scripts') scriptIndex[getGroupKey(p).toLowerCase()] = p
  })

  const shaderIndex = {}
  paths.forEach(p => {
    if (getCategory(p) === 'shaders') shaderIndex[getGroupKey(p).toLowerCase()] = p
  })

  const functionDefs = {}
  paths.forEach(p => {
    const content = files[p] || ''
    const matches = content.matchAll(/\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)
    for (const m of matches) functionDefs[m[1].toLowerCase()] = p
  })

  const globalVarUsers = {}
  paths.forEach(p => {
    const content = files[p] || ''
    const matches = content.matchAll(/\bglobal\.([a-zA-Z_][a-zA-Z0-9_]*)/g)
    for (const m of matches) {
      const varName = m[1].toLowerCase()
      if (!globalVarUsers[varName]) globalVarUsers[varName] = new Set()
      globalVarUsers[varName].add(p)
    }
  })

  paths.forEach(fromPath => {
    const content = files[fromPath] || ''

    const callMatches = content.matchAll(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g)
    for (const m of callMatches) {
      const name = m[1].toLowerCase()
      if (scriptIndex[name]) addLink(fromPath, scriptIndex[name], REL_TYPES.CALL, `chama ${m[1]}()`)
    }

    for (const [funcName, defPath] of Object.entries(functionDefs)) {
      if (defPath === fromPath) continue
      const regex = new RegExp(`\\b${funcName}\\s*\\(`, 'i')
      if (regex.test(content)) addLink(fromPath, defPath, REL_TYPES.FUNC_DEF, `usa ${funcName}()`)
    }

    const shaderMatches = content.matchAll(/\bshader_set\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)/g)
    for (const m of shaderMatches) {
      const name = m[1].toLowerCase()
      if (shaderIndex[name]) addLink(fromPath, shaderIndex[name], REL_TYPES.SHADER, `shader_set(${m[1]})`)
    }
  })

  for (const [varName, pathSet] of Object.entries(globalVarUsers)) {
    if (pathSet.size < 2) continue
    const arr = Array.from(pathSet)
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        addLink(arr[i], arr[j], REL_TYPES.GLOBAL_VAR, `global.${varName}`)
      }
    }
  }

  const degree = {}
  links.forEach(link => {
    degree[link.from] = (degree[link.from] || 0) + 1
    degree[link.to]   = (degree[link.to]   || 0) + 1
  })
  const maxDeg = Math.max(1, ...Object.values(degree))
  const weights = {}
  for (const [gk, deg] of Object.entries(degree)) {
    weights[gk] = Math.max(1, Math.round((deg / maxDeg) * 5))
  }

  paths.forEach(p => {
    const gk = getGroupKey(p)
    if (!weights[gk]) weights[gk] = 1
  })

  return { links, weights }
}

export function getRelatedPaths(groupKey, links, files) {
  const relatedGroups = new Set()
  links.forEach(link => {
    if (link.from === groupKey) relatedGroups.add(link.to)
    if (link.to   === groupKey) relatedGroups.add(link.from)
  })

  return Object.keys(files).filter(p => relatedGroups.has(getGroupKey(p)))
}