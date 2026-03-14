// Invoice Generator JavaScript

class InvoiceGenerator {
    constructor() {
        this.items = [];
        this.nextItemId = 1;

        this.initElements();
        this.loadTemplate();
        this.bindEvents();
        this.addItem(); // Add first item
        this.setDefaultDates();
        this.updatePreview();
    }

    initElements() {
        // Business info
        this.businessName = document.getElementById('businessName');
        this.businessEmail = document.getElementById('businessEmail');
        this.businessPhone = document.getElementById('businessPhone');
        this.businessAddress = document.getElementById('businessAddress');

        // Client info
        this.clientName = document.getElementById('clientName');
        this.clientEmail = document.getElementById('clientEmail');
        this.clientPhone = document.getElementById('clientPhone');
        this.clientAddress = document.getElementById('clientAddress');

        // Invoice details
        this.invoiceNumber = document.getElementById('invoiceNumber');
        this.invoiceDate = document.getElementById('invoiceDate');
        this.dueDate = document.getElementById('dueDate');
        this.currency = document.getElementById('currency');

        // Items
        this.itemsList = document.getElementById('itemsList');
        this.addItemBtn = document.getElementById('addItemBtn');

        // Totals
        this.taxRate = document.getElementById('taxRate');
        this.discountValue = document.getElementById('discountValue');
        this.discountType = document.getElementById('discountType');

        // Notes
        this.invoiceNotes = document.getElementById('invoiceNotes');

        // Preview
        this.previewContent = document.getElementById('previewContent');

        // Buttons
        this.saveTemplateBtn = document.getElementById('saveTemplateBtn');
        this.downloadPdfBtn = document.getElementById('downloadPdfBtn');

        // Toast
        this.toast = document.getElementById('toast');
    }

    setDefaultDates() {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);

        this.invoiceDate.value = today.toISOString().split('T')[0];
        this.dueDate.value = dueDate.toISOString().split('T')[0];
        this.invoiceNumber.value = 'INV-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    }

    bindEvents() {
        // Add item button
        this.addItemBtn.addEventListener('click', () => this.addItem());

        // All form inputs update preview
        const formInputs = document.querySelectorAll('input, textarea, select');
        formInputs.forEach(input => {
            input.addEventListener('input', () => this.updatePreview());
            input.addEventListener('change', () => this.updatePreview());
        });

        // Save template
        this.saveTemplateBtn.addEventListener('click', () => this.saveTemplate());

        // Download PDF
        this.downloadPdfBtn.addEventListener('click', () => this.downloadPdf());
    }

    addItem(data = null) {
        const item = {
            id: this.nextItemId++,
            description: data?.description || '',
            quantity: data?.quantity || 1,
            rate: data?.rate || 0
        };
        this.items.push(item);
        this.renderItems();
        this.updatePreview();
    }

    removeItem(id) {
        this.items = this.items.filter(item => item.id !== id);
        if (this.items.length === 0) {
            this.addItem();
        } else {
            this.renderItems();
            this.updatePreview();
        }
    }

