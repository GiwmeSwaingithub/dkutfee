const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');

// ── CONFIGURATION ───────────────────────────────────────────────────────────
const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';
const BASE_URL      = 'https://portal.dkut.ac.ke';
const SESSION_TTL   = 25 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 OPR/129.0.0.0';

let sessionCookies   = null;
let sessionTimestamp = 0;
let cachedFeeList    = null;

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

// ── Login ───────────────────────────────────────────────────────────────────
async function login(email, password) {
    let cookies = {};
    const home = await axios.get(`${BASE_URL}/site/index`, {
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
        validateStatus: () => true
    });
    cookies = { ...cookies, ...parseCookies(home.headers) };

    const $ = cheerio.load(home.data);
    const csrf = $('meta[name="csrf-token"]').attr('content') ||
                 $('input[name="_csrf"]').val();
    if (!csrf) return { success: false, error: 'No CSRF token found' };

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
            maxRedirects: 0,
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

    const dashUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    const dash = await axios.get(dashUrl, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': `${BASE_URL}/site/index` },
        maxRedirects: 5,
        validateStatus: () => true
    });
    cookies = { ...cookies, ...parseCookies(dash.headers) };

    await axios.get(`${BASE_URL}/student/allfeestructure`, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': dashUrl },
        maxRedirects: 5,
        validateStatus: () => true
    });

    return { success: true, cookies };
}

// ── Scrape fee links ────────────────────────────────────────────────────────
async function scrapeFeeLinks(cookies) {
    const res = await axios.get(`${BASE_URL}/student/allfeestructure`, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': `${BASE_URL}/dashboard/index` }
    });
    if (res.status !== 200) throw new Error(`Failed to fetch fees page: ${res.status}`);
    const $ = cheerio.load(res.data);
    const categories = {};
    const urlMap = new Map();

    $('li').each((_, li) => {
        const $li = $(li);
        const $catButton = $li.find('button.btn-danger');
        if ($catButton.length === 0) return;
        const category = $catButton.text().trim();
        const $ul = $li.next('ul');
        if ($ul.length === 0) return;
        $ul.find('a').each((_, a) => {
            const href = $(a).attr('href');
            if (!href || !href.startsWith('/student/downloadfeestructure')) return;
            const fullUrl = `${BASE_URL}${href}`;
            const label = $(a).find('button').text().trim() || $(a).text().trim();
            if (!categories[category]) categories[category] = [];
            categories[category].push({ label, downloadPath: `/api/fees?url=${encodeURIComponent(fullUrl)}` });
            urlMap.set(fullUrl, { category, label });
        });
    });

    $('a[href*="/student/downloadfeestructure"]').each((_, a) => {
        const href = $(a).attr('href');
        if (!href) return;
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        if (urlMap.has(fullUrl)) return;
        const label = $(a).find('button').text().trim() || $(a).text().trim();
        const category = 'OTHER';
        if (!categories[category]) categories[category] = [];
        categories[category].push({ label, downloadPath: `/api/fees?url=${encodeURIComponent(fullUrl)}` });
        urlMap.set(fullUrl, { category, label });
    });

    return { total: urlMap.size, categories, urlMap };
}

// ── Download proxy ───────────────────────────────────────────────────────────
async function proxyDownload(cookies, targetUrl) {
    const res = await axios.get(targetUrl, {
        headers: {
            'User-Agent': UA,
            'Accept': 'application/pdf,application/octet-stream,*/*',
            'Cookie': serialize(cookies),
            'Referer': `${BASE_URL}/student/allfeestructure`
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

// ── NEW: Lost & Found search ─────────────────────────────────────────────────
async function searchLostAndFound(cookies, regNumber) {
    const searchUrl = `${BASE_URL}/lostandfound/index?LostAndFoundSearch%5Bstudent_reg%5D=${encodeURIComponent(regNumber)}`;
    const res = await axios.get(searchUrl, {
        headers: { 'User-Agent': UA, 'Cookie': serialize(cookies), 'Referer': `${BASE_URL}/lostandfound/index` },
        maxRedirects: 5,
        validateStatus: () => true
    });
    if (res.status !== 200) throw new Error(`Portal returned ${res.status}`);
    const $ = cheerio.load(res.data);
    const items = [];
    $('table.table tbody tr').each((_, row) => {
        const $row = $(row);
        if ($row.find('input').length > 0) return;
        const cells = $row.find('td');
        if (cells.length < 8) return;
        const id = cells.eq(1).text().trim();
        const itemType = cells.eq(2).text().trim();
        const itemName = cells.eq(3).text().trim();
        const description = cells.eq(4).text().trim();
        const studentReg = cells.eq(5).text().trim();
        const dateUploaded = cells.eq(6).text().trim();
        const viewLink = cells.eq(7).find('a[title="View"]').attr('href');
        items.push({
            id, itemType, itemName, description,
            studentReg, dateUploaded,
            viewUrl: viewLink ? `${BASE_URL}${viewLink}` : null
        });
    });
    return { success: true, items, count: items.length };
}

// ── Vercel handler ───────────────────────────────────────────────────────────
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // --- Refresh session if needed
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

    // --- Route: Lost & Found search
    if (pathname === '/api/lostandfound') {
        const reg = parsedUrl.query.reg;
        if (!reg) return res.status(400).json({ error: 'Missing reg parameter' });
        try {
            const result = await searchLostAndFound(sessionCookies, reg);
            return res.status(200).json(result);
        } catch (err) {
            sessionCookies = null;
            return res.status(502).json({ error: err.message, retry: true });
        }
    }

    // --- Route: Fees
    if (pathname === '/api/fees') {
        if (!cachedFeeList || freshLogin) {
            try {
                cachedFeeList = await scrapeFeeLinks(sessionCookies);
            } catch (err) {
                sessionCookies = null;
                return res.status(502).json({ error: err.message, retry: true });
            }
        }
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            return res.status(200).json({ total: cachedFeeList.total, categories: cachedFeeList.categories });
        }
        if (!cachedFeeList.urlMap.has(targetUrl)) {
            return res.status(400).json({ error: 'Unknown download URL' });
        }
        try {
            const file = await proxyDownload(sessionCookies, targetUrl);
            if (file.status !== 200 || file.contentType.includes('text/html')) {
                sessionCookies = null;
                cachedFeeList = null;
                return res.status(502).json({ error: 'Session expired', retry: true });
            }
            const label = cachedFeeList.urlMap.get(targetUrl)?.label || 'fee-structure';
            res.setHeader('Content-Type', file.contentType);
            res.setHeader('Content-Disposition', file.disposition || `attachment; filename="${label.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
            if (file.buffer.byteLength) res.setHeader('Content-Length', file.buffer.byteLength);
            return res.status(200).send(Buffer.from(file.buffer));
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.status(404).json({ error: 'Endpoint not found' });
};
