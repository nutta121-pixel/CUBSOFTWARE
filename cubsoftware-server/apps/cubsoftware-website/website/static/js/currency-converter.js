// Currency Converter JavaScript

class CurrencyConverter {
    constructor() {
        this.rates = {};
        this.lastUpdated = null;
        this.baseCurrency = 'EUR'; // ECB uses EUR as base

        this.initElements();
        this.bindEvents();
        this.loadRates();
    }

    initElements() {
        this.amountInput = document.getElementById('amount');
        this.fromCurrency = document.getElementById('fromCurrency');
        this.toCurrency = document.getElementById('toCurrency');
        this.swapBtn = document.getElementById('swapBtn');
        this.resultAmount = document.getElementById('resultAmount');
        this.resultRate = document.getElementById('resultRate');
        this.exchangeRate = document.getElementById('exchangeRate');
        this.rateUpdated = document.getElementById('rateUpdated');
        this.popularRates = document.getElementById('popularRates');
        this.baseCurrencyName = document.getElementById('baseCurrencyName');
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        this.amountInput.addEventListener('input', () => this.convert());
        this.fromCurrency.addEventListener('change', () => {
            this.updatePopularRates();
            this.convert();
        });
        this.toCurrency.addEventListener('change', () => this.convert());
        this.swapBtn.addEventListener('click', () => this.swapCurrencies());

        // Quick amount buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.amountInput.value = btn.dataset.amount;
                this.convert();
            });
        });
    }

    async loadRates() {
        try {
            // Try primary API (exchangerate.host)
            const response = await fetch('https://api.exchangerate.host/latest?base=EUR');

            if (response.ok) {
                const data = await response.json();
                if (data.success !== false && data.rates) {
                    this.rates = data.rates;
                    this.rates['EUR'] = 1; // Add EUR as base
                    this.lastUpdated = new Date(data.date || Date.now());
                    this.onRatesLoaded();
                    return;
                }
            }

            // Fallback to backup API
            await this.loadBackupRates();

        } catch (error) {
            console.error('Error loading rates:', error);
            await this.loadBackupRates();
        }
    }

    async loadBackupRates() {
        try {
            // Backup: fawazahmed0's currency API
            const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');

            if (response.ok) {
                const data = await response.json();
                if (data.eur) {
                    // Convert to uppercase keys
                    this.rates = {};
                    for (const [key, value] of Object.entries(data.eur)) {
                        this.rates[key.toUpperCase()] = value;
                    }
                    this.rates['EUR'] = 1;
                    this.lastUpdated = new Date(data.date || Date.now());
                    this.onRatesLoaded();
                    return;
                }
            }

            // Use fallback static rates if APIs fail
            this.useFallbackRates();

        } catch (error) {
            console.error('Error loading backup rates:', error);
            this.useFallbackRates();
        }
    }

    useFallbackRates() {
        // Fallback rates (approximate, for when APIs fail)
        this.rates = {
            'EUR': 1,
            'USD': 1.08,
            'GBP': 0.86,
            'NZD': 1.79,
            'AUD': 1.65,
            'CAD': 1.47,
            'JPY': 162.5,
            'CNY': 7.82,
            'INR': 90.2,
            'CHF': 0.95,
            'SGD': 1.45,
            'HKD': 8.44,
            'KRW': 1435,
            'MXN': 18.5,
            'BRL': 5.35,
            'ZAR': 20.1,
            'SEK': 11.4,
            'NOK': 11.6,
            'DKK': 7.46,
            'PLN': 4.32,
            'THB': 38.5,
            'MYR': 5.08,
            'IDR': 16850,
            'PHP': 60.2,
            'AED': 3.97,
            'SAR': 4.05,
            'TRY': 34.8,
            'RUB': 99.5
        };
        this.lastUpdated = new Date();
        this.showToast('Using offline rates. Live rates unavailable.');
        this.onRatesLoaded();
    }

    onRatesLoaded() {
        this.convert();
        this.updatePopularRates();
        this.updateLastUpdated();
    }

    convert() {
        const amount = parseFloat(this.amountInput.value) || 0;
        const from = this.fromCurrency.value;
        const to = this.toCurrency.value;

        if (!this.rates[from] || !this.rates[to]) {
            this.resultAmount.textContent = '--';
            this.resultRate.textContent = 'Rate not available';
            return;
        }

        // Convert via EUR (base currency)
        const amountInEur = amount / this.rates[from];
        const result = amountInEur * this.rates[to];

        // Calculate direct rate
        const rate = this.rates[to] / this.rates[from];

        // Format result
        this.resultAmount.textContent = this.formatCurrency(result, to);
        this.resultRate.textContent = `${this.formatNumber(amount)} ${from} = ${this.formatCurrency(result, to)}`;
        this.exchangeRate.textContent = `1 ${from} = ${this.formatNumber(rate, 6)} ${to}`;
    }

    swapCurrencies() {
        const temp = this.fromCurrency.value;
        this.fromCurrency.value = this.toCurrency.value;
        this.toCurrency.value = temp;
        this.updatePopularRates();
        this.convert();
    }

    updatePopularRates() {
        const from = this.fromCurrency.value;
        this.baseCurrencyName.textContent = from;

        const popularCurrencies = ['USD', 'EUR', 'GBP', 'AUD', 'JPY', 'CAD', 'CHF', 'CNY'];
        const filtered = popularCurrencies.filter(c => c !== from);

        if (Object.keys(this.rates).length === 0) {
            this.popularRates.innerHTML = '<div class="rate-card loading">Loading rates...</div>';
            return;
        }

        this.popularRates.innerHTML = filtered.map(currency => {
            const rate = this.rates[currency] / this.rates[from];
            return `
                <div class="rate-card">
                    <div class="currency">${currency}</div>
                    <div class="value">${this.formatNumber(rate, 4)}</div>
                </div>
            `;
        }).join('');
    }

    updateLastUpdated() {
        if (this.lastUpdated) {
            const dateStr = this.lastUpdated.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            this.rateUpdated.textContent = `Updated: ${dateStr}`;
        }
    }

    formatCurrency(value, currency) {
        // Determine decimal places based on currency
        let decimals = 2;
        if (['JPY', 'KRW', 'IDR', 'VND'].includes(currency)) {
            decimals = 0;
        } else if (value >= 1000) {
            decimals = 2;
        } else if (value >= 1) {
            decimals = 4;
        } else {
            decimals = 6;
        }

        return value.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }) + ' ' + currency;
    }

    formatNumber(value, maxDecimals = 2) {
        if (value >= 1000) {
            return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
        } else if (value >= 1) {
            return value.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
        } else {
            return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
        }
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new CurrencyConverter();
});
