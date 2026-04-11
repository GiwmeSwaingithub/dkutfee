const axios = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';
const BASE_URL      = 'https://portal.dkut.ac.ke';
const SESSION_TTL   = 25 * 60 * 1000;            // 25 minutes
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 OPR/129.0.0.0';

let sessionCookies   = null;
let sessionTimestamp = 0;
let cachedFeeList    = null;                     // { total, categories, urlMap }

// ── Cookie helpers ───────────────────────────────────────────────────────────
function parseCookies(headers) {
    const map = {};
    (headers['set-cookie'] || []).forEach(line => {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    });
    return map;
}
function serialize(map) {
    return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Login (uses /site/index, the real login page) ───────────────────────────
async function login(email, password) {
    let cookies = {};

    // 1. GET the login page (homepage with form)
    const home = await axios.get(`${BASE_URL}/site/index`, {
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
        validateStatus: () => true
    });
    cookies = { ...cookies, ...parseCookies(home.headers) };

    const $ = cheerio.load(home.data);
    // CSRF token can be in meta tag or inside the form
    const csrf = $('meta[name="csrf-token"]').attr('content') ||
                 $('input[name="_csrf"]').val();
    if (!csrf) return { success: false, error: 'No CSRF token found on login page' };

    // 2. POST credentials to the same /site/index endpoint
    const post = await axios.post(`${BASE_URL}/site/index`,
        new URLSearchParams({
            '_csrf': csrf,
            'UserForm[email]': email,
            'UserForm[password]': password
        }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': serialize(cookies),
                'Referer': `${BASE_URL}/site/index`,
                'Origin': BASE_URL,
                'User-Agent': UA
            },
            maxRedirects: 0,          // we handle redirect manually
            validateStatus: () => true
        }
    );

    cookies = { ...cookies, ...parseCookies(post.headers) };
    const location = post.headers['location'] || '';

    if (post.status !== 302) {
        return { success: false, error: `Login POST returned ${post.status}` };
    }
    if (location.includes('site/index') || location.includes('login')) {
        return { success: false, error: 'Invalid credentials' };
    }

    // 3. Follow redirect to dashboard (establishes session)
    const dashUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    const dash = await axios.get(dashUrl, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': `${BASE_URL}/site/index` },
        maxRedirects: 5,
        validateStatus: () => true
    });
    cookies = { ...cookies, ...parseCookies(dash.headers) };

    // 4. Warm‑up: visit the fees page (required for download permissions)
    await axios.get(`${BASE_URL}/student/allfeestructure`, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': dashUrl },
        maxRedirects: 5,
        validateStatus: () => true
    });

    return { success: true, cookies };
}

// ── Scrape all fee structure links from the portal ───────────────────────────
async function scrapeFeeLinks(cookies) {
    const res = await axios.get(`${BASE_URL}/student/allfeestructure`, {
        headers: {
            'User-Agent': UA,
            'Cookie': serialize(cookies),
            'Referer': `${BASE_URL}/dashboard/index`
        }
    });

    if (res.status !== 200) {
        throw new Error(`Failed to fetch fees page: ${res.status}`);
    }

    const $ = cheerio.load(res.data);
    const categories = {};
    const urlMap = new Map();

    // Find every <li> that contains a category button
    $('li').each((_, li) => {
        const $li = $(li);
        const $catButton = $li.find('button.btn-danger');
        if ($catButton.length === 0) return;

        const category = $catButton.text().trim();
        // The next sibling element is a <ul> containing the download links
        const $ul = $li.next('ul');
        if ($ul.length === 0) return;

        $ul.find('a').each((_, a) => {
            const href = $(a).attr('href');
            if (!href || !href.startsWith('/student/downloadfeestructure')) return;
            const fullUrl = `${BASE_URL}${href}`;
            const label = $(a).find('button').text().trim() || $(a).text().trim();

            if (!categories[category]) categories[category] = [];
            categories[category].push({
                label,
                downloadPath: `/api/fees?url=${encodeURIComponent(fullUrl)}`
            });
            urlMap.set(fullUrl, { category, label });
        });
    });

    // Also catch any orphaned links (just in case)
    $('a[href*="/student/downloadfeestructure"]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        if (urlMap.has(fullUrl)) return;
        const label = $(a).find('button').text().trim() || $(a).text().trim();
        const category = 'OTHER';
        if (!categories[category]) categories[category] = [];
        categories[category].push({
            label,
            downloadPath: `/api/fees?url=${encodeURIComponent(fullUrl)}`
        });
        urlMap.set(fullUrl, { category, label });
    });

    return { total: urlMap.size, categories, urlMap };
}
// ── Download proxy ────────────────────────────────────────────────────────────
async function proxyDownload(cookies, targetUrl) {
    const res = await axios.get(targetUrl, {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/pdf,application/octet-stream,*/*',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cookie': serialize(cookies),
            'Referer': `${BASE_URL}/student/allfeestructure`,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Upgrade-Insecure-Requests': '1',
        },
        responseType: 'arraybuffer',
        maxRedirects: 5,
        validateStatus: () => true,
    });
    return {
        status: res.status,
        buffer: res.data,
        contentType: res.headers['content-type'] || '',
        disposition: res.headers['content-disposition'] || ''
    };
}

// ── Vercel handler ───────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // --- Refresh session and fee list if needed ---------------------------------
    const now = Date.now();
    let freshLogin = false;
    if (!sessionCookies || now - sessionTimestamp > SESSION_TTL) {
        const loginResult = await login(DKUT_EMAIL, DKUT_PASSWORD);
        if (!loginResult.success) {
            return res.status(401).json({ error: loginResult.error });
        }
        sessionCookies = loginResult.cookies;
        sessionTimestamp = now;
        freshLogin = true;
    }

    // --- If no fee list cached OR we just logged in, scrape fresh list ---------
    if (!cachedFeeList || freshLogin) {
        try {
            cachedFeeList = await scrapeFeeLinks(sessionCookies);
        } catch (err) {
            // Session might be invalid – force re‑login on next request
            sessionCookies = null;
            return res.status(502).json({ error: `Failed to scrape fee links: ${err.message}`, retry: true });
        }
    }

    // --- If no URL parameter → return the index of all fee files --------------
    if (!req.query || !req.query.url) {
        const { total, categories } = cachedFeeList;
        return res.status(200).json({ total, categories });
    }

    // --- Otherwise, proxy the requested PDF ------------------------------------
    const targetUrl = req.query.url;
    const allowedUrl = cachedFeeList.urlMap.has(targetUrl);
    if (!allowedUrl || !targetUrl.startsWith(BASE_URL)) {
        return res.status(400).json({ error: 'Unknown or disallowed download URL' });
    }

    try {
        const file = await proxyDownload(sessionCookies, targetUrl);
        if (file.status !== 200 || file.contentType.includes('text/html')) {
            // Session likely expired – clear cache and ask client to retry
            sessionCookies = null;
            cachedFeeList = null;
            const bodyText = Buffer.from(file.buffer).toString('utf8');
            const $err = cheerio.load(bodyText);
            return res.status(502).json({
                error: $err('.alert-danger, .site-error').text().trim() || `Portal returned HTTP ${file.status}`,
                retry: true
            });
        }

        const label = cachedFeeList.urlMap.get(targetUrl)?.label || 'fee-structure';
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition', file.disposition || `attachment; filename="${label.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
        if (file.buffer.byteLength) res.setHeader('Content-Length', file.buffer.byteLength);
        return res.status(200).send(Buffer.from(file.buffer));
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};
