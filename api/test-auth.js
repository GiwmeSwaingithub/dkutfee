// ═══════════════════════════════════════════════════════════════════════════
// /api/test-auth - Test Authentication & Dashboard Access
// ═══════════════════════════════════════════════════════════════════════════

const { getValidSession, getDashboardInfo } = require('./_lib');

const DKUT_EMAIL = process.env.DKUT_EMAIL;
const DKUT_PASSWORD = process.env.DKUT_PASSWORD;

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Validate credentials are configured
    if (!DKUT_EMAIL || !DKUT_PASSWORD) {
        return res.status(500).json({
            error: 'Server configuration error',
            message: 'DKUT_EMAIL and DKUT_PASSWORD environment variables must be set',
            code: 'MISSING_CREDENTIALS',
            credentialsConfigured: false
        });
    }

    try {
        // Step 1: Test login
        const session = await getValidSession(DKUT_EMAIL, DKUT_PASSWORD);
        
        if (!session.success) {
            return res.status(401).json({
                authenticated: false,
                error: session.error,
                code: session.code,
                email: DKUT_EMAIL,
                timestamp: new Date().toISOString()
            });
        }

        // Step 2: Fetch dashboard info
        const dashboardInfo = await getDashboardInfo(session.cookies);

        if (!dashboardInfo.success) {
            return res.status(500).json({
                authenticated: true,
                loginSuccessful: true,
                dashboardAccessible: false,
                error: dashboardInfo.error,
                sessionCached: session.cached,
                timestamp: new Date().toISOString()
            });
        }

        // Success!
        return res.status(200).json({
            authenticated: dashboardInfo.authenticated,
            loginSuccessful: true,
            dashboardAccessible: true,
            user: dashboardInfo.user,
            pageTitle: dashboardInfo.pageTitle,
            email: DKUT_EMAIL,
            sessionCached: session.cached,
            dashboardHtmlLength: dashboardInfo.rawHtmlLength,
            timestamp: new Date().toISOString(),
            message: dashboardInfo.authenticated 
                ? '✓ Authentication successful - Portal access verified'
                : '⚠ Login succeeded but user session not fully established'
        });

    } catch (error) {
        console.error('Unexpected error in /api/test-auth:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            code: 'INTERNAL_ERROR',
            timestamp: new Date().toISOString()
        });
    }
};
