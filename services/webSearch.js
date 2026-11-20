// services/webSearch.js
// Real-Time Web Search, News Ingestion & Anti-Hallucination Grounding Engine for iamhujju
import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cleanText(text = '') {
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
 * Autonomous intent detection to determine if query requires live web search
 */
export function shouldTriggerLiveSearch(prompt = '', explicitToggle = false) {
  if (explicitToggle) return true;
  if (!prompt || typeof prompt !== 'string') return false;

  const text = prompt.toLowerCase().trim();

  // Explicit search operators
  if (text.startsWith('/search') || text.startsWith('!search') || text.startsWith('search ')) return true;

  // URL detected in prompt
  if (/https?:\/\/[^\s]+/i.test(prompt)) return true;

  // Temporal keywords indicating current information
  const temporalKeywords = [
    'today', 'tonight', 'yesterday', 'tomorrow', 'now', 'current', 'currently',
    'latest', 'breaking', 'recent', 'recently', 'update', 'updates',
    'this morning', 'this evening', 'this week', 'this month', 'this year',
    '2025', '2026', '2027', 'present day',
    'news', 'headline', 'headlines', 'happening', 'happened',
    'price', 'prices', 'stock', 'stocks', 'crypto', 'bitcoin', 'btc', 'eth',
    'weather', 'forecast', 'score', 'scores', 'match', 'election', 'results',
    'ceo of', 'who is currently', 'who is the new', 'is it true that', 'did ... happen',
    'incident', 'strike', 'attack', 'explosion', 'ceasefire', 'treaty', 'conference'
  ];

  if (temporalKeywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(text))) {
    return true;
  }

  // Geographic and geopolitical hotspots
  const regionalKeywords = [
    'riyadh', 'saudi', 'jeddah', 'aramco', 'pif', 'gulf', 'dubai', 'uae', 'middle east', 'neom'
  ];
  if (regionalKeywords.some(kw => text.includes(kw)) && (
    text.includes('what') || text.includes('who') || text.includes('news') ||
    text.includes('incident') || text.includes('tower') || text.includes('building') ||
    text.includes('report') || text.includes('event') || text.includes('today')
  )) {
    return true;
  }

  return false;
}

/**
 * Fetch and parse a direct web page if user passed a URL
 */
async function fetchDirectWebPage(url, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
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
    const $ = cheerio.load(html);

    const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || new URL(url).hostname;
    const desc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    
    // Clean body text
    $('script, style, noscript, nav, header, footer').remove();
    const bodyContent = cleanText($('body').text()).slice(0, 2000);
    const snippet = (desc ? desc + ' — ' : '') + bodyContent;

    return {
      title: cleanText(title),
      url,
      snippet: snippet.slice(0, 800),
      source: new URL(url).hostname.replace(/^www\./, ''),
      date: new Date().toLocaleDateString()
    };
  } catch {
    return null;
  }
}

/**
 * Tier 1: Query Tavily Search API if configured
 */
async function searchTavily(query, maxResults = 8, timeoutMs = 4500) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'advanced',
        include_answer: true,
        max_results: maxResults
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    return (data.results || []).map(r => ({
      title: cleanText(r.title),
      url: r.url,
      snippet: cleanText(r.content || r.snippet || ''),
      source: new URL(r.url).hostname.replace(/^www\./, ''),
      date: r.published_date || null
    }));
  } catch (err) {
    console.warn('[WebSearch Tier 1] Tavily error:', err.message);
    return null;
  }
}

/**
 * Tier 1: Query Serper Google Search API if configured
 */
async function searchSerper(query, maxResults = 8, timeoutMs = 4500) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const isNews = /news|today|latest|breaking/i.test(query);
    const endpoint = isNews ? 'https://google.serper.dev/news' : 'https://google.serper.dev/search';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: maxResults }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const list = data.news || data.organic || [];
    return list.map(r => ({
      title: cleanText(r.title),
      url: r.link,
      snippet: cleanText(r.snippet || ''),
      source: r.source || (r.link ? new URL(r.link).hostname.replace(/^www\./, '') : 'Web'),
      date: r.date || null
    }));
  } catch (err) {
    console.warn('[WebSearch Tier 1] Serper error:', err.message);
    return null;
  }
}

