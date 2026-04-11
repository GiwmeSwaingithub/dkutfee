const API_BASE = '/api/lostandfound';

const searchBtn = document.getElementById('searchBtn');
const regInput = document.getElementById('regInput');
const statusDiv = document.getElementById('status');
const resultsContainer = document.getElementById('resultsContainer');
const noResultsDiv = document.getElementById('noResults');
const resultsBody = document.getElementById('resultsBody');
const resultCountSpan = document.getElementById('resultCount');
const searchError = document.getElementById('searchError');
const toast = document.getElementById('toast');

// Helper: show toast
let toastTimer;
function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = `toast${isError ? ' error' : ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// Helper: clear UI
function resetUI() {
    resultsContainer.classList.add('hidden');
    noResultsDiv.classList.add('hidden');
    searchError.classList.add('hidden');
    resultsBody.innerHTML = '';
}

// Perform search
async function performSearch() {
    const reg = regInput.value.trim();
    if (!reg) {
        searchError.textContent = 'Please enter a registration number.';
        searchError.classList.remove('hidden');
        return;
    }

    resetUI();
    statusDiv.classList.remove('hidden');
    searchBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}?reg=${encodeURIComponent(reg)}`);
        const data = await res.json();

        if (!res.ok) {
            if (data.retry) {
                showToast('Session expired, retrying...', false);
                await new Promise(r => setTimeout(r, 1500));
                const retryRes = await fetch(`${API_BASE}?reg=${encodeURIComponent(reg)}`);
                const retryData = await retryRes.json();
                if (!retryRes.ok) throw new Error(retryData.error || 'Retry failed');
                return displayResults(retryData);
            }
            throw new Error(data.error || `HTTP ${res.status}`);
        }

        displayResults(data);
    } catch (err) {
        showToast(`Error: ${err.message}`, true);
        statusDiv.classList.add('hidden');
        searchError.textContent = err.message;
        searchError.classList.remove('hidden');
    } finally {
        searchBtn.disabled = false;
        statusDiv.classList.add('hidden');
    }
}

function displayResults(data) {
    const items = data.items || [];
    if (items.length === 0) {
        noResultsDiv.classList.remove('hidden');
        return;
    }

    resultCountSpan.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;
    resultsBody.innerHTML = items.map(item => `
        <tr>
            <td>${escapeHtml(item.itemType) || '—'}</td>
            <td>${escapeHtml(item.itemName) || '—'}</td>
            <td>${escapeHtml(item.description) || '—'}</td>
            <td>${escapeHtml(item.studentReg) || '—'}</td>
            <td>${escapeHtml(item.dateUploaded) || '—'}</td>
            <td>
                ${item.viewUrl ? `<a href="${escapeHtml(item.viewUrl)}" target="_blank" class="view-link" rel="noopener">View</a>` : '—'}
            </td>
        </tr>
    `).join('');

    resultsContainer.classList.remove('hidden');
}

// Simple escape
function escapeHtml(text) {
    if (!text) return text;
    return String(text).replace(/[&<>"]/g, function(c) {
        if (c === '&') return '&amp;';
        if (c === '<') return '&lt;';
        if (c === '>') return '&gt;';
        if (c === '"') return '&quot;';
        return c;
    });
}

// Event listeners
searchBtn.addEventListener('click', performSearch);
regInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

// Optionally pre-fill from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const regFromUrl = urlParams.get('reg');
if (regFromUrl) {
    regInput.value = regFromUrl;
    performSearch();
}
