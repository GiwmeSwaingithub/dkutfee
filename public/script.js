const API = '/api/fees';
const CACHE_KEY = 'dkut_fees_v1';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

let allData   = null;
let collapsed = {};

// ── Cache helpers ────────────────────────────────────────────────────────────
function getCached() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { ts, data } = JSON.parse(raw);
        if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
        return data;
    } catch { return null; }
}
function setCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function clearCache() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function showSkeleton() {
    const content = document.getElementById('content');
    content.classList.remove('hidden');
    content.innerHTML = `
        <div class="stats">
            <div class="stat"><div class="skeleton-header" style="width:80px;height:18px;margin:0"></div></div>
            <div class="stat"><div class="skeleton-header" style="width:80px;height:18px;margin:0"></div></div>
        </div>
        ${[1,2,3].map(() => `
            <div class="skeleton-section">
                <div class="skeleton-header"></div>
                <div class="skeleton-grid">
                    ${[1,2,3,4].map(i => `<div class="skeleton-card" style="animation-delay:${i*.08}s"></div>`).join('')}
                </div>
            </div>
        `).join('')}
    `;
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init(forceRefresh = false) {
    const statusDiv = document.getElementById('status');
    const content   = document.getElementById('content');

    // Try cache first (instant load feel)
    if (!forceRefresh) {
        const cached = getCached();
        if (cached) {
            allData = cached;
            statusDiv.classList.add('hidden');
            render(cached);
            content.classList.remove('hidden');
            return;
        }
    }

    // Show skeleton while fetching
    showSkeleton();
    statusDiv.classList.add('hidden');
    setRefreshSpinning(true);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const res  = await fetch(API, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();

        if (!res.ok || !data.categories) throw new Error(data.error || 'Failed to load fee structures');

        allData = data;
        setCache(data);
        render(data);

        if (forceRefresh) showToast('✓ Data refreshed', 'success');
    } catch (err) {
        const msg = err.name === 'AbortError' ? 'Request timed out — check your connection' : err.message;
        content.innerHTML = `
            <div class="error-state">
                <p>⚠️ ${msg}</p>
                <button class="retry-btn" onclick="init()">Try Again</button>
            </div>
        `;
        showToast(msg, 'error');
    } finally {
        setRefreshSpinning(false);
    }
}

// ── Refresh button state ─────────────────────────────────────────────────────
function setRefreshSpinning(on) {
    const btn = document.getElementById('refreshBtn');
    if (!btn) return;
    btn.classList.toggle('spinning', on);
    btn.disabled = on;
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(data, query = '') {
    const content = document.getElementById('content');
    content.innerHTML = '';
    const q = query.trim().toLowerCase();

    let totalShown = 0;
    const cats = Object.entries(data.categories);

    // Stats bar
    const cached = getCached();
    const fromCache = !!cached;
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = `
        <div class="stat"><strong>${data.total}</strong> fee structures</div>
        <div class="stat"><strong>${cats.length}</strong> categories</div>
        <div class="stat"><span class="stat-badge">PDF</span> Click any file to download</div>
    `;
    content.appendChild(stats);

    cats.forEach(([catName, files], catIdx) => {
        const filtered = q
            ? files.filter(f => f.label.toLowerCase().includes(q) || catName.toLowerCase().includes(q))
            : files;
        if (!filtered.length) return;
        totalShown += filtered.length;

        const section = document.createElement('div');
        section.className = 'category';
        section.style.animationDelay = `${catIdx * 0.06}s`;

        const isOpen = !collapsed[catName];

        section.innerHTML = `
            <div class="cat-header" role="button" aria-expanded="${isOpen}" tabindex="0">
                <span class="cat-dot"></span>
                <span class="cat-title">${catName}</span>
                <span class="cat-count">${filtered.length}</span>
                <span class="cat-toggle ${isOpen ? 'open' : ''}">▾</span>
            </div>
            <div class="file-grid" ${isOpen ? '' : 'style="display:none"'}>
                ${filtered.map((f, i) => `
                    <div class="file-card" style="animation-delay:${(catIdx * 0.04 + i * 0.05).toFixed(2)}s">
                        <div class="file-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1a6b3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                                <polyline points="10 9 9 9 8 9"/>
                            </svg>
                        </div>
                        <div class="file-info">
                            <div class="file-label-full" title="${escHtml(f.label)}">${escHtml(f.label)}</div>
                            <div class="file-sub">PDF · ${escHtml(catName)}</div>
                        </div>
                        <button class="dl-btn" data-path="${escHtml(f.downloadPath)}" data-label="${escHtml(f.label)}">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                                <path d="M6 1v7M3 5l3 3 3-3M1 10h10"/>
                            </svg>
                            <span>Get</span>
                        </button>
                        <div class="dl-progress"><div class="dl-progress-bar"></div></div>
                    </div>
                `).join('')}
            </div>
        `;

        // Toggle collapse with smooth animation
        const header = section.querySelector('.cat-header');
        const grid   = section.querySelector('.file-grid');
        const toggle = section.querySelector('.cat-toggle');

        const doToggle = () => {
            collapsed[catName] = !collapsed[catName];
            toggle.classList.toggle('open', !collapsed[catName]);
            header.setAttribute('aria-expanded', String(!collapsed[catName]));
            if (collapsed[catName]) {
                grid.style.opacity = '0';
                setTimeout(() => { grid.style.display = 'none'; grid.style.opacity = ''; }, 280);
            } else {
                grid.style.display = '';
                grid.style.opacity = '0';
                requestAnimationFrame(() => {
                    grid.style.transition = 'opacity .3s ease';
                    grid.style.opacity = '1';
                    setTimeout(() => { grid.style.transition = ''; }, 320);
                });
            }
        };
        header.addEventListener('click', doToggle);
        header.addEventListener('keypress', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doToggle(); } });

        // Download buttons — event delegation
        grid.addEventListener('click', e => {
            const btn = e.target.closest('.dl-btn');
            if (!btn || btn.disabled) return;
            ripple(btn, e);
            const card = btn.closest('.file-card');
            download(btn, btn.dataset.path, btn.dataset.label, card);
        });

        content.appendChild(section);
    });

    if (totalShown === 0 && q) {
        const div = document.createElement('div');
        div.className = 'no-results';
        div.innerHTML = `No results for "<strong>${escHtml(query)}</strong>"`;
        content.appendChild(div);
    }
}

