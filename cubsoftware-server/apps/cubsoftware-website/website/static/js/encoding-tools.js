// Encoding Tools JavaScript

class EncodingTools {
    constructor() {
        this.initElements();
        this.bindEvents();
    }

    initElements() {
        // Tabs
        this.tabs = document.querySelectorAll('.tab');
        this.panels = document.querySelectorAll('.panel');

        // Hash
        this.hashInput = document.getElementById('hashInput');
        this.md5Result = document.getElementById('md5Result');
        this.sha1Result = document.getElementById('sha1Result');
        this.sha256Result = document.getElementById('sha256Result');
        this.sha384Result = document.getElementById('sha384Result');
        this.sha512Result = document.getElementById('sha512Result');

        // Base64
        this.base64Plain = document.getElementById('base64Plain');
        this.base64Encoded = document.getElementById('base64Encoded');
        this.base64UrlSafe = document.getElementById('base64UrlSafe');

        // URL Encode
        this.urlPlain = document.getElementById('urlPlain');
        this.urlEncoded = document.getElementById('urlEncoded');
        this.urlEncodeAll = document.getElementById('urlEncodeAll');

        // HTML Entities
        this.htmlPlain = document.getElementById('htmlPlain');
        this.htmlEncoded = document.getElementById('htmlEncoded');
        this.htmlNumeric = document.getElementById('htmlNumeric');

        // Encryption
        this.encryptKey = document.getElementById('encryptKey');
        this.encryptPlain = document.getElementById('encryptPlain');
        this.encryptEncoded = document.getElementById('encryptEncoded');

        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Tab switching
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Hash - auto-update on input
        this.hashInput.addEventListener('input', () => this.generateHashes());

        // Base64
        document.getElementById('base64EncodeBtn').addEventListener('click', () => this.base64Encode());
        document.getElementById('base64DecodeBtn').addEventListener('click', () => this.base64Decode());

        // URL Encode
        document.getElementById('urlEncodeBtn').addEventListener('click', () => this.urlEncode());
        document.getElementById('urlDecodeBtn').addEventListener('click', () => this.urlDecode());

        // HTML Entities
        document.getElementById('htmlEncodeBtn').addEventListener('click', () => this.htmlEncode());
        document.getElementById('htmlDecodeBtn').addEventListener('click', () => this.htmlDecode());

        // Encryption
        document.getElementById('encryptBtn').addEventListener('click', () => this.encrypt());
        document.getElementById('decryptBtn').addEventListener('click', () => this.decrypt());
        document.getElementById('toggleKeyBtn').addEventListener('click', () => this.toggleKeyVisibility());

        // Copy buttons
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = document.getElementById(btn.dataset.target);
                this.copyToClipboard(target.value);
            });
        });
    }

    switchTab(tabName) {
        this.tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        this.panels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}-panel`);
        });
    }

    // === Hash Functions ===
    async generateHashes() {
        const text = this.hashInput.value;

        if (!text) {
            this.md5Result.value = '';
            this.sha1Result.value = '';
            this.sha256Result.value = '';
            this.sha384Result.value = '';
            this.sha512Result.value = '';
            return;
        }

        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        // MD5 (using a simple implementation since Web Crypto doesn't support it)
        this.md5Result.value = this.md5(text);

        // SHA hashes using Web Crypto API
        try {
            this.sha1Result.value = await this.hashWithCrypto(data, 'SHA-1');
            this.sha256Result.value = await this.hashWithCrypto(data, 'SHA-256');
            this.sha384Result.value = await this.hashWithCrypto(data, 'SHA-384');
            this.sha512Result.value = await this.hashWithCrypto(data, 'SHA-512');
        } catch (e) {
            console.error('Hash error:', e);
        }
    }

    async hashWithCrypto(data, algorithm) {
        const hashBuffer = await crypto.subtle.digest(algorithm, data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Simple MD5 implementation
    md5(string) {
        function rotateLeft(value, shift) {
            return (value << shift) | (value >>> (32 - shift));
        }

        function addUnsigned(x, y) {
            const x8 = (x & 0x80000000);
            const y8 = (y & 0x80000000);
            const x4 = (x & 0x40000000);
            const y4 = (y & 0x40000000);
            const result = (x & 0x3FFFFFFF) + (y & 0x3FFFFFFF);
            if (x4 & y4) return (result ^ 0x80000000 ^ x8 ^ y8);
            if (x4 | y4) {
                if (result & 0x40000000) return (result ^ 0xC0000000 ^ x8 ^ y8);
                return (result ^ 0x40000000 ^ x8 ^ y8);
            }
            return (result ^ x8 ^ y8);
        }

        function F(x, y, z) { return (x & y) | ((~x) & z); }
        function G(x, y, z) { return (x & z) | (y & (~z)); }
        function H(x, y, z) { return (x ^ y ^ z); }
        function I(x, y, z) { return (y ^ (x | (~z))); }

        function FF(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        function GG(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        function HH(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        function II(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }

        function convertToWordArray(string) {
            let messageLength = string.length;
            let numberOfWords = (((messageLength + 8) - ((messageLength + 8) % 64)) / 64 + 1) * 16;
            let wordArray = Array(numberOfWords - 1);
            let bytePosition = 0;
            let byteCount = 0;
            while (byteCount < messageLength) {
                let wordCount = (byteCount - (byteCount % 4)) / 4;
                bytePosition = (byteCount % 4) * 8;
                wordArray[wordCount] = (wordArray[wordCount] | (string.charCodeAt(byteCount) << bytePosition));
                byteCount++;
            }
            let wordCount = (byteCount - (byteCount % 4)) / 4;
            bytePosition = (byteCount % 4) * 8;
            wordArray[wordCount] = wordArray[wordCount] | (0x80 << bytePosition);
            wordArray[numberOfWords - 2] = messageLength << 3;
            wordArray[numberOfWords - 1] = messageLength >>> 29;
            return wordArray;
        }

        function wordToHex(value) {
            let hex = "", temp = "", byte;
            for (let i = 0; i <= 3; i++) {
                byte = (value >>> (i * 8)) & 255;
                temp = "0" + byte.toString(16);
                hex = hex + temp.substr(temp.length - 2, 2);
            }
            return hex;
        }

        // Convert to UTF-8
        string = unescape(encodeURIComponent(string));

        let x = convertToWordArray(string);
        let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;

        const S11 = 7, S12 = 12, S13 = 17, S14 = 22;
        const S21 = 5, S22 = 9, S23 = 14, S24 = 20;
        const S31 = 4, S32 = 11, S33 = 16, S34 = 23;
        const S41 = 6, S42 = 10, S43 = 15, S44 = 21;

        for (let k = 0; k < x.length; k += 16) {
            let AA = a, BB = b, CC = c, DD = d;

            a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
            d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
            c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
            b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
            a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
            d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
            c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
            b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
            a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
            d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
            c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
            b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
            a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
            d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
            c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
            b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);

            a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
            d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
            c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
            b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
            a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
            d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
            c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
            b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
            a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
            d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
            c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
            b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
            a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
            d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
            c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
            b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);

            a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
            d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
            c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
            b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
            a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
            d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
            c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
            b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
            a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
            d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
            c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
            b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
            a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
            d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
            c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
            b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);

            a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
            d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
            c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
            b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
            a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
            d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
            c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
            b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
            a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
            d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
            c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
            b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
            a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
            d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
            c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
            b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);

            a = addUnsigned(a, AA);
            b = addUnsigned(b, BB);
            c = addUnsigned(c, CC);
            d = addUnsigned(d, DD);
        }

        return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }

    // === Base64 ===
    base64Encode() {
        try {
            const text = this.base64Plain.value;
            let encoded = btoa(unescape(encodeURIComponent(text)));

            if (this.base64UrlSafe.checked) {
                encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }

            this.base64Encoded.value = encoded;
        } catch (e) {
            this.showToast('Error encoding text', true);
        }
    }

    base64Decode() {
        try {
            let encoded = this.base64Encoded.value;

            if (this.base64UrlSafe.checked) {
                encoded = encoded.replace(/-/g, '+').replace(/_/g, '/');
                while (encoded.length % 4) encoded += '=';
            }

            this.base64Plain.value = decodeURIComponent(escape(atob(encoded)));
        } catch (e) {
            this.showToast('Invalid Base64 string', true);
        }
    }

    // === URL Encode ===
    urlEncode() {
        const text = this.urlPlain.value;
        if (this.urlEncodeAll.checked) {
            this.urlEncoded.value = Array.from(text)
                .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
                .join('');
        } else {
            this.urlEncoded.value = encodeURIComponent(text);
        }
    }

    urlDecode() {
        try {
            this.urlPlain.value = decodeURIComponent(this.urlEncoded.value);
        } catch (e) {
            this.showToast('Invalid URL encoded string', true);
        }
    }

    // === HTML Entities ===
    htmlEncode() {
        const text = this.htmlPlain.value;
        const useNumeric = this.htmlNumeric.checked;

        const entities = {
            '&': useNumeric ? '&#38;' : '&amp;',
            '<': useNumeric ? '&#60;' : '&lt;',
            '>': useNumeric ? '&#62;' : '&gt;',
            '"': useNumeric ? '&#34;' : '&quot;',
            "'": useNumeric ? '&#39;' : '&#39;',
            '©': useNumeric ? '&#169;' : '&copy;',
            '®': useNumeric ? '&#174;' : '&reg;',
            '™': useNumeric ? '&#8482;' : '&trade;',
            '€': useNumeric ? '&#8364;' : '&euro;',
            '£': useNumeric ? '&#163;' : '&pound;',
            '¥': useNumeric ? '&#165;' : '&yen;',
            '¢': useNumeric ? '&#162;' : '&cent;',
            '§': useNumeric ? '&#167;' : '&sect;',
            '°': useNumeric ? '&#176;' : '&deg;',
            '±': useNumeric ? '&#177;' : '&plusmn;',
            '×': useNumeric ? '&#215;' : '&times;',
            '÷': useNumeric ? '&#247;' : '&divide;',
            '•': useNumeric ? '&#8226;' : '&bull;',
            '…': useNumeric ? '&#8230;' : '&hellip;',
            '—': useNumeric ? '&#8212;' : '&mdash;',
            '–': useNumeric ? '&#8211;' : '&ndash;',
            ''': useNumeric ? '&#8216;' : '&lsquo;',
            ''': useNumeric ? '&#8217;' : '&rsquo;',
            '"': useNumeric ? '&#8220;' : '&ldquo;',
            '"': useNumeric ? '&#8221;' : '&rdquo;'
        };

        let result = text;
        for (const [char, entity] of Object.entries(entities)) {
            result = result.split(char).join(entity);
        }

        this.htmlEncoded.value = result;
    }

    htmlDecode() {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = this.htmlEncoded.value;
        this.htmlPlain.value = textarea.value;
    }

    // === Encryption (AES-256-GCM) ===
    async encrypt() {
        const key = this.encryptKey.value;
        const text = this.encryptPlain.value;

        if (!key) {
            this.showToast('Please enter an encryption key', true);
            return;
        }
        if (!text) {
            this.showToast('Please enter text to encrypt', true);
            return;
        }

        try {
            // Derive key from password
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(key),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            // Generate salt and IV
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Derive AES key
            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );

            // Encrypt
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                aesKey,
                encoder.encode(text)
            );

            // Combine salt + iv + encrypted data
            const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(encrypted), salt.length + iv.length);

            // Base64 encode
            this.encryptEncoded.value = btoa(String.fromCharCode(...combined));
            this.showToast('Text encrypted successfully');

        } catch (e) {
            console.error('Encryption error:', e);
            this.showToast('Encryption failed', true);
        }
    }

    async decrypt() {
        const key = this.encryptKey.value;
        const encryptedText = this.encryptEncoded.value;

        if (!key) {
            this.showToast('Please enter the encryption key', true);
            return;
        }
        if (!encryptedText) {
            this.showToast('Please enter text to decrypt', true);
            return;
        }

        try {
            // Decode base64
            const combined = new Uint8Array(atob(encryptedText).split('').map(c => c.charCodeAt(0)));

            // Extract salt, iv, and encrypted data
            const salt = combined.slice(0, 16);
            const iv = combined.slice(16, 28);
            const encrypted = combined.slice(28);

            // Derive key from password
            const encoder = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                encoder.encode(key),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            // Derive AES key
            const aesKey = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            // Decrypt
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                aesKey,
                encrypted
            );

            this.encryptPlain.value = new TextDecoder().decode(decrypted);
            this.showToast('Text decrypted successfully');

        } catch (e) {
            console.error('Decryption error:', e);
            this.showToast('Decryption failed - wrong key or corrupted data', true);
        }
    }

    toggleKeyVisibility() {
        const btn = document.getElementById('toggleKeyBtn');
        if (this.encryptKey.type === 'password') {
            this.encryptKey.type = 'text';
            btn.textContent = 'Hide';
        } else {
            this.encryptKey.type = 'password';
            btn.textContent = 'Show';
        }
    }

    // === Utilities ===
    copyToClipboard(text) {
        if (!text) {
            this.showToast('Nothing to copy', true);
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied to clipboard');
        }).catch(() => {
            this.showToast('Failed to copy', true);
        });
    }

    showToast(message, isError = false) {
        this.toast.textContent = message;
        this.toast.classList.toggle('error', isError);
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new EncodingTools();
});