    renderItems() {
        this.itemsList.innerHTML = this.items.map(item => `
            <div class="item-row" data-id="${item.id}">
                <input type="text" class="item-desc" placeholder="Item description" value="${this.escapeHtml(item.description)}">
                <input type="number" class="item-qty" placeholder="Qty" min="1" value="${item.quantity}">
                <input type="number" class="item-rate" placeholder="Rate" min="0" step="0.01" value="${item.rate}">
                <span class="item-amount">${this.currency.value}${(item.quantity * item.rate).toFixed(2)}</span>
                <button type="button" class="btn-remove-item" title="Remove item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');

        // Bind events for item inputs
        this.itemsList.querySelectorAll('.item-row').forEach(row => {
            const id = parseInt(row.dataset.id);
            const item = this.items.find(i => i.id === id);

            row.querySelector('.item-desc').addEventListener('input', (e) => {
                item.description = e.target.value;
                this.updatePreview();
            });

            row.querySelector('.item-qty').addEventListener('input', (e) => {
                item.quantity = parseFloat(e.target.value) || 0;
                row.querySelector('.item-amount').textContent =
                    `${this.currency.value}${(item.quantity * item.rate).toFixed(2)}`;
                this.updatePreview();
            });

            row.querySelector('.item-rate').addEventListener('input', (e) => {
                item.rate = parseFloat(e.target.value) || 0;
                row.querySelector('.item-amount').textContent =
                    `${this.currency.value}${(item.quantity * item.rate).toFixed(2)}`;
                this.updatePreview();
            });

            row.querySelector('.btn-remove-item').addEventListener('click', () => {
                this.removeItem(id);
            });
        });
    }

    calculateTotals() {
        const subtotal = this.items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);

        let discount = 0;
        const discountVal = parseFloat(this.discountValue.value) || 0;
        if (this.discountType.value === 'percent') {
            discount = subtotal * (discountVal / 100);
        } else {
            discount = discountVal;
        }

        const afterDiscount = subtotal - discount;
        const tax = afterDiscount * (parseFloat(this.taxRate.value) || 0) / 100;
        const total = afterDiscount + tax;

        return { subtotal, discount, tax, total };
    }

    updatePreview() {
        const currency = this.currency.value;
        const totals = this.calculateTotals();

        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        };

        this.previewContent.innerHTML = `
            <div class="preview-invoice-header">
                <div class="preview-business-info">
                    <h2>${this.escapeHtml(this.businessName.value) || 'Your Business Name'}</h2>
                    <p>
                        ${this.escapeHtml(this.businessAddress.value).replace(/\n/g, '<br>') || 'Your Address'}<br>
                        ${this.businessEmail.value ? this.escapeHtml(this.businessEmail.value) + '<br>' : ''}
                        ${this.businessPhone.value ? this.escapeHtml(this.businessPhone.value) : ''}
                    </p>
                </div>
                <div class="preview-invoice-title">
                    <h1>INVOICE</h1>
                    <p><strong>${this.escapeHtml(this.invoiceNumber.value) || 'INV-0001'}</strong></p>
                    <p>Date: ${formatDate(this.invoiceDate.value)}</p>
                    <p>Due: ${formatDate(this.dueDate.value)}</p>
                </div>
            </div>

            <div class="preview-parties">
                <div class="preview-party">
                    <h3>Bill To</h3>
                    <p>
                        <strong>${this.escapeHtml(this.clientName.value) || 'Client Name'}</strong>
                        ${this.clientAddress.value ? '<br>' + this.escapeHtml(this.clientAddress.value).replace(/\n/g, '<br>') : ''}
                        ${this.clientEmail.value ? '<br>' + this.escapeHtml(this.clientEmail.value) : ''}
                        ${this.clientPhone.value ? '<br>' + this.escapeHtml(this.clientPhone.value) : ''}
                    </p>
                </div>
            </div>

            <table class="preview-items-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.items.filter(item => item.description || item.rate > 0).map(item => `
                        <tr>
                            <td>${this.escapeHtml(item.description) || 'Item'}</td>
                            <td>${item.quantity}</td>
                            <td>${currency}${item.rate.toFixed(2)}</td>
                            <td>${currency}${(item.quantity * item.rate).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                    ${this.items.filter(item => item.description || item.rate > 0).length === 0 ? `
                        <tr>
                            <td colspan="4" style="text-align: center; color: #999;">No items added</td>
                        </tr>
                    ` : ''}
                </tbody>
            </table>

            <div class="preview-totals">
                <div class="preview-totals-table">
                    <div class="preview-totals-row">
                        <span>Subtotal</span>
                        <span>${currency}${totals.subtotal.toFixed(2)}</span>
                    </div>
                    ${totals.discount > 0 ? `
                        <div class="preview-totals-row">
                            <span>Discount</span>
                            <span>-${currency}${totals.discount.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    ${totals.tax > 0 ? `
                        <div class="preview-totals-row">
                            <span>Tax (${this.taxRate.value}%)</span>
                            <span>${currency}${totals.tax.toFixed(2)}</span>
                        </div>
                    ` : ''}
                    <div class="preview-totals-row total">
                        <span>Total</span>
                        <span>${currency}${totals.total.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            ${this.invoiceNotes.value ? `
                <div class="preview-notes">
                    <h4>Notes</h4>
                    <p>${this.escapeHtml(this.invoiceNotes.value)}</p>
                </div>
            ` : ''}
        `;
    }

    saveTemplate() {
        const template = {
            business: {
                name: this.businessName.value,
                email: this.businessEmail.value,
                phone: this.businessPhone.value,
                address: this.businessAddress.value
            },
            currency: this.currency.value,
            taxRate: this.taxRate.value,
            notes: this.invoiceNotes.value
        };

        try {
            localStorage.setItem('invoiceTemplate', JSON.stringify(template));
            this.showToast('Template saved');
        } catch (e) {
            this.showToast('Failed to save template');
        }
    }

    loadTemplate() {
        try {
            const saved = localStorage.getItem('invoiceTemplate');
            if (saved) {
                const template = JSON.parse(saved);
                if (template.business) {
                    this.businessName.value = template.business.name || '';
                    this.businessEmail.value = template.business.email || '';
                    this.businessPhone.value = template.business.phone || '';
                    this.businessAddress.value = template.business.address || '';
                }
                if (template.currency) this.currency.value = template.currency;
                if (template.taxRate) this.taxRate.value = template.taxRate;
                if (template.notes) this.invoiceNotes.value = template.notes;
            }
        } catch (e) {
            console.error('Error loading template:', e);
        }
    }

    async downloadPdf() {
        this.showToast('Generating PDF...');

        const element = this.previewContent;
        const invoiceNum = this.invoiceNumber.value || 'invoice';

        const opt = {
            margin: 10,
            filename: `${invoiceNum.replace(/[^a-z0-9]/gi, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            }
        };

        try {
            await html2pdf().set(opt).from(element).save();
            this.showToast('PDF downloaded');
        } catch (e) {
            console.error('PDF generation error:', e);
            this.showToast('Failed to generate PDF');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message) {
        this.toast.textContent = message;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new InvoiceGenerator();
});