// ── Download ─────────────────────────────────────────────────────────────────
const activeDownloads = new Set();

async function download(btn, path, label, card) {
    if (activeDownloads.has(path)) return;
    activeDownloads.add(path);

    const progress = card?.querySelector('.dl-progress');
    const span     = btn.querySelector('span');
    const icon     = btn.querySelector('svg');

    btn.disabled = true;
    btn.classList.add('loading');
    if (span) span.textContent = '…';
    if (progress) progress.classList.add('active');

    showToast(`Fetching ${label}…`, 'info');

    try {
        let res = await fetch(path);

        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            if (json.retry) {
                showToast('Re-authenticating, retrying…', 'info');
                await delay(1600);
                res = await fetch(path);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
            } else {
                throw new Error(json.error || `HTTP ${res.status}`);
            }
        }

        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) throw new Error('Portal returned a login page — please try again');

        const blob = await res.blob();
        triggerDownload(blob, label);

        btn.classList.remove('loading');
        btn.classList.add('done');
        if (span) span.textContent = '✓';
        showToast(`✓ ${label} downloaded`, 'success');
        setTimeout(() => {
            btn.classList.remove('done');
            if (span) span.textContent = 'Get';
            btn.disabled = false;
        }, 2200);

    } catch (err) {
        showToast(`⚠️ ${err.message}`, 'error');
        btn.classList.remove('loading');
        if (span) span.textContent = 'Get';
        btn.disabled = false;
    } finally {
        if (progress) progress.classList.remove('active');
        activeDownloads.delete(path);
    }
}

function triggerDownload(blob, label) {
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(blob);
    a.download = `${label}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ── Ripple effect ────────────────────────────────────────────────────────────
function ripple(btn, e) {
    const r    = document.createElement('span');
    r.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
}

// ── Toast ────────────────────────────────────────────────────────────────────
let toastEl, toastTimer;
function showToast(msg, type = 'info') {
    if (!toastEl) toastEl = document.getElementById('toast');
    clearTimeout(toastTimer);
    toastEl.classList.remove('toast-exit', 'error', 'success', 'hidden');

    const icons = { success: '✓ ', error: '⚠ ', info: '' };
    toastEl.textContent = (icons[type] || '') + msg;
    toastEl.className   = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`.trim();

    toastTimer = setTimeout(() => {
        toastEl.classList.add('toast-exit');
        setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 3500);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(t) {
    if (!t) return '';
    return String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Search with debounce ─────────────────────────────────────────────────────
let searchTimer;
document.getElementById('search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        if (allData) render(allData, e.target.value);
    }, 120);
});

// ── Refresh button ───────────────────────────────────────────────────────────
document.getElementById('refreshBtn')?.addEventListener('click', () => {
    clearCache();
    allData = null;
    init(true);
});

// ── Boot ─────────────────────────────────────────────────────────────────────
init();
