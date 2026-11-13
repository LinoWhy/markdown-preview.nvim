function resolveHtmlImage (tokens, idx) {
  let content = tokens[idx].content || ''

  content = content.replace(/<img\s+([^>]*?)src\s*=\s*(["'])([^\2>]+?)\2([^>]*)>/gm, (m, g1, g2, g3, g4) => {
    if (/^(http|\/\/|data:)/.test(g3)) {
      return m
    }
    return `<img ${g1}src="/_local_image_${encodeURIComponent(g3)}"${g4}>`
  })

  return content
}

function resolveImage (tokens, idx) {
  const src = tokens[idx].attrs[0][1]
  const alt = tokens[idx].content
  const resAttrs = tokens[idx].attrs.slice(2).reduce((pre, cur) => `${pre} ${cur[0]}=${cur[1]}`, '')
  if (/^(http|\/\/|data:)/.test(src)) {
    return `<img src="${src}" alt="${alt}" ${resAttrs} />`
  }
  return `<img src="/_local_image_${encodeURIComponent(src)}" alt="${alt}" ${resAttrs} />`
}

export default function localImage (md) {
  md.inline.ruler.before('image', 'wikilink_image', (state, silent) => {
    const match = /^!\[\[([^\]\n]+)\]\]/.exec(state.src.slice(state.pos))
    if (!match) return false

    const parts = match[1].split(/\\?\|/)
    const src = parts.shift().trim()
    if (!/\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i.test(src)) return false

    const size = (parts[parts.length - 1] || '').match(/^(\d+)(?:x(\d+))?$/)
    if (size) parts.pop()

    if (!silent) {
      const token = state.push('image', 'img', 0)
      token.attrs = [['src', md.normalizeLink(src)], ['alt', '']]
      token.content = md.utils.escapeHtml(parts.join('|') || src)
      token.children = []
      if (size) {
        token.attrs.push(['width', size[1]])
        if (size[2]) token.attrs.push(['height', size[2]])
      }
    }
    state.pos += match[0].length
    return true
  })

  md.renderer.rules.image = resolveImage
  md.renderer.rules.html_block = resolveHtmlImage
  md.renderer.rules.html_inline = resolveHtmlImage
}
