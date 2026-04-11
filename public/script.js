// Configuration - Use relative paths for Vercel serverless functions
const API_URL = '/api';

// State
let allFees = [];
let filteredFees = [];

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const contentState = document.getElementById('contentState');
const errorMessage = document.getElementById('errorMessage');
const feeTableBody = document.getElementById('feeTableBody');
const totalCategories = document.getElementById('totalCategories');
const lastUpdated = document.getElementById('lastUpdated');
const searchInput = document.getElementById('searchInput');
const emptyState = document.getElementById('emptyState');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadFees();
});

// Load fees from API
async function loadFees() {
    showLoading();
    
    try {
        const response = await fetch(`${API_URL}/fees`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Validate data
        if (!data || !data.data || !Array.isArray(data.data)) {
            throw new Error('Invalid data format received from server');
        }
        
        allFees = data.data;
        filteredFees = [...allFees];
        
        renderFees();
        updateStats(data);
        showContent();
        
    } catch (error) {
        console.error('Error loading fees:', error);
        showError(error.message);
    }
}

// Render fee table
function renderFees() {
    // Clear existing rows
    feeTableBody.innerHTML = '';
    
    if (filteredFees.length === 0) {
        emptyState.style.display = 'block';
        document.querySelector('.table-card').style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    document.querySelector('.table-card').style.display = 'block';
    
    filteredFees.forEach((fee, index) => {
        const row = document.createElement('tr');
        row.className = 'fade-in';
        row.style.animationDelay = `${index * 0.05}s`;
        
        row.innerHTML = `
            <td>${escapeHtml(fee.category || 'N/A')}</td>
            <td class="amount">${formatAmount(fee.amount)}</td>
            <td>${escapeHtml(fee.description || '-')}</td>
        `;
        
        feeTableBody.appendChild(row);
    });
}

// Filter fees based on search input
function filterFees() {
    const query = searchInput.value.toLowerCase().trim();
    
    if (!query) {
        filteredFees = [...allFees];
    } else {
        filteredFees = allFees.filter(fee => {
            const category = (fee.category || '').toLowerCase();
            const amount = (fee.amount || '').toString().toLowerCase();
            const description = (fee.description || '').toLowerCase();
            
            return category.includes(query) || 
                   amount.includes(query) || 
                   description.includes(query);
        });
    }
    
    renderFees();
}

// Update statistics
function updateStats(data) {
    totalCategories.textContent = allFees.length;
    
    if (data.lastUpdated) {
        const date = new Date(data.lastUpdated);
        lastUpdated.textContent = formatRelativeTime(date);
    }
}

// Format amount
function formatAmount(amount) {
    if (!amount) return 'N/A';
    
    // If already formatted with currency, return as is
    if (typeof amount === 'string' && amount.includes('KES')) {
        return amount;
    }
    
    // Try to extract number
    const numberMatch = amount.toString().match(/[\d,]+/);
    if (numberMatch) {
        const number = numberMatch[0].replace(/,/g, '');
        return `KES ${parseInt(number).toLocaleString()}`;
    }
    
    return amount;
}

// Format relative time
function formatRelativeTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    
    return date.toLocaleDateString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// UI State Management
function showLoading() {
    loadingState.style.display = 'block';
    errorState.style.display = 'none';
    contentState.style.display = 'none';
}

function showError(message) {
    loadingState.style.display = 'none';
    errorState.style.display = 'block';
    contentState.style.display = 'none';
    errorMessage.textContent = message;
}

function showContent() {
    loadingState.style.display = 'none';
    errorState.style.display = 'none';
    contentState.style.display = 'block';
}

// Export for inline handlers
window.loadFees = loadFees;
window.filterFees = filterFees;
