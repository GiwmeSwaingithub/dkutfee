const axios = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';

const BASE_URL    = 'https://portal.dkut.ac.ke';
const SESSION_TTL = 30 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

let sessionCookies   = null;
let sessionTimestamp = 0;

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

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function get(url, cookieMap, extraHeaders = {}) {
    return axios.get(url, {
        headers: {
            'User-Agent'                : UA,
            'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language'           : 'en-GB,en-US;q=0.9,en;q=0.8',
            'Connection'                : 'keep-alive',
            'Upgrade-Insecure-Requests' : '1',
            'Cookie'                    : serialize(cookieMap),
            ...extraHeaders,
        },
        maxRedirects  : 10,
        validateStatus: () => true,   // never throw on any HTTP status
    });
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password) {
    let cookies = {};

    // Step 1 — load login page
    console.log('[1] GET /site/login');
    const loginPage = await get(`${BASE_URL}/site/login`, cookies);
    cookies = merge(cookies, parseCookies(loginPage.headers));

    const $lp       = cheerio.load(loginPage.data);
    const csrfToken =
        $lp('meta[name="csrf-token"]').attr('content') ||
        $lp('input[name="_csrf"]').val() || '';

    console.log('[1] cookies:', JSON.stringify(cookies));
    console.log('[1] csrf   :', csrfToken ? 'found' : 'MISSING');

    if (!csrfToken) return { success: false, error: 'Could not find CSRF token on login page' };

    // Step 2 — POST credentials (don't follow redirect)
    console.log('[2] POST /site/login');
    const postRes = await axios.post(
        `${BASE_URL}/site/login`,
        new URLSearchParams({
            '_csrf'                 : csrfToken,
            'LoginForm[username]'   : email,
            'LoginForm[password]'   : password,
            'LoginForm[rememberMe]' : '0',
        }).toString(),
        {
            headers: {
                'Content-Type'              : 'application/x-www-form-urlencoded',
                'Cookie'                    : serialize(cookies),
                'Referer'                   : `${BASE_URL}/site/login`,
                'Origin'                    : BASE_URL,
                'User-Agent'                : UA,
                'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Upgrade-Insecure-Requests' : '1',
            },
            maxRedirects  : 0,
            validateStatus: () => true,
        }
    );

    cookies = merge(cookies, parseCookies(postRes.headers));
    const location = postRes.headers['location'] || '';
    console.log('[2] status  :', postRes.status, '→', location);

    if (postRes.status !== 302) {
        const $e = cheerio.load(postRes.data);
        return { success: false, error: $e('.alert,.help-block,.error-summary').text().trim() || `Login returned ${postRes.status}` };
    }
    if (location.includes('login')) {
        return { success: false, error: 'Credentials rejected — redirected back to login' };
    }

    // Step 3 — follow redirect to establish session
    const followUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    console.log('[3] GET', followUrl);
    const dashRes = await get(followUrl, cookies, { 'Referer': `${BASE_URL}/site/login` });
    cookies = merge(cookies, parseCookies(dashRes.headers));
    console.log('[3] status  :', dashRes.status);

    return { success: true, cookies };
}

// ── Parse any page for fee data ───────────────────────────────────────────────

