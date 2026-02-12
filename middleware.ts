function getCacheHeader(path: string): string {
  // index.html - no browser cache, CDN cache 1 day
  if (path === '/index.html') {
    return 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400'
  }
  
  // paper.html and /paper - long cache
  if (path === '/paper' || path === '/paper.html') {
    return 'public, max-age=31536000, s-maxage=31536000, immutable'
  }
  
  // assets - long cache
  if (path.startsWith('/assets/')) {
    return 'public, max-age=31536000, s-maxage=31536000, immutable'
  }
  
  // static files - long cache
  if (path.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|json|xml|webmanifest|js|css)$/)) {
    return 'public, max-age=31536000, s-maxage=31536000, immutable'
  }
  
  // default for HTML pages (SPA routes)
  return 'public, max-age=604800, stale-while-revalidate=86400'
}

export default async function middleware(request: Request) {
  const url = new URL(request.url)
  let path = url.pathname

  if (request.headers.get('x-middleware-request') === 'true') {
    const response = await fetch(request)
    const cacheHeader = getCacheHeader(path)
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Cache-Control', cacheHeader)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }

  if (path === '/index.html' || path === '/paper.html') {
    const response = await fetch(request)
    const cacheHeader = getCacheHeader(path)
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Cache-Control', cacheHeader)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }

  if (path.startsWith('/api/') || 
      path.startsWith('/assets/') || 
      path.startsWith('/data/') ||
      path.match(/\.(svg|png|jpg|jpeg|gif|webp|ico|json|xml|webmanifest|js|css)$/)) {
    const response = await fetch(request)
    const cacheHeader = getCacheHeader(path)
    const newHeaders = new Headers(response.headers)
    newHeaders.set('Cache-Control', cacheHeader)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
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

  const cacheHeader = getCacheHeader(path)
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...Object.fromEntries(response.headers.entries()),
      'Content-Type': 'text/html',
      'Cache-Control': cacheHeader,
    },
  })
}

