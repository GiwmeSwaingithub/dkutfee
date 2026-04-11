const axios = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';

const BASE_URL    = 'https://portal.dkut.ac.ke';
const SESSION_TTL = 30 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 OPR/129.0.0.0';

let sessionCookies   = null;
let sessionTimestamp = 0;
let cachedLinks      = null; // download links extracted from feestatement

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(headers) {
    const map = {};
    (headers['set-cookie'] || []).forEach(line => {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    });
    return map;
}
function merge(a, b) { return { ...a, ...b }; }
function serialize(map) {
    return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}
function nav(cookies, referer) {
    return {
        'User-Agent'                : UA,
        'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language'           : 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding'           : 'gzip, deflate, br',
        'Connection'                : 'keep-alive',
        'Upgrade-Insecure-Requests' : '1',
        'Sec-Fetch-Dest'            : 'document',
        'Sec-Fetch-Mode'            : 'navigate',
        'Sec-Fetch-Site'            : 'same-origin',
        'Cookie'                    : serialize(cookies),
        ...(referer ? { Referer: referer } : {}),
    };
}

// ── Login + warm-up ───────────────────────────────────────────────────────────

async function loginAndWarmup(email, password) {
    let cookies = {};

    // 1. Login page
    const lp = await axios.get(`${BASE_URL}/site/login`, {
        headers: { 'User-Agent': UA }, maxRedirects: 5, validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(lp.headers));
    const $lp  = cheerio.load(lp.data);
    const csrf = $lp('meta[name="csrf-token"]').attr('content') || $lp('input[name="_csrf"]').val() || '';
    if (!csrf) return { success: false, error: 'No CSRF on login page' };

    // 2. POST login
    const post = await axios.post(
        `${BASE_URL}/site/login`,
        new URLSearchParams({ '_csrf': csrf, 'LoginForm[username]': email, 'LoginForm[password]': password, 'LoginForm[rememberMe]': '0' }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: serialize(cookies), Referer: `${BASE_URL}/site/login`, Origin: BASE_URL, 'User-Agent': UA }, maxRedirects: 0, validateStatus: () => true }
    );
    cookies = merge(cookies, parseCookies(post.headers));
    const loc = post.headers['location'] || '';
    console.log('[login] POST', post.status, '→', loc);
    if (post.status !== 302)   return { success: false, error: `POST returned ${post.status}` };
    if (loc.includes('login')) return { success: false, error: 'Wrong credentials' };

    // 3. Follow redirect to dashboard
    const dashUrl = loc.startsWith('http') ? loc : `${BASE_URL}${loc}`;
    const dash = await axios.get(dashUrl, { headers: nav(cookies, `${BASE_URL}/site/login`), maxRedirects: 5, validateStatus: () => true });
    cookies = merge(cookies, parseCookies(dash.headers));
    console.log('[login] dashboard', dash.status);

    // 4. Load feestatement — this is the referrer page the portal expects
    const stmt = await axios.get(`${BASE_URL}/student/feestatement`, {
        headers: nav(cookies, dashUrl), maxRedirects: 5, validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(stmt.headers));
    console.log('[login] feestatement', stmt.status);

    // 5. Extract all download links from the feestatement page
    const links = extractDownloadLinks(stmt.data);
    console.log('[login] download links found:', links.length, links.map(l => l.label));

    return { success: true, cookies, links, feestatementHtml: stmt.data };
}

// ── Extract download links from feestatement HTML ─────────────────────────────

function extractDownloadLinks(html) {
    const $ = cheerio.load(html);
    const links = [];

    // Find every anchor that points to downloadfeestructure
    $('a[href*="downloadfeestructure"], a[href*="download"], button[onclick*="download"]').each((_, el) => {
        const href    = $(el).attr('href') || $(el).attr('onclick') || '';
        const label   = $(el).text().trim() || $(el).attr('title') || 'Download';
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        if (href) links.push({ label, url: fullUrl });
    });

    // Also look for any form actions that might trigger a download
    $('form[action*="download"]').each((_, form) => {
        const action = $(form).attr('action') || '';
        const label  = $(form).find('button, input[type=submit]').first().text().trim() || 'Download';
        const url    = action.startsWith('http') ? action : `${BASE_URL}${action}`;
        if (action) links.push({ label, url, isForm: true });
    });

    return links;
}

// ── Download a file via its URL ───────────────────────────────────────────────

async function downloadFile(cookies, url) {
    console.log('[download] GET', url);
    const res = await axios.get(url, {
        headers: {
            ...nav(cookies, `${BASE_URL}/student/feestatement`),
            Accept: 'application/pdf,application/octet-stream,*/*',
        },
        responseType  : 'arraybuffer',
        maxRedirects  : 5,
        validateStatus: () => true,
    });
    const ct = res.headers['content-type'] || '';
    console.log('[download] status:', res.status, '| ct:', ct, '| len:', res.data?.byteLength);
    return { status: res.status, buffer: res.data, contentType: ct, disposition: res.headers['content-disposition'] || '', finalUrl: res.request?.res?.responseUrl || url };
}

// ── Vercel handler ────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ?debug=1 → return the raw feestatement HTML so we can inspect it
    const debugMode = req.query && req.query.debug === '1';

    try {
        const now         = Date.now();
        const needsLogin  = !sessionCookies || now - sessionTimestamp > SESSION_TTL;

        if (needsLogin) {
            const r = await loginAndWarmup(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: r.error });
            sessionCookies   = r.cookies;
            sessionTimestamp = now;
            cachedLinks      = r.links;

            // Debug mode: return the raw HTML of feestatement
            if (debugMode) {
                return res.status(200).json({
                    feestatement_html : r.feestatementHtml,
                    download_links    : r.links,
                });
            }
        }

        // ?links=1 → list all download links found on feestatement
        if (req.query && req.query.links === '1') {
            return res.status(200).json({ links: cachedLinks || [] });
        }

        // No download links found on the page
        if (!cachedLinks || cachedLinks.length === 0) {
            return res.status(502).json({
                error: 'No download links found on feestatement page',
                hint : 'Try ?debug=1 to see the raw feestatement HTML and find the correct links',
            });
        }

        // Pick the requested link by index (?i=0) or type keyword (?type=DIPLOMA)
        let target = cachedLinks[0];
        if (req.query && req.query.i !== undefined) {
            target = cachedLinks[parseInt(req.query.i, 10)] || cachedLinks[0];
        } else if (req.query && req.query.type) {
            const kw = req.query.type.toUpperCase();
            target   = cachedLinks.find(l => l.url.toUpperCase().includes(kw) || l.label.toUpperCase().includes(kw)) || cachedLinks[0];
        }

        const file = await downloadFile(sessionCookies, target.url);

        // Bounced to login
        if ((file.finalUrl || '').includes('login') || file.status === 401) {
            sessionCookies = null; cachedLinks = null;
            return res.status(401).json({ error: 'Session expired — retry' });
        }

        // Got HTML instead of file
        if (file.status !== 200 || file.contentType.includes('text/html')) {
            const bodyText = Buffer.from(file.buffer).toString('utf8');
            const $        = cheerio.load(bodyText);
            const errMsg   = $('.alert-danger, .site-error').text().trim() || `HTTP ${file.status}`;
            return res.status(502).json({
                error     : errMsg,
                tried_url : target.url,
                hint      : 'Use ?debug=1 to inspect the feestatement page and find the correct download URL',
                debug_html: bodyText.slice(0, 2000),
            });
        }

        // ✅ Stream the file
        const fname = target.label.replace(/[^a-z0-9 _-]/gi, '') || 'fee-structure';
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', file.disposition || `attachment; filename="${fname}.pdf"`);
        if (file.buffer.byteLength) res.setHeader('Content-Length', file.buffer.byteLength);
        return res.status(200).send(Buffer.from(file.buffer));

    } catch (err) {
        console.error('[handler]', err.message);
        return res.status(500).json({ error: err.message });
    }
};