function parseFees(html, sourceUrl) {
    const $ = cheerio.load(html);
    const data = [];

    // Strategy 1: <table> rows
    $('table').each((_, table) => {
        const headers = [];
        $(table).find('thead th, thead td').each((_, th) => headers.push($(th).text().trim()));

        $(table).find('tbody tr').each((_, row) => {
            const cells = $(row).find('td');
            if (!cells.length) return;
            const vals = [];
            cells.each((_, td) => vals.push($(td).text().trim()));
            if (vals.some(v => v)) {
                data.push({
                    category   : vals[0] || '—',
                    amount     : vals[1] || '—',
                    description: vals[2] || '',
                });
            }
        });

        // table with no thead — treat first row as header, rest as data
        if (!headers.length) {
            $(table).find('tr').each((i, row) => {
                if (i === 0) return;
                const cells = $(row).find('td');
                const vals  = [];
                cells.each((_, td) => vals.push($(td).text().trim()));
                if (vals.some(v => v)) {
                    data.push({ category: vals[0] || '—', amount: vals[1] || '—', description: vals[2] || '' });
                }
            });
        }
    });

    // Strategy 2: Bootstrap panels / cards
    if (!data.length) {
        $('.panel, .card, .fee-item, .list-group-item').each((_, el) => {
            const cat = $(el).find('h3,h4,strong,.category,.title').first().text().trim();
            const amt = $(el).find('.amount,.price,.fee,.value').first().text().trim();
            if (cat) data.push({ category: cat, amount: amt || 'N/A', description: '' });
        });
    }

    // Strategy 3: definition lists
    if (!data.length) {
        $('dl').each((_, dl) => {
            $(dl).find('dt').each((i, dt) => {
                const dd = $(dl).find('dd').eq(i);
                data.push({ category: $(dt).text().trim(), amount: dd.text().trim(), description: '' });
            });
        });
    }

    const result = { lastUpdated: new Date().toISOString(), source: sourceUrl, data };

    if (!data.length) {
        result.note       = 'No fee rows parsed — review debug fields';
        result.debug_text = $('body').text().replace(/\s+/g, ' ').slice(0, 1500).trim();
        result.debug_html = $('#content,main,.container,.wrapper').first().html()?.slice(0, 3000)
                         || $('body').html()?.slice(0, 3000);
    }

    return result;
}

// ── Main flow ─────────────────────────────────────────────────────────────────

async function run(email, password) {
    const loginResult = await login(email, password);
    if (!loginResult.success) return { success: false, error: loginResult.error };

    const cookies = loginResult.cookies;

    // Try the three fee-related URLs in order of likelihood
    const targets = [
        { url: `${BASE_URL}/student/feestatement`,    referer: `${BASE_URL}/site/index` },
        { url: `${BASE_URL}/student/allfeestructure`, referer: `${BASE_URL}/student/feestatement` },
        { url: `${BASE_URL}/student/fees`,            referer: `${BASE_URL}/site/index` },
    ];

    const errors = [];

    for (const { url, referer } of targets) {
        console.log('[scrape] GET', url);
        const res = await get(url, cookies, { Referer: referer });
        console.log('[scrape] status:', res.status, 'url:', url);

        // Bounced to login
        const finalUrl = res.request?.res?.responseUrl || url;
        if (finalUrl.includes('login') || res.status === 401) {
            errors.push(`${url} → session expired`);
            continue;
        }

        if (res.status >= 400) {
            errors.push(`${url} → HTTP ${res.status}`);
            continue;
        }

        // Successfully got a page — parse it
        const parsed = parseFees(res.data, url);

        // If we got real data, return immediately
        if (parsed.data.length > 0) {
            return { success: true, data: parsed };
        }

        // Page loaded but no table found — still return it with debug info
        // so the developer can see what's on the page
        errors.push(`${url} → 200 but no rows parsed`);
        return { success: true, data: parsed };   // return debug info
    }

    return { success: false, error: 'All fee URLs failed: ' + errors.join(' | ') };
}

// ── Vercel handler ────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const now = Date.now();
        const needsLogin = !sessionCookies || (now - sessionTimestamp > SESSION_TTL);

        if (needsLogin) {
            console.log('[handler] full login + scrape');
            const r = await run(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: r.error });
            sessionCookies   = r.data.cookies || null;
            sessionTimestamp = now;
            return res.status(200).json(r.data);
        }

        // Reuse session — scrape feestatement first (known to return 200)
        console.log('[handler] reusing session');
        const feeRes = await get(
            `${BASE_URL}/student/feestatement`,
            sessionCookies,
            { Referer: `${BASE_URL}/site/index` }
        );

        const finalUrl = feeRes.request?.res?.responseUrl || '';
        if (finalUrl.includes('login')) {
            sessionCookies = null;
            return res.status(401).json({ error: 'Session expired — call again to re-login' });
        }

        const parsed = parseFees(feeRes.data, `${BASE_URL}/student/feestatement`);
        return res.status(200).json(parsed);

    } catch (err) {
        console.error('[handler] unhandled error:', err.message);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
};