/**
 * Tier 1: Query Brave Search API if configured
 */
async function searchBrave(query, maxResults = 8, timeoutMs = 4500) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
    const res = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    return (data.web?.results || []).map(r => ({
      title: cleanText(r.title),
      url: r.url,
      snippet: cleanText(r.description || ''),
      source: new URL(r.url).hostname.replace(/^www\./, ''),
      date: r.page_age || null
    }));
  } catch (err) {
    console.warn('[WebSearch Tier 1] Brave error:', err.message);
    return null;
  }
}

/**
 * Tier 3: Search Google News RSS with Cheerio XML parsing (Native, Free, Instant)
 */
async function searchGoogleNewsRSS(query, maxResults = 8, timeoutMs = 4500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const results = [];

    $('item').each((i, element) => {
      if (results.length >= maxResults) return false;
      const elem = $(element);
      let title = elem.find('title').text().trim();
      const link = elem.find('link').text().trim();
      const pubDate = elem.find('pubDate').text().trim();
      let source = elem.find('source').text().trim() || 'Google News';
      let desc = elem.find('description').text();

      // Clean HTML from description
      const snippet = cleanText(desc);

      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        source = parts[parts.length - 1].trim();
        title = parts.slice(0, -1).join(' - ').trim();
      }

      if (title && link) {
        results.push({
          title: cleanText(title),
          url: link,
          snippet: snippet ? snippet.slice(0, 300) : `Live news report from ${source}`,
          source,
          date: pubDate
        });
      }
    });

    return results;
  } catch (err) {
    console.warn('[WebSearch Tier 3] Google News RSS error:', err.message);
    return [];
  }
}

/**
 * Tier 3: Direct Regional / Authoritative RSS feeds (Middle East, Reuters, BBC, Al Jazeera)
 */
async function searchRegionalFeeds(query, timeoutMs = 4000) {
  const isMiddleEast = /saudi|riyadh|jeddah|aramco|pif|uae|dubai|gulf|middle east|iran|yemen/i.test(query);
  if (!isMiddleEast) return [];

  const feeds = [
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'BBC Middle East', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' }
  ];

  const matched = [];
  const qTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  for (const feed of feeds) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((i, element) => {
        if (matched.length >= 4) return false;
        const elem = $(element);
        const title = elem.find('title').text().trim();
        const link = elem.find('link').text().trim();
        const pubDate = elem.find('pubDate').text().trim();
        const desc = cleanText(elem.find('description').text());

        const text = `${title} ${desc}`.toLowerCase();
        const isRelevant = qTerms.some(term => text.includes(term));
        if (isRelevant && title && link) {
          matched.push({
            title: cleanText(title),
            url: link,
            snippet: desc ? desc.slice(0, 250) : `Live coverage from ${feed.name}`,
            source: feed.name,
            date: pubDate
          });
        }
      });
    } catch {
      // Continue next feed
    }
  }

  return matched;
}

/**
 * Tier 3: DuckDuckGo Instant Answer API for factual definitions & encyclopedic info
 */
async function searchDuckDuckGo(query, timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const results = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: cleanText(data.AbstractText),
        source: data.AbstractSource || 'DuckDuckGo Knowledge',
        date: null
      });
    }

    if (Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, 3)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: cleanText(topic.Text).slice(0, 80) + '...',
            url: topic.FirstURL,
            snippet: cleanText(topic.Text),
            source: 'DuckDuckGo Knowledge',
            date: null
          });
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Tier 3: Wikipedia API Search
 */
async function searchWikipedia(query, timeoutMs = 3500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=&srlimit=3`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'iamhujju-web-browser/1.0 (huzaifakazi1991@gmail.com)' },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.query?.search || [];
    return items.map(item => ({
      title: cleanText(item.title),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`,
      snippet: cleanText(item.snippet),
      source: 'Wikipedia',
      date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : null
    }));
  } catch {
    return [];
  }
}

/**
 * Main Multi-Tier Web Search Engine Orchestrator
 */
