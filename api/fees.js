const axios = require('axios');
const cheerio = require('cheerio');

const DKUT_EMAIL    = process.env.DKUT_EMAIL    || 'nyaga.njogu23@students.dkut.ac.ke';
const DKUT_PASSWORD = process.env.DKUT_PASSWORD || '0711660741@Aa';

const BASE_URL    = 'https://portal.dkut.ac.ke';
const SESSION_TTL = 30 * 60 * 1000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

let sessionCookies   = null;
let sessionTimestamp = 0;

// All known fee structure download variants
const FEE_DOWNLOADS = [
    { filename: 'CERTIFICATE FEES STRUCTURES', type: 'CERTIFICATES' },
    { filename: 'DIPLOMA FEES STRUCTURES',     type: 'DIPLOMA' },
    { filename: 'DEGREE FEES STRUCTURES',      type: 'DEGREE' },
    { filename: 'POSTGRADUATE FEES STRUCTURES',type: 'POSTGRADUATE' },
];

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

// ── Login (same proven flow from logs) ───────────────────────────────────────

async function login(email, password) {
    let cookies = {};

    console.log('[1] GET /site/login');
    const loginPage = await axios.get(`${BASE_URL}/site/login`, {
        headers: { 'User-Agent': UA },
        maxRedirects: 5,
        validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(loginPage.headers));

    const $      = cheerio.load(loginPage.data);
    const csrf   = $('meta[name="csrf-token"]').attr('content') || $('input[name="_csrf"]').val() || '';
    if (!csrf) return { success: false, error: 'No CSRF token on login page' };

    console.log('[2] POST /site/login');
    const postRes = await axios.post(
        `${BASE_URL}/site/login`,
        new URLSearchParams({
            '_csrf': csrf,
            'LoginForm[username]'  : email,
            'LoginForm[password]'  : password,
            'LoginForm[rememberMe]': '0',
        }).toString(),
        {
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Cookie'       : serialize(cookies),
                'Referer'      : `${BASE_URL}/site/login`,
                'Origin'       : BASE_URL,
                'User-Agent'   : UA,
            },
            maxRedirects  : 0,
            validateStatus: () => true,
        }
    );

    cookies = merge(cookies, parseCookies(postRes.headers));
    const location = postRes.headers['location'] || '';
    console.log('[2] status:', postRes.status, '→', location);

    if (postRes.status !== 302)        return { success: false, error: `Login POST returned ${postRes.status}` };
    if (location.includes('login'))    return { success: false, error: 'Wrong credentials' };

    // Follow redirect to fully establish session
    const followUrl = location.startsWith('http') ? location : `${BASE_URL}${location}`;
    console.log('[3] GET', followUrl);
    const dashRes = await axios.get(followUrl, {
        headers: { 'Cookie': serialize(cookies), 'User-Agent': UA, 'Referer': `${BASE_URL}/site/login` },
        maxRedirects: 5,
        validateStatus: () => true,
    });
    cookies = merge(cookies, parseCookies(dashRes.headers));
    console.log('[3] status:', dashRes.status);

    return { success: true, cookies };
}

// ── Download a fee file and return as buffer ──────────────────────────────────

async function downloadFeeFile(cookies, filename, type) {
    const url = `${BASE_URL}/student/downloadfeestructure?` +
        new URLSearchParams({ filename, type }).toString();

    console.log('[download] GET', url);

    const res = await axios.get(url, {
        headers: {
            'Cookie'                    : serialize(cookies),
            'User-Agent'                : UA,
            'Referer'                   : `${BASE_URL}/student/feestatement`,
            'Accept'                    : 'application/pdf,application/octet-stream,*/*',
            'Upgrade-Insecure-Requests' : '1',
        },
        responseType  : 'arraybuffer',   // handle binary (PDF/Excel)
        maxRedirects  : 5,
        validateStatus: () => true,
    });

    console.log('[download] status:', res.status,
        '| content-type:', res.headers['content-type'],
        '| content-length:', res.headers['content-length']);

    return {
        status     : res.status,
        buffer     : res.data,
        contentType: res.headers['content-type'] || 'application/octet-stream',
        disposition: res.headers['content-disposition'] || '',
        finalUrl   : res.request?.res?.responseUrl || url,
    };
}

// ── Vercel handler ────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // ?type=CERTIFICATES (optional) — defaults to CERTIFICATES
    const requestedType = (req.query?.type || 'CERTIFICATES').toUpperCase();
    const target = FEE_DOWNLOADS.find(f => f.type === requestedType) || FEE_DOWNLOADS[0];

    try {
        const now = Date.now();

        // Login if needed
        if (!sessionCookies || now - sessionTimestamp > SESSION_TTL) {
            console.log('[handler] logging in...');
            const loginResult = await login(DKUT_EMAIL, DKUT_PASSWORD);
            if (!loginResult.success) {
                return res.status(401).json({ error: 'Login failed: ' + loginResult.error });
            }
            sessionCookies   = loginResult.cookies;
            sessionTimestamp = now;
        }

        const file = await downloadFeeFile(sessionCookies, target.filename, target.type);

        // If bounced to login page — session expired
        if (file.finalUrl.includes('login') || file.status === 401) {
            sessionCookies = null;
            return res.status(401).json({ error: 'Session expired, retry' });
        }

        // Portal returned an error page instead of a file
        if (file.status >= 400 || file.contentType.includes('text/html')) {
            // Convert buffer to text to show debug info
            const text = Buffer.from(file.buffer).toString('utf8').replace(/\s+/g, ' ').slice(0, 800);
            return res.status(502).json({
                error      : `Portal returned ${file.status} with HTML instead of a file`,
                debug_text : text,
                tried_url  : `${BASE_URL}/student/downloadfeestructure?filename=${encodeURIComponent(target.filename)}&type=${target.type}`,
            });
        }

        // ✅ Got a real file — stream it directly to the browser
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Content-Disposition',
            file.disposition || `attachment; filename="${target.filename}.pdf"`);
        if (file.buffer.byteLength) {
            res.setHeader('Content-Length', file.buffer.byteLength);
        }

        return res.status(200).send(Buffer.from(file.buffer));

    } catch (err) {
        console.error('[handler] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
};
