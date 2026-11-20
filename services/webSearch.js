// services/webSearch.js
// Real-time web browsing and search aggregation engine for iamhujju

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function cleanHtml(text = '') {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract URLs from a user prompt
 */
export function extractUrls(text = '') {
  const urlRegex = /(https?:\/\/[^\s<>"'()]+)/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)];
}

/**
 * Fetch and parse a direct web page if user gave a URL
 */
async function fetchDirectWebPage(url, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('html') && !contentType.includes('text') && !contentType.includes('json')) {
      return null;
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? cleanHtml(titleMatch[1]) : new URL(url).hostname;

    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i) ||
                      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i);
    const desc = descMatch ? cleanHtml(descMatch[1]) : '';

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = bodyMatch ? cleanHtml(bodyMatch[1]) : cleanHtml(html);
    const snippet = (desc ? desc + ' — ' : '') + bodyContent.slice(0, 1500);

    return {
      title,
      url,
      snippet: snippet.slice(0, 1200),
      source: new URL(url).hostname,
      date: new Date().toLocaleDateString()
    };
  } catch (err) {
    return null;
  }
}

/**
 * Search Google News RSS for live breaking news & current events
 */
async function searchGoogleNews(query, timeoutMs = 4000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const xml = await res.text();
    const results = [];
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?(?:<source[^>]*url=["'](.*?)["'][^>]*>(.*?)<\/source>)?[\s\S]*?<\/item>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null && results.length < 5) {
      let rawTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
      let link = match[2];
      let pubDate = match[3];
      let sourceName = match[5] || 'Google News';

      // Split title if formatted as "Title - Publisher"
      let cleanTitle = cleanHtml(rawTitle);
      if (cleanTitle.includes(' - ')) {
        const parts = cleanTitle.split(' - ');
        sourceName = parts[parts.length - 1];
        cleanTitle = parts.slice(0, -1).join(' - ');
      }

      results.push({
        title: cleanTitle,
        url: link,
        snippet: `Published on ${sourceName} (${new Date(pubDate).toLocaleDateString()}). Recent breaking coverage on ${query}.`,
        source: sourceName,
        date: pubDate
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Search Wikipedia for encyclopedic, biographical, scientific & technical context
 */
async function searchWikipedia(query, timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=&srlimit=4`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'iamhujju-web-browser/1.0 (huzaifakazi1991@gmail.com)' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.query?.search || [];
    return items.map(item => ({
      title: item.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
      snippet: cleanHtml(item.snippet),
      source: 'Wikipedia',
      date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : null
    }));
  } catch {
    return [];
  }
}

/**
 * Search Hacker News Algolia for tech, programming, AI models, and developer discussions
 */
async function searchHackerNews(query, timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=4`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const hits = data?.hits || [];
    return hits
      .filter(h => h.title)
      .map(h => ({
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: `Hacker News discussion (${h.points || 0} points, ${h.num_comments || 0} comments). ${h.story_text ? cleanHtml(h.story_text).slice(0, 200) : ''}`,
        source: 'Hacker News',
        date: h.created_at ? new Date(h.created_at).toLocaleDateString() : null
      }));
  } catch {
    return [];
  }
}

/**
 * Main Web Search & Browsing Orchestrator
 */
export async function browseWeb(query = '', { maxResults = 5 } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return { query, sources: [], formattedContext: '' };

  const explicitUrls = extractUrls(trimmed);
  const searchPromises = [];

  // 1. If explicit URLs are in the query, fetch them first
  if (explicitUrls.length > 0) {
    for (const url of explicitUrls.slice(0, 2)) {
      searchPromises.push(fetchDirectWebPage(url));
    }
  }

  // 2. Query Google News RSS & Wikipedia in parallel
  // Clean query of URLs for search keywords
  const keywordQuery = trimmed.replace(/https?:\/\/[^\s]+/g, '').trim() || trimmed;
  searchPromises.push(searchGoogleNews(keywordQuery));
  searchPromises.push(searchWikipedia(keywordQuery));
  searchPromises.push(searchHackerNews(keywordQuery));

  const allResults = await Promise.allSettled(searchPromises);
  const combined = [];
  const seenUrls = new Set();

  for (const res of allResults) {
    if (res.status === 'fulfilled' && res.value) {
      const items = Array.isArray(res.value) ? res.value : [res.value];
      for (const item of items) {
        if (item && item.url && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          combined.push(item);
        }
      }
    }
  }

  const sources = combined.slice(0, maxResults);
  const formattedContext = formatWebSearchResults(sources, trimmed);

  return {
    query: trimmed,
    sources,
    formattedContext
  };
}

/**
 * Format search results into AI Model System/User Context Block
 */
export function formatWebSearchResults(sources = [], query = '') {
  if (!sources || sources.length === 0) return '';

  const entries = sources.map((s, index) => {
    let entry = `[${index + 1}] "${s.title}"\n    Source: ${s.source} | URL: ${s.url}`;
    if (s.date) entry += ` | Date: ${s.date}`;
    if (s.snippet) entry += `\n    Snippet: ${s.snippet}`;
    return entry;
  }).join('\n\n');

  return `\n\n--- REAL-TIME LIVE WEB BROWSING RESULTS ---\nQuery: "${query}"\n\n${entries}\n\nInstructions for AI Assistant:\nYou have been provided with real-time web browsing results above. Synthesize this information to provide an up-to-date, comprehensive, and accurate response. Always cite your sources using clickable Markdown links [Source Title](URL).\n-------------------------------------------\n`;
}
