export default async function middleware(request: Request) {
  const url = new URL(request.url)
  let path = url.pathname

  if (request.headers.get('x-middleware-request') === 'true') {
    return fetch(request)
  }

  if (path === '/index.html' || path === '/paper.html') {
    return fetch(request)
  }

  if (path.startsWith('/api/') || 
      path.startsWith('/assets/') || 
      path.startsWith('/data/') ||
      path.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|json|xml|webmanifest|js|css)$/)) {
    return fetch(request)
  }

  if (path !== '/' && path.endsWith('/')) {
    path = path.slice(0, -1)
  }

  const baseUrl = 'https://www.consciousnessatlas.com'
  const canonicalUrl = path === '/' 
    ? `${baseUrl}/`
    : `${baseUrl}${path}`

  const htmlPath = path === '/paper' ? '/paper.html' : '/index.html'
  const htmlUrl = new URL(htmlPath, url.origin)

  const response = await fetch(htmlUrl, {
    headers: {
      'x-middleware-request': 'true',
    },
  })
  
  if (!response.ok) {
    return response
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) {
    return response
  }

  let html = await response.text()
  
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${canonicalUrl}" />`
  )

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html',
    },
  })
}

