const axios = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';

const BASE_URL    = 'https://portal.dkut.ac.ke';
const SESSION_TTL = 30 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 OPR/129.0.0.0';

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

function commonHeaders(cookies, referer) {
    return {
        'User-Agent'                : UA,
        'Accept'                    : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language'           : 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding'           : 'gzip, deflate, br',
        'Connection'                : 'keep-alive',
        'Upgrade-Insecure-Requests' : '1',
        'Sec-Fetch-Dest'            : 'document',
        'Sec-Fetch-Mode'            : 'navigate',
        'Sec-Fetch-Site'            : 'same-origin',
        'Cookie'                    : serialize(cookies),
        ...(referer ? { 'Referer': referer } : {}),
    };
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password) {
    let cookies = {};

    // 1. Load login page
    const loginPage = await axios.get(`${BASE_URL}/site/login`, {
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
        validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(loginPage.headers));

    const $    = cheerio.load(loginPage.data);
    const csrf = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val() || '';
    if (!csrf) return { success: false, error: 'No CSRF token on login page' };
    console.log('[login] csrf:', csrf.slice(0, 20) + '...');

    // 2. POST credentials
    const postRes = await axios.post(
        `${BASE_URL}/site/login`,
        new URLSearchParams({
            '_csrf'                 : csrf,
            'LoginForm[username]'   : email,
            'LoginForm[password]'   : password,
            'LoginForm[rememberMe]' : '0',
        }).toString(),
        {
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Cookie'       : serialize(cookies),
                'Referer'      : `${BASE_URL}/site/login`,
                'Origin'       : BASE_URL,
                'User-Agent'   : UA,
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-Mode': 'navigate',
            },
            maxRedirects  : 0,
            validateStatus: () => true,
        }
    );

    cookies = merge(cookies, parseCookies(postRes.headers));
    const location = postRes.headers['location'] || '';
    console.log('[login] POST', postRes.status, '→', location);

    if (postRes.status !== 302)     return { success: false, error: `Login POST returned ${postRes.status}` };
    if (location.includes('login')) return { success: false, error: 'Wrong credentials' };

    // 3. Follow redirect to dashboard
    const followUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    const dashRes = await axios.get(followUrl, {
        headers: commonHeaders(cookies, `${BASE_URL}/site/login`),
        maxRedirects: 5,
        validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(dashRes.headers));
    console.log('[login] dashboard', dashRes.status);

    // 4. Visit feestatement — warms up session state for fee endpoints
    const feeStmt = await axios.get(`${BASE_URL}/student/feestatement`, {
        headers: commonHeaders(cookies, followUrl),
        maxRedirects: 5,
        validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(feeStmt.headers));
    console.log('[login] feestatement', feeStmt.status);

    return { success: true, cookies };
}

// ── Download fee structure file ───────────────────────────────────────────────

async function downloadFee(cookies, filename, type) {
    // Use exact format the browser uses: spaces as + (not %20)
    const qs  = `filename=${filename.replace(/ /g, '+')}&type=${type}`;
    const url = `${BASE_URL}/student/downloadfeestructure?${qs}`;
    console.log('[download]', url);

    const res = await axios.get(url, {
        headers: {
            ...commonHeaders(cookies, `${BASE_URL}/student/feestatement`),
            'Accept'        : 'application/pdf,application/octet-stream,*/*',
            'Sec-Fetch-Dest': 'document',
        },
        responseType  : 'arraybuffer',
        maxRedirects  : 5,
        validateStatus: () => true,
    });

    const ct  = res.headers['content-type'] || '';
    const len = res.headers['content-length'] || res.data?.byteLength || 0;
    console.log('[download] status:', res.status, '| ct:', ct, '| len:', len);

    return {
        status     : res.status,
        buffer     : res.data,
        contentType: ct,
        disposition: res.headers['content-disposition'] || '',
        finalUrl   : res.request?.res?.responseUrl || url,
        url,
    };
}

// ── Fee type map ──────────────────────────────────────────────────────────────

const FEE_TYPES = {
    'CERTIFICATES' : 'CERTIFICATE FEES STRUCTURES',
    'DIPLOMA'      : 'DIPLOMA FEES STRUCTURES',
    'DEGREE'       : 'DEGREE FEES STRUCTURES',
    'POSTGRADUATE' : 'POSTGRADUATE FEES STRUCTURES',
};

// ── Vercel handler ────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const type     = ((req.query && req.query.type) || 'CERTIFICATES').toUpperCase();
    const filename = FEE_TYPES[type] || FEE_TYPES['CERTIFICATES'];

    try {
        const now = Date.now();

        // Re-login if session stale
        if (!sessionCookies || now - sessionTimestamp > SESSION_TTL) {
            const r = await login(DKUT_EMAIL, DKUT_PASSWORD);
            if (!r.success) return res.status(401).json({ error: 'Login failed: ' + r.error });
            sessionCookies   = r.cookies;
            sessionTimestamp = now;
        }

        const file = await downloadFee(sessionCookies, filename, type);

        // Bounced to login → session dead
        if (file.finalUrl.includes('login') || file.status === 401) {
            sessionCookies = null;
            return res.status(401).json({ error: 'Session expired — retry' });
        }

        // Got HTML (error page) instead of a file
        if (file.status !== 200 || file.contentType.includes('text/html')) {
            const bodyText = Buffer.from(file.buffer).toString('utf8');
            const $        = cheerio.load(bodyText);

            // Extract the actual Yii2 error message
            const yiiError = $('.alert-danger, .site-error h1, #error-message').text().trim()
                          || $('h1').first().text().trim()
                          || 'Unknown portal error';

            return res.status(502).json({
                error      : `Portal error on download: "${yiiError}"`,
                http_status: file.status,
                tried_url  : file.url,
                hint       : 'This student account may not have a fee structure assigned, or the portal requires a specific student ID in the URL. Try visiting the portal manually to confirm the download works for this account.',
                // Full body so we can inspect it
                debug_html : bodyText.slice(0, 2000),
            });
        }

        // ✅ Real file — pipe it to the browser
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition',
            file.disposition || `attachment; filename="${filename}.pdf"`);
        if (file.buffer.byteLength) {
            res.setHeader('Content-Length', file.buffer.byteLength);
        }
        return res.status(200).send(Buffer.from(file.buffer));

    } catch (err) {
        console.error('[handler]', err.message);
        return res.status(500).json({ error: err.message });
    }
};
