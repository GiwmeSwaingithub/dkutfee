const axios = require('axios');
const cheerio = require('cheerio');

// Session storage (serverless - use simple in-memory for demo, consider Vercel KV for production)
let sessionCache = null;
let sessionTimestamp = 0;

// Session TTL: 30 minutes
const SESSION_TTL = 30 * 60 * 1000;

async function login(email, password) {
    try {
        const axiosInstance = axios.create({
            withCredentials: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // Get login page
        const loginPageResponse = await axiosInstance.get('https://portal.dkut.ac.ke/');
        const cookies = loginPageResponse.headers['set-cookie'];
        
        // Perform login
        const loginResponse = await axiosInstance.post(
            'https://portal.dkut.ac.ke/site/login',
            new URLSearchParams({
                'LoginForm[username]': email,
                'LoginForm[password]': password,
                'LoginForm[rememberMe]': '0'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookies ? cookies.join('; ') : '',
                    'Referer': 'https://portal.dkut.ac.ke/'
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            }
        );

        const sessionCookies = loginResponse.headers['set-cookie'];
        
        return {
            success: true,
            cookies: sessionCookies
        };
    } catch (error) {
        console.error('Login error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

async function scrapeFeeStructure(cookies) {
    try {
        const response = await axios.get(
            'https://portal.dkut.ac.ke/student/allfeestructure',
            {
                headers: {
                    'Cookie': cookies.join('; '),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        const $ = cheerio.load(response.data);
        
        const feeStructure = {
            lastUpdated: new Date().toISOString(),
            data: []
        };

        // Parse fee structure table (adjust selectors based on actual HTML)
        $('table tr').each((index, element) => {
            if (index === 0) return; // Skip header
            
            const cells = $(element).find('td');
            if (cells.length >= 2) {
                feeStructure.data.push({
                    category: $(cells[0]).text().trim(),
                    amount: $(cells[1]).text().trim(),
                    description: $(cells[2]).text().trim() || ''
                });
            }
        });

        // If no table found, try alternative structures
        if (feeStructure.data.length === 0) {
            $('.fee-item, .panel, .card').each((index, element) => {
                const category = $(element).find('.category, h3, h4, strong').first().text().trim();
                const amount = $(element).find('.amount, .price, .fee').first().text().trim();
                
                if (category && amount) {
                    feeStructure.data.push({ 
                        category, 
                        amount,
                        description: $(element).find('p, .description').first().text().trim() || ''
                    });
                }
            });
        }

        return {
            success: true,
            data: feeStructure
        };
    } catch (error) {
        console.error('Scraping error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Get credentials from environment variables
        const email = process.env.DKUT_EMAIL;
        const password = process.env.DKUT_PASSWORD;

        if (!email || !password) {
            return res.status(500).json({
                error: 'Server configuration error: Credentials not set'
            });
        }

        // Check if session is valid
        const now = Date.now();
        if (!sessionCache || (now - sessionTimestamp) > SESSION_TTL) {
            console.log('Creating new session...');
            const loginResult = await login(email, password);
            
            if (!loginResult.success) {
                return res.status(401).json({ 
                    error: 'Authentication failed: ' + loginResult.error 
                });
            }
            
            sessionCache = loginResult.cookies;
            sessionTimestamp = now;
        }

        // Scrape fee structure
        const result = await scrapeFeeStructure(sessionCache);
        
        if (result.success) {
            return res.status(200).json(result.data);
        } else {
            return res.status(500).json({ 
                error: 'Failed to retrieve fee structure: ' + result.error 
            });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error: ' + error.message 
        });
    }
};
