/**
 * Format large numbers with abbreviations (K, M, B, T, Q)
 * @param {number} num - The number to format
 * @param {number} decimals - Number of decimal places (default: 1)
 * @returns {string} Formatted number string
 */
function formatNumber(num, decimals = 1) {
    if (num === null || num === undefined) return '0';

    const absNum = Math.abs(num);

    if (absNum >= 1e15) { // Quadrillion
        return (num / 1e15).toFixed(decimals).replace(/\.0$/, '') + 'Q';
    }
    if (absNum >= 1e12) { // Trillion
        return (num / 1e12).toFixed(decimals).replace(/\.0$/, '') + 'T';
    }
    if (absNum >= 1e9) { // Billion
        return (num / 1e9).toFixed(decimals).replace(/\.0$/, '') + 'B';
    }
    if (absNum >= 1e6) { // Million
        return (num / 1e6).toFixed(decimals).replace(/\.0$/, '') + 'M';
    }
    if (absNum >= 1e3) { // Thousand
        return (num / 1e3).toFixed(decimals).replace(/\.0$/, '') + 'K';
    }

    return num.toString();
}

/**
 * Format number with commas for readability (e.g., 1,234,567)
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
function formatNumberWithCommas(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString();
}

module.exports = {
    formatNumber,
    formatNumberWithCommas
};
