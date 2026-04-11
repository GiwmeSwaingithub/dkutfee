const axios = require('axios');
const cheerio = require('cheerio');

// ⚠️ TEST CREDENTIALS — move to Vercel env vars after testing
const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';

const BASE_URL    = 'https://portal.dkut.ac.ke';
const SESSION_TTL = 30 * 60 * 1000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

let sessionCookies   = null; // cookie map {key: val}
let sessionTimestamp = 0;

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(headers) {
    const raw = headers['set-cookie'] || [];
    const map = {};
    raw.forEach(line => {
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

// ── Shared axios helper (always validates status < 500) ───────────────────────

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
        validateStatus: s => s < 500,
    });
}

// ── Full browser-like login flow ──────────────────────────────────────────────
//
//  Step 1  GET  /site/login          → receive PHPSESSID + _csrf cookie + CSRF token in HTML
//  Step 2  POST /site/login          → send credentials + _csrf, receive 302
//  Step 3  GET  <redirect location>  → follow redirect to establish authenticated session
//  Step 4  GET  /student/feestatement (referrer page, just like the browser does)
//  Step 5  GET  /student/allfeestructure  → actual fee data

async function loginAndScrape(email, password) {
    let cookies = {};

    // ── STEP 1: Load login page ───────────────────────────────────────────────
    console.log('[1] GET /site/login');
    const loginPage = await get(`${BASE_URL}/site/login`, cookies);

    cookies = merge(cookies, parseCookies(loginPage.headers));

    const $lp        = cheerio.load(loginPage.data);
    const csrfToken  =
        $lp('meta[name="csrf-token"]').attr('content') ||
        $lp('input[name="_csrf"]').val() || '';

    console.log('[1] cookies    :', JSON.stringify(cookies));
    console.log('[1] csrf token :', csrfToken || '(none)');

    if (!csrfToken) {
        // Portal may enforce rate-limiting or IP blocking
        return { success: false, error: 'Could not extract CSRF token from login page' };
    }

    // ── STEP 2: POST credentials ──────────────────────────────────────────────
    console.log('[2] POST /site/login');
    const body = new URLSearchParams({
        '_csrf'                 : csrfToken,
        'LoginForm[username]'   : email,
        'LoginForm[password]'   : password,
        'LoginForm[rememberMe]' : '0',
    }).toString();

    const postRes = await axios.post(`${BASE_URL}/site/login`, body, {
        headers: {
            'Content-Type'              : 'application/x-www-form-urlencoded',
            'Cookie'                    : serialize(cookies),
            'Referer'                   : `${BASE_URL}/site/login`,
            'Origin'                    : BASE_URL,
            'User-Agent'                : UA,
            'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Upgrade-Insecure-Requests' : '1',
        },
        maxRedirects  : 0,   // stop at 302 so we can read Location + cookies
        validateStatus: s => s < 500,
    });

    cookies = merge(cookies, parseCookies(postRes.headers));
    const redirectLocation = postRes.headers['location'] || '';

    console.log('[2] status     :', postRes.status);
    console.log('[2] redirect   :', redirectLocation);
    console.log('[2] cookies    :', JSON.stringify(cookies));

    if (postRes.status !== 302) {
        // Still on login page — bad credentials or CSRF mismatch
        const $e = cheerio.load(postRes.data);
        const errText = $e('.alert, .help-block, .error-summary').text().trim();
        return { success: false, error: errText || `Login POST returned ${postRes.status} (expected 302)` };
    }

    if (redirectLocation.includes('login')) {
        return { success: false, error: 'Credentials rejected — portal redirected back to login' };
    }

    // ── STEP 3: Follow the redirect (e.g. /site/index or /student/index) ──────
    const followUrl = redirectLocation.startsWith('http')
        ? redirectLocation
        : `${BASE_URL}${redirectLocation}`;

    console.log('[3] GET', followUrl);
    const dashRes = await get(followUrl, cookies, { 'Referer': `${BASE_URL}/site/login` });
    cookies = merge(cookies, parseCookies(dashRes.headers));

    console.log('[3] status     :', dashRes.status);
    console.log('[3] cookies    :', JSON.stringify(cookies));

    // ── STEP 4: Visit /student/feestatement (the natural referrer page) ───────
    console.log('[4] GET /student/feestatement');
    const feeStmtRes = await get(
        `${BASE_URL}/student/feestatement`,
        cookies,
        { 'Referer': followUrl }
    );
    cookies = merge(cookies, parseCookies(feeStmtRes.headers));

    // Check we're not bounced back to login
    const feeStmtFinalUrl = feeStmtRes.request?.res?.responseUrl || '';
    if (feeStmtFinalUrl.includes('login')) {
        return { success: false, error: 'Session not valid after login — redirected to login on feestatement' };
    }

    console.log('[4] status     :', feeStmtRes.status);

    // ── STEP 5: GET /student/allfeestructure ──────────────────────────────────
    console.log('[5] GET /student/allfeestructure');
    const feeRes = await get(
        `${BASE_URL}/student/allfeestructure`,
        cookies,
        { 'Referer': `${BASE_URL}/student/feestatement` }
    );
    cookies = merge(cookies, parseCookies(feeRes.headers));

    const finalUrl = feeRes.request?.res?.responseUrl || '';
    if (finalUrl.includes('login') || feeRes.status === 401) {
        return { success: false, error: 'SESSION_EXPIRED — redirected to login on fee structure page' };
    }

    console.log('[5] status     :', feeRes.status);
    console.log('[5] body length:', feeRes.data?.length || 0);

    // ── Parse the fee page ────────────────────────────────────────────────────
    const $ = cheerio.load(feeRes.data);
    const result = { lastUpdated: new Date().toISOString(), data: [] };

    // Strategy 1 — <table> with thead/tbody
    $('table').each((_, table) => {
        const headers = [];
        $(table).find('thead th, thead td').each((_, th) => {
            headers.push($(th).text().trim());
        });

        $(table).find('tbody tr').each((_, row) => {
            const cells = $(row).find('td');
            if (!cells.length) return;

            const entry = {};
            cells.each((i, td) => {
                entry[headers[i] || i] = $(td).text().trim();
            });

            result.data.push({
                category   : entry[headers[0]] || Object.values(entry)[0] || '—',
                amount     : entry[headers[1]] || Object.values(entry)[1] || '—',
                description: entry[headers[2]] || Object.values(entry)[2] || '',
            });
        });
    });

    // Strategy 2 — Bootstrap panels / cards
    if (!result.data.length) {
        $('.panel, .card, .fee-item, .list-group-item').each((_, el) => {
            const cat = $(el).find('h3,h4,strong,.category,.title').first().text().trim();
            const amt = $(el).find('.amount,.price,.fee,.value').first().text().trim();
            if (cat) result.data.push({ category: cat, amount: amt || 'N/A', description: '' });
        });
    }

    // Strategy 3 — definition lists
    if (!result.data.length) {
        $('dl').each((_, dl) => {
            const dts = $(dl).find('dt');
            const dds = $(dl).find('dd');
            dts.each((i, dt) => {
                result.data.push({
                    category   : $(dt).text().trim(),
                    amount     : $(dds[i]).text().trim(),
                    description: '',
                });
            });
        });
    }

    // Debug — expose raw content so we can adapt the parser if needed
    if (!result.data.length) {
        result.note         = 'No fee rows found — review debug fields below';
        result.debug_text   = $('body').text().replace(/\s+/g, ' ').slice(0, 1000).trim();
        result.debug_html   = $('#content, main, .container, .wrapper').first().html()?.slice(0, 3000) || $('body').html()?.slice(0, 3000);
    }

    return { success: true, cookies, data: result };
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
            console.log('[handler] starting full login + scrape flow');
            const r = await loginAndScrape(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: r.error });

            sessionCookies   = r.cookies;
            sessionTimestamp = now;
            return res.status(200).json(r.data);
        }

        // Session still valid — just scrape
        console.log('[handler] reusing session, scraping fee page');
        const feeRes = await get(
            `${BASE_URL}/student/allfeestructure`,
            sessionCookies,
            { 'Referer': `${BASE_URL}/student/feestatement` }
        );

        const finalUrl = feeRes.request?.res?.responseUrl || '';
        if (finalUrl.includes('login')) {
            // Session expired — redo full flow
            console.log('[handler] session expired, re-running full flow');
            sessionCookies = null;
            const r = await loginAndScrape(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: r.error });
            sessionCookies   = r.cookies;
            sessionTimestamp = now;
            return res.status(200).json(r.data);
        }

        // Parse (reuse same logic inline)
        const $ = cheerio.load(feeRes.data);
        const result = { lastUpdated: new Date().toISOString(), data: [] };

        $('table').each((_, table) => {
            const headers = [];
            $(table).find('thead th, thead td').each((_, th) => headers.push($(th).text().trim()));
            $(table).find('tbody tr').each((_, row) => {
                const cells = $(row).find('td');
                if (!cells.length) return;
                const entry = {};
                cells.each((i, td) => { entry[headers[i] || i] = $(td).text().trim(); });
                result.data.push({
                    category   : entry[headers[0]] || Object.values(entry)[0] || '—',
                    amount     : entry[headers[1]] || Object.values(entry)[1] || '—',
                    description: entry[headers[2]] || Object.values(entry)[2] || '',
                });
            });
        });

        if (!result.data.length) {
            result.note       = 'No fee rows found — review debug fields';
            result.debug_text = $('body').text().replace(/\s+/g, ' ').slice(0, 1000).trim();
            result.debug_html = $('body').html()?.slice(0, 3000);
        }

        return res.status(200).json(result);

    } catch (err) {
        console.error('[handler] unhandled error:', err);
        return res.status(500).json({ error: 'Internal error: ' + err.message });
    }
};
