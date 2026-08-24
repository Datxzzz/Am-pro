const axios = require('axios');
const crypto = require('crypto');

const CONFIG = {
    BASE_URL: 'https://www.alightpro.my.id',
    TIMEOUT: 20000
};

// Algoritma PoW yang dioptimalkan dengan challengeSeed
function generatePow(challengeSeed, difficultyTarget = '0000') {
    let pow = '00000000';
    try {
        for (let i = 0; i < 500000; i++) {
            const test = i.toString(16).padStart(8, '0');
            const hash = crypto.createHash('sha256')
                .update(challengeSeed + test)
                .digest('hex');
            
            if (hash.startsWith(difficultyTarget)) {
                pow = test;
                break;
            }
        }
    } catch (e) {
        pow = Date.now().toString(16);
    }
    return pow;
}

async function getSession() {
    try {
        const response = await axios.get(`${CONFIG.BASE_URL}/api/session`, {
            headers: { 
                'X-Requested-With': 'XMLHttpRequest',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            },
            timeout: CONFIG.TIMEOUT
        });

        // Validasi sesuai struktur JSON respons API terbaru
        if (!response.data || !response.data.token || !response.data.challengeSeed) {
            throw new Error('Format data sesi dari server target tidak valid.');
        }

        return {
            success: true,
            token: response.data.token,
            nonce: response.data.nonce || '',
            challengeSeed: response.data.challengeSeed,
            difficulty: response.data.difficulty || '0000'
        };
    } catch (error) {
        const errDetail = error.response?.data ? 
            (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) 
            : error.message;
        return {
            success: false,
            error: errDetail
        };
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Amankan parsing body request
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { body = {}; }
        }
        body = body || {};

        const { action, email, link } = body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email wajib diisi!' });
        }

        const session = await getSession();
        if (!session.success) {
            return res.status(500).json({ 
                success: false, 
                error: `Gagal mengambil sesi server: ${session.error}` 
            });
        }

        const pow = generatePow(session.challengeSeed, session.difficulty);

        const headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'X-Amprem-Token': session.token,
            'X-Amprem-Nonce': session.nonce,
            'X-Amprem-Pow': pow
        };

        if (action === 'verify' && link) {
            const verifyResponse = await axios.post(`${CONFIG.BASE_URL}/api/alight-motion`, {
                action: 'verify',
                email: email,
                link: link
            }, { headers, timeout: CONFIG.TIMEOUT });

            return res.status(200).json({
                success: true,
                message: 'Akun Alight Motion Berhasil di-upgrade ke Premium!',
                data: verifyResponse.data
            });
        } else {
            const sendResponse = await axios.post(`${CONFIG.BASE_URL}/api/alight-motion`, {
                action: 'send',
                email: email
            }, { headers, timeout: CONFIG.TIMEOUT });

            return res.status(200).json({
                success: true,
                step: 'send_success',
                message: sendResponse.data.msg || 'Link OOB/Konfirmasi telah dikirim ke email Anda.',
            });
        }

    } catch (error) {
        const errorDetail = error.response?.data ? 
            (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) 
            : error.message;
        
        console.error('API Execution Error Stack:', error.stack);
        return res.status(500).json({
            success: false,
            error: `Runtime Exception: ${errorDetail}`
        });
    }
};
