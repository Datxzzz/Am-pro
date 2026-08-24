const axios = require('axios');
const crypto = require('crypto');

const CONFIG = {
    BASE_URL: 'https://www.alightpro.my.id',
    TIMEOUT: 60000
};

// Algoritma PoW disesuaikan menggunakan challengeSeed dari server
function generatePow(challengeSeed, difficultyTarget = '0000') {
    let pow = '';
    let found = false;
    
    for (let i = 0; i < 2000000; i++) {
        const test = i.toString(16).padStart(8, '0');
        const hash = crypto.createHash('sha256')
            .update(challengeSeed + test)
            .digest('hex');
        
        if (hash.startsWith(difficultyTarget)) {
            pow = test;
            found = true;
            break;
        }
    }
    
    if (!found) {
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

        // Validasi sesuai struktur JSON terbaru dari server
        if (!response.data || !response.data.token || !response.data.challengeSeed) {
            throw new Error('Format data sesi dari server target tidak valid.');
        }

        return {
            success: true,
            token: response.data.token,
            nonce: response.data.nonce,
            challengeSeed: response.data.challengeSeed,
            difficulty: response.data.difficulty || '0000'
        };
    } catch (error) {
        console.error('Session Error Detail:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data || error.message
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
        const { action, email, link } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Email wajib diisi!' });
        }

        const session = await getSession();
        if (!session.success) {
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal mengambil sesi server.' 
            });
        }

        // Generate PoW menggunakan challengeSeed yang didapat dari API session
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
        console.error('API Execution Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
};
