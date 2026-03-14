const config = require('../config');

/**
 * Debug logging utility
 * Only logs if DEBUG=true in .env
 */
function debug(...args) {
    if (config.debug) {
        console.log(...args);
    }
}

module.exports = { debug };