export async function browseWeb(query = '', { maxResults = 8 } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return { query, sources: [], formattedContext: '' };

  const explicitUrls = extractUrls(trimmed);
  const searchPromises = [];

  // 0. If explicit URLs are present, fetch them first
  if (explicitUrls.length > 0) {
    for (const url of explicitUrls.slice(0, 2)) {
      searchPromises.push(fetchDirectWebPage(url));
    }
  }

  // 1. Tier 1 Check: Paid Search APIs (Tavily, Serper, Brave)
  const tier1Tavily = searchTavily(trimmed, maxResults);
  const tier1Serper = searchSerper(trimmed, maxResults);
  const tier1Brave = searchBrave(trimmed, maxResults);

  const [tavilyRes, serperRes, braveRes] = await Promise.all([tier1Tavily, tier1Serper, tier1Brave]);
  const tier1Results = tavilyRes || serperRes || braveRes;

  if (tier1Results && tier1Results.length > 0) {
    const finalSources = tier1Results.slice(0, maxResults);
    return {
      query: trimmed,
      tier: 'tier1_api',
      sources: finalSources,
      formattedContext: buildGroundingPrompt(finalSources, trimmed)
    };
  }

  // 2. Tier 3: Zero-Failure Free Live Scraping (Google News RSS + Regional Feeds + DDG + Wikipedia)
  const keywordQuery = trimmed.replace(/https?:\/\/[^\s]+/g, '').trim() || trimmed;

  searchPromises.push(searchGoogleNewsRSS(keywordQuery, maxResults));
  searchPromises.push(searchRegionalFeeds(keywordQuery));
  searchPromises.push(searchDuckDuckGo(keywordQuery));
  searchPromises.push(searchWikipedia(keywordQuery));

  const settled = await Promise.allSettled(searchPromises);
  const combined = [];
  const seenUrls = new Set();

  for (const item of settled) {
    if (item.status === 'fulfilled' && item.value) {
      const entries = Array.isArray(item.value) ? item.value : [item.value];
      for (const entry of entries) {
        if (entry && entry.url && !seenUrls.has(entry.url)) {
          seenUrls.add(entry.url);
          combined.push(entry);
        }
      }
    }
  }

  // Sort: articles with real publication dates first, latest dates at the top
  combined.sort((a, b) => {
    if (a.date && b.date) {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    }
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return 0;
  });

  const finalSources = combined.slice(0, maxResults);
  const formattedContext = buildGroundingPrompt(finalSources, trimmed);

  return {
    query: trimmed,
    tier: 'tier3_scraper',
    sources: finalSources,
    formattedContext
  };
}

/**
 * Format search results into AI Model Grounding Context Block
 */
export function buildGroundingPrompt(sources = [], query = '') {
  const now = new Date();
  const utcString = now.toUTCString();
  const localString = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const header = `[REAL-TIME GROUNDING & LIVE CLOCK]
Current UTC Timestamp: ${utcString}
Current Calendar Date: ${localString}

You have active live web access via the verified real-time search results provided below.
CRITICAL INSTRUCTIONS:
1. NEVER state that you lack web access, internet connection, or real-time tools.
2. NEVER state that your training cutoff prevents you from knowing current events.
3. Answer strictly using the verified live sources provided below.
4. Cite every factual claim inline using [1], [2], etc., matching the numbered sources list.
5. If the live search results contain no verified reports of an alleged incident, rumor, or claim, explicitly state that no verified reports were found from authoritative sources as of ${localString}—never guess or fabricate.`;

  if (!sources || sources.length === 0) {
    return `\n\n${header}\n\n[NO LIVE SOURCES RETURNED FOR: "${query}"]\nState clearly that as of ${localString}, no verified real-time sources were retrieved for this specific query.\n`;
  }

  const sourceEntries = sources.map((s, index) => {
    let entry = `[${index + 1}] "${s.title}"\n    Publisher: ${s.source} | URL: ${s.url}`;
    if (s.date) entry += ` | Published: ${s.date}`;
    if (s.snippet) entry += `\n    Verified Excerpt: ${s.snippet}`;
    return entry;
  }).join('\n\n');

  return `\n\n${header}\n\n[VERIFIED LIVE WEB & NEWS SOURCES FOR: "${query}"]\n${sourceEntries}\n\nAnswer the user query accurately, comprehensively, and objectively, citing your sources.\n`;
}
