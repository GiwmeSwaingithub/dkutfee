const API = '/api/fees';

let allData    = null;   // { total, categories }
let collapsed  = {};     // category name → bool

async function init() {
    try {
        const res  = await fetch(API);
        const data = await res.json();
        if (!res.ok || !data.categories) throw new Error(data.error || 'Failed to load');
        allData = data;
        render(data);
        document.getElementById('status').classList.add('hidden');
        document.getElementById('content').classList.remove('hidden');
    } catch (err) {
        document.getElementById('status').innerHTML =
            `<p style="color:#c0392b">⚠️ ${err.message}</p><button onclick="init()" style="margin-top:1rem;padding:.5rem 1.2rem;border-radius:8px;border:none;background:#1a6b3c;color:#fff;cursor:pointer;font-size:.9rem">Retry</button>`;
    }
}

function render(data, query = '') {
    const content = document.getElementById('content');
    content.innerHTML = '';
    const q = query.trim().toLowerCase();

    let totalShown = 0;

    // Stats bar
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = `
        <div class="stat"><strong>${data.total}</strong> fee structures</div>
        <div class="stat"><strong>${Object.keys(data.categories).length}</strong> categories</div>
        <div class="stat" style="color:var(--muted);font-size:.8rem">Click any file to download (requires login)</div>
    `;
    content.appendChild(stats);

    Object.entries(data.categories).forEach(([catName, files]) => {
        const filtered = q
            ? files.filter(f => f.label.toLowerCase().includes(q) || catName.toLowerCase().includes(q))
            : files;
        if (!filtered.length) return;
        totalShown += filtered.length;

        const section = document.createElement('div');
        section.className = 'category';

        const isOpen = !collapsed[catName];

        section.innerHTML = `
            <div class="cat-header" data-cat="${catName}">
                <span class="cat-title">${catName}</span>
                <span class="cat-count">${filtered.length} file${filtered.length !== 1 ? 's' : ''}</span>
                <span class="cat-toggle ${isOpen ? 'open' : ''}">▼</span>
            </div>
            <div class="file-grid" ${isOpen ? '' : 'style="display:none"'}>
                ${filtered.map(f => `
                    <div class="file-card">
                        <div class="file-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#1a6b3c" stroke-width="2" stroke-linecap="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                            </svg>
                        </div>
                        <div class="file-info">
                            <div class="file-label-full" title="${f.label}">${f.label}</div>
                            <div class="file-sub">PDF · ${catName}</div>
                        </div>
                        <button class="dl-btn" onclick="download(this, '${encodeURIComponent(f.downloadPath)}', '${f.label.replace(/'/g,"\\'")}')">⬇</button>
                    </div>
                `).join('')}
            </div>
        `;

        section.querySelector('.cat-header').addEventListener('click', () => {
            collapsed[catName] = !collapsed[catName];
            render(allData, document.getElementById('search').value);
        });

        content.appendChild(section);
    });

    if (totalShown === 0) {
        content.innerHTML += `<div class="no-results">No results for "<strong>${query}</strong>"</div>`;
    }
}

async function download(btn, encodedPath, label) {
    const path = decodeURIComponent(encodedPath);
    btn.disabled = true;
    btn.textContent = '…';
    showToast(`Downloading: ${label}`, false);

    try {
        const res = await fetch(path);

        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            if (json.retry) {
                // Session expired — retry once
                showToast('Re-authenticating, please wait…', false);
                await new Promise(r => setTimeout(r, 1500));
                const retry = await fetch(path);
                if (!retry.ok) throw new Error((await retry.json().catch(()=>({}))).error || `HTTP ${retry.status}`);
                return triggerDownload(await retry.blob(), label);
            }
            throw new Error(json.error || `HTTP ${res.status}`);
        }

        const ct = res.headers.get('content-type') || '';
        if (ct.includes('text/html')) throw new Error('Portal returned a login page — try again');

        triggerDownload(await res.blob(), label);
        showToast('✓ Download started', false);
    } catch (err) {
        showToast(`⚠️ ${err.message}`, true);
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇';
    }
}

function triggerDownload(blob, label) {
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(blob);
    a.download = `${label}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
}

let toastTimer;
function showToast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = `toast${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

document.getElementById('search').addEventListener('input', e => {
    if (allData) render(allData, e.target.value);
});

init();
