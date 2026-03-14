// Calculator Suite JavaScript

class CalculatorSuite {
    constructor() {
        this.currentCalculator = 'basic';
        this.basicDisplay = '0';
        this.basicHistory = '';
        this.sciDisplay = '0';
        this.sciHistory = '';
        this.sciMode = 'deg';

        this.initElements();
        this.bindEvents();
        this.initKeyboard();
        this.setDefaultDates();
        this.calculatePercentage();
        this.calculateTemperature();
        this.calculateLength();
        this.calculateWeight();
        this.calculateVolume();
    }

    initElements() {
        // Tab elements
        this.calcTabs = document.querySelectorAll('.calc-tab');
        this.calcPanels = document.querySelectorAll('.calc-panel');

        // Basic calculator elements
        this.basicDisplayEl = document.getElementById('basicDisplay');
        this.basicHistoryEl = document.getElementById('basicHistory');

        // Scientific calculator elements
        this.sciDisplayEl = document.getElementById('sciDisplay');
        this.sciHistoryEl = document.getElementById('sciHistory');
        this.sciModeBtns = document.querySelectorAll('.mode-btn');

        // Mortgage elements
        this.homePrice = document.getElementById('homePrice');
        this.downPayment = document.getElementById('downPayment');
        this.interestRate = document.getElementById('interestRate');
        this.loanTerm = document.getElementById('loanTerm');

        // BMI elements
        this.unitBtns = document.querySelectorAll('.unit-btn');

        // Age elements
        this.birthDate = document.getElementById('birthDate');
        this.targetDate = document.getElementById('targetDate');

        // Toast
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Main tab switching
        this.calcTabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchCalculator(tab.dataset.calculator));
        });

        // Basic calculator buttons
        document.querySelectorAll('#basic-panel .calc-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleBasicButton(btn));
        });

        // Scientific calculator buttons
        document.querySelectorAll('#scientific-panel .calc-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleScientificButton(btn));
        });

        // Scientific mode toggle
        this.sciModeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.sciModeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.sciMode = btn.dataset.mode;
            });
        });

        // Mortgage calculator
        document.getElementById('calculateMortgage').addEventListener('click', () => this.calculateMortgage());
        [this.homePrice, this.downPayment].forEach(el => {
            el.addEventListener('input', () => this.updateDownPaymentPercent());
        });
        document.getElementById('toggleAmortization').addEventListener('click', (e) => {
            const table = document.getElementById('amortizationTable');
            const btn = e.currentTarget;
            table.classList.toggle('show');
            btn.classList.toggle('active');
            btn.innerHTML = table.classList.contains('show')
                ? 'Hide Amortization Schedule <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 15 12 9 18 15"/></svg>'
                : 'Show Amortization Schedule <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
        });

        // Finance calculator
        this.bindSubTabs('finance');
        document.getElementById('calculateCompound').addEventListener('click', () => this.calculateCompound());
        document.getElementById('calculateSavings').addEventListener('click', () => this.calculateSavings());
        document.getElementById('calculateLoan').addEventListener('click', () => this.calculateLoanRepayment());

        // Fuel calculator
        this.bindSubTabs('fuel');
        document.getElementById('calculateTripCost').addEventListener('click', () => this.calculateTripCost());
        document.getElementById('calculateEfficiency').addEventListener('click', () => this.calculateFuelEfficiency());
        document.getElementById('calculateCompare').addEventListener('click', () => this.compareFuelPrices());

        // BMI calculator
        this.unitBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchBMIUnit(btn.dataset.unit));
        });
        document.getElementById('calculateBMI').addEventListener('click', () => this.calculateBMI());

        // Age calculator
        document.getElementById('calculateAge').addEventListener('click', () => this.calculateAge());

        // Date calculator
        this.bindSubTabs('date');
        document.getElementById('calculateDifference').addEventListener('click', () => this.calculateDateDifference());
        document.getElementById('calculateAddSubtract').addEventListener('click', () => this.calculateAddSubtract());
        document.getElementById('calculateWorkdays').addEventListener('click', () => this.calculateWorkdays());

        // Percentage calculator
        this.bindSubTabs('percentage');
        document.querySelectorAll('.percentage-calculator input, .percentage-calculator select').forEach(el => {
            el.addEventListener('input', () => this.calculatePercentage());
        });

        // Conversion calculator
        this.bindSubTabs('conversion');
        document.getElementById('tempValue').addEventListener('input', () => this.calculateTemperature());
        document.getElementById('tempFrom').addEventListener('change', () => this.calculateTemperature());
        document.getElementById('lengthValue').addEventListener('input', () => this.calculateLength());
        document.getElementById('lengthFrom').addEventListener('change', () => this.calculateLength());
        document.getElementById('weightValue').addEventListener('input', () => this.calculateWeight());
        document.getElementById('weightFrom').addEventListener('change', () => this.calculateWeight());
        document.getElementById('volumeValue').addEventListener('input', () => this.calculateVolume());
        document.getElementById('volumeFrom').addEventListener('change', () => this.calculateVolume());
    }

    bindSubTabs(calculatorName) {
        const container = document.getElementById(`${calculatorName}-panel`);
        if (!container) return;

        const tabs = container.querySelectorAll('.sub-tab');
        const panels = container.querySelectorAll('.sub-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panelId = `${tab.dataset.calc}-${calculatorName}`;
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
            });
        });
    }

    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (this.currentCalculator === 'basic' || this.currentCalculator === 'scientific') {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
                this.handleKeyboardInput(e);
            }
        });
    }

    handleKeyboardInput(e) {
        const key = e.key;
        const isBasic = this.currentCalculator === 'basic';

        if (/^[0-9]$/.test(key)) { e.preventDefault(); this.inputNumber(key, isBasic); }
        else if (key === '+') { e.preventDefault(); this.inputOperator('+', isBasic); }
        else if (key === '-') { e.preventDefault(); this.inputOperator('-', isBasic); }
        else if (key === '*') { e.preventDefault(); this.inputOperator('*', isBasic); }
        else if (key === '/') { e.preventDefault(); this.inputOperator('/', isBasic); }
        else if (key === '.') { e.preventDefault(); this.inputDecimal(isBasic); }
        else if (key === 'Enter' || key === '=') { e.preventDefault(); this.calculate(isBasic); }
        else if (key === 'Backspace') { e.preventDefault(); this.backspace(isBasic); }
        else if (key === 'Escape') { e.preventDefault(); this.clear(isBasic); }
        else if (key === '(' && !isBasic) { e.preventDefault(); this.inputParen('('); }
        else if (key === ')' && !isBasic) { e.preventDefault(); this.inputParen(')'); }
    }

    // === Tab Switching ===
    switchCalculator(calculator) {
        this.currentCalculator = calculator;
        this.calcTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.calculator === calculator);
        });
        this.calcPanels.forEach(panel => {
            panel.classList.toggle('active', panel.id === `${calculator}-panel`);
        });
    }

    // === Basic Calculator Methods ===
    handleBasicButton(btn) {
        const value = btn.dataset.value;
        const action = btn.dataset.action;

        if (value) {
            this.inputNumber(value, true);
        } else if (action) {
            switch (action) {
                case 'clear': this.clear(true); break;
                case 'backspace': this.backspace(true); break;
                case 'percent': this.calculatePercent(true); break;
                case 'divide': this.inputOperator('/', true); break;
                case 'multiply': this.inputOperator('*', true); break;
                case 'subtract': this.inputOperator('-', true); break;
                case 'add': this.inputOperator('+', true); break;
                case 'decimal': this.inputDecimal(true); break;
                case 'equals': this.calculate(true); break;
            }
        }
    }

    inputNumber(num, isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        if (this[displayKey] === '0' || this[displayKey] === 'Error') {
            this[displayKey] = num;
        } else {
            this[displayKey] += num;
        }
        this.updateDisplay(isBasic);
    }

    inputOperator(op, isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        const lastChar = this[displayKey].slice(-1);
        if (['+', '-', '*', '/'].includes(lastChar)) {
            this[displayKey] = this[displayKey].slice(0, -1) + op;
        } else {
            this[displayKey] += op;
        }
        this.updateDisplay(isBasic);
    }

    inputDecimal(isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        const parts = this[displayKey].split(/[\+\-\*\/]/);
        const lastPart = parts[parts.length - 1];
        if (!lastPart.includes('.')) {
            this[displayKey] += '.';
        }
        this.updateDisplay(isBasic);
    }

    clear(isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        const historyKey = isBasic ? 'basicHistory' : 'sciHistory';
        this[displayKey] = '0';
        this[historyKey] = '';
        this.updateDisplay(isBasic);
    }

    backspace(isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        if (this[displayKey].length > 1 && this[displayKey] !== 'Error') {
            this[displayKey] = this[displayKey].slice(0, -1);
        } else {
            this[displayKey] = '0';
        }
        this.updateDisplay(isBasic);
    }

    calculatePercent(isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        try {
            const value = this.safeEval(this[displayKey]);
            this[displayKey] = String(value / 100);
        } catch (e) {
            this[displayKey] = 'Error';
        }
        this.updateDisplay(isBasic);
    }

    calculate(isBasic) {
        const displayKey = isBasic ? 'basicDisplay' : 'sciDisplay';
        const historyKey = isBasic ? 'basicHistory' : 'sciHistory';
        try {
            const expression = this[displayKey];
            const result = this.safeEval(expression);
            if (result === undefined || isNaN(result) || !isFinite(result)) {
                this[displayKey] = 'Error';
            } else {
                this[historyKey] = expression + ' =';
                this[displayKey] = String(this.formatResult(result));
            }
        } catch (e) {
            this[displayKey] = 'Error';
        }
        this.updateDisplay(isBasic);
    }

    safeEval(expression) {
        if (!/^[\d\+\-\*\/\.\(\)\s]+$/.test(expression)) {
            throw new Error('Invalid expression');
        }
        return Function('"use strict"; return (' + expression + ')')();
    }

    updateDisplay(isBasic) {
        if (isBasic) {
            this.basicDisplayEl.value = this.basicDisplay;
            this.basicHistoryEl.textContent = this.basicHistory;
        } else {
            this.sciDisplayEl.value = this.sciDisplay;
            this.sciHistoryEl.textContent = this.sciHistory;
        }
    }

    formatResult(num) {
        if (Number.isInteger(num)) return num;
        return parseFloat(num.toPrecision(10));
    }

    // === Scientific Calculator Methods ===
    handleScientificButton(btn) {
        const value = btn.dataset.value;
        const action = btn.dataset.action;

        if (value) {
            this.inputNumber(value, false);
        } else if (action) {
            switch (action) {
                case 'clear': this.clear(false); break;
                case 'backspace': this.backspace(false); break;
                case 'percent': this.calculatePercent(false); break;
                case 'divide': this.inputOperator('/', false); break;
                case 'multiply': this.inputOperator('*', false); break;
                case 'subtract': this.inputOperator('-', false); break;
                case 'add': this.inputOperator('+', false); break;
                case 'decimal': this.inputDecimal(false); break;
                case 'equals': this.calculate(false); break;
                case 'sin': this.applyTrigFunction('sin'); break;
                case 'cos': this.applyTrigFunction('cos'); break;
                case 'tan': this.applyTrigFunction('tan'); break;
                case 'log': this.applyFunction('log10'); break;
                case 'ln': this.applyFunction('log'); break;
                case 'sqrt': this.applyFunction('sqrt'); break;
                case 'square': this.applyPower(2); break;
                case 'power': this.sciDisplay += '**'; this.updateDisplay(false); break;
                case 'pi': this.insertConstant(Math.PI); break;
                case 'e': this.insertConstant(Math.E); break;
                case 'openParen': this.inputParen('('); break;
                case 'closeParen': this.inputParen(')'); break;
                case 'factorial': this.calculateFactorial(); break;
                case 'abs': this.applyFunction('abs'); break;
                case 'inverse': this.applyInverse(); break;
            }
        }
    }

    applyTrigFunction(func) {
        try {
            let value = this.safeEval(this.sciDisplay);
            if (this.sciMode === 'deg') {
                value = value * (Math.PI / 180);
            }
            const result = Math[func](value);
            this.sciHistory = `${func}(${this.sciDisplay})`;
            this.sciDisplay = String(this.formatResult(result));
        } catch (e) {
            this.sciDisplay = 'Error';
        }
        this.updateDisplay(false);
    }

    applyFunction(func) {
        try {
            const value = this.safeEval(this.sciDisplay);
            const result = Math[func](value);
            if (isNaN(result) || !isFinite(result)) {
                this.sciDisplay = 'Error';
            } else {
                this.sciHistory = `${func}(${this.sciDisplay})`;
                this.sciDisplay = String(this.formatResult(result));
            }
        } catch (e) {
            this.sciDisplay = 'Error';
        }
        this.updateDisplay(false);
    }

    applyPower(power) {
        try {
            const value = this.safeEval(this.sciDisplay);
            const result = Math.pow(value, power);
            this.sciHistory = `${this.sciDisplay}^${power}`;
            this.sciDisplay = String(this.formatResult(result));
        } catch (e) {
            this.sciDisplay = 'Error';
        }
        this.updateDisplay(false);
    }

    insertConstant(value) {
        if (this.sciDisplay === '0') {
            this.sciDisplay = String(this.formatResult(value));
        } else {
            const lastChar = this.sciDisplay.slice(-1);
            if (/[\d\)]/.test(lastChar)) {
                this.sciDisplay += '*' + this.formatResult(value);
            } else {
                this.sciDisplay += this.formatResult(value);
            }
        }
        this.updateDisplay(false);
    }

    inputParen(paren) {
        if (this.sciDisplay === '0' && paren === '(') {
            this.sciDisplay = paren;
        } else {
            this.sciDisplay += paren;
        }
        this.updateDisplay(false);
    }

    calculateFactorial() {
        try {
            const n = parseInt(this.safeEval(this.sciDisplay));
            if (n < 0 || n > 170) {
                this.sciDisplay = 'Error';
            } else {
                let result = 1;
                for (let i = 2; i <= n; i++) result *= i;
                this.sciHistory = `${n}!`;
                this.sciDisplay = String(result);
            }
        } catch (e) {
            this.sciDisplay = 'Error';
        }
        this.updateDisplay(false);
    }

    applyInverse() {
        try {
            const value = this.safeEval(this.sciDisplay);
            if (value === 0) {
                this.sciDisplay = 'Error';
            } else {
                this.sciHistory = `1/${this.sciDisplay}`;
                this.sciDisplay = String(this.formatResult(1 / value));
            }
        } catch (e) {
            this.sciDisplay = 'Error';
        }
        this.updateDisplay(false);
    }

    // === Mortgage Calculator ===
    calculateMortgage() {
        const homePrice = parseFloat(this.homePrice.value) || 0;
        const downPaymentVal = parseFloat(this.downPayment.value) || 0;
        const P = homePrice - downPaymentVal;
        const annualRate = parseFloat(this.interestRate.value) || 0;
        const r = annualRate / 100 / 12;
        const years = parseInt(this.loanTerm.value) || 30;
        const n = years * 12;

        if (P <= 0) {
            this.showToast('Loan amount must be greater than 0', true);
            return;
        }
        if (r <= 0) {
            this.showToast('Interest rate must be greater than 0', true);
            return;
        }

        const monthly = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        const totalPayment = monthly * n;
        const totalInterest = totalPayment - P;

        document.getElementById('loanAmount').textContent = this.formatCurrency(P);
        document.getElementById('monthlyPayment').textContent = this.formatCurrency(monthly);
        document.getElementById('totalInterest').textContent = this.formatCurrency(totalInterest);
        document.getElementById('totalPayment').textContent = this.formatCurrency(totalPayment);

        this.generateAmortization(P, r, n, monthly);
    }

    generateAmortization(principal, monthlyRate, totalMonths, monthlyPayment) {
        const tbody = document.getElementById('amortizationBody');
        tbody.innerHTML = '';

        let balance = principal;
        let yearPrincipal = 0;
        let yearInterest = 0;

        for (let month = 1; month <= totalMonths; month++) {
            const interest = balance * monthlyRate;
            const principalPaid = monthlyPayment - interest;
            balance -= principalPaid;

            yearPrincipal += principalPaid;
            yearInterest += interest;

            if (month % 12 === 0 || month === totalMonths) {
                const year = Math.ceil(month / 12);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${year}</td>
                    <td>${this.formatCurrency(yearPrincipal)}</td>
                    <td>${this.formatCurrency(yearInterest)}</td>
                    <td>${this.formatCurrency(Math.max(0, balance))}</td>
                `;
                tbody.appendChild(row);
                yearPrincipal = 0;
                yearInterest = 0;
            }
        }
    }

    updateDownPaymentPercent() {
        const home = parseFloat(this.homePrice.value) || 0;
        const down = parseFloat(this.downPayment.value) || 0;
        const percent = home > 0 ? (down / home * 100).toFixed(1) : 0;
        document.getElementById('downPaymentPercent').textContent = `${percent}% of home price`;
    }

    // === Finance Calculator ===
    calculateCompound() {
        const P = parseFloat(document.getElementById('principalAmount').value) || 0;
        const r = parseFloat(document.getElementById('annualRate').value) / 100 || 0;
        const t = parseFloat(document.getElementById('compoundYears').value) || 0;
        const n = parseInt(document.getElementById('compoundFreq').value) || 12;

        if (P <= 0 || t <= 0) {
            this.showToast('Please enter valid values', true);
            return;
        }

        // A = P(1 + r/n)^(nt)
        const A = P * Math.pow(1 + r / n, n * t);
        const interest = A - P;
        const effectiveRate = (Math.pow(1 + r / n, n) - 1) * 100;

        document.getElementById('compoundFinal').textContent = this.formatCurrency(A);
        document.getElementById('compoundInterest').textContent = this.formatCurrency(interest);
        document.getElementById('effectiveRate').textContent = effectiveRate.toFixed(2) + '%';
    }

    calculateSavings() {
        const goal = parseFloat(document.getElementById('savingsGoal').value) || 0;
        const years = parseFloat(document.getElementById('savingsYears').value) || 0;
        const r = parseFloat(document.getElementById('savingsRate').value) / 100 / 12 || 0;
        const initial = parseFloat(document.getElementById('initialSavings').value) || 0;
        const n = years * 12;

        if (goal <= 0 || years <= 0) {
            this.showToast('Please enter valid values', true);
            return;
        }

        // Future value of initial deposit
        const fvInitial = initial * Math.pow(1 + r, n);
        const remainingGoal = goal - fvInitial;

        let monthlyDeposit;
        if (r === 0) {
            monthlyDeposit = remainingGoal / n;
        } else {
            // PMT = FV * r / ((1 + r)^n - 1)
            monthlyDeposit = remainingGoal * r / (Math.pow(1 + r, n) - 1);
        }

        const totalDeposits = initial + (monthlyDeposit * n);
        const interestEarned = goal - totalDeposits;

        document.getElementById('monthlyDeposit').textContent = this.formatCurrency(Math.max(0, monthlyDeposit));
        document.getElementById('totalDeposits').textContent = this.formatCurrency(totalDeposits);
        document.getElementById('savingsInterestEarned').textContent = this.formatCurrency(Math.max(0, interestEarned));
    }

    calculateLoanRepayment() {
        const P = parseFloat(document.getElementById('loanPrincipal').value) || 0;
        const annualRate = parseFloat(document.getElementById('loanInterestRate').value) || 0;
        const r = annualRate / 100 / 12;
        const n = parseInt(document.getElementById('loanTermMonths').value) || 0;

        if (P <= 0 || n <= 0) {
            this.showToast('Please enter valid values', true);
            return;
        }

        let monthly;
        if (r === 0) {
            monthly = P / n;
        } else {
            monthly = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
        }

        const totalPayment = monthly * n;
        const totalInterest = totalPayment - P;

        document.getElementById('loanMonthlyPayment').textContent = this.formatCurrency(monthly);
        document.getElementById('loanTotalPayment').textContent = this.formatCurrency(totalPayment);
        document.getElementById('loanTotalInterest').textContent = this.formatCurrency(totalInterest);
    }

    // === Fuel Calculator ===
    calculateTripCost() {
        const distance = parseFloat(document.getElementById('tripDistance').value) || 0;
        const efficiency = parseFloat(document.getElementById('fuelEfficiency').value) || 0;
        const price = parseFloat(document.getElementById('fuelPrice').value) || 0;

        if (distance <= 0 || efficiency <= 0 || price <= 0) {
            this.showToast('Please enter valid values', true);
            return;
        }

        const fuelRequired = (distance / 100) * efficiency;
        const totalCost = fuelRequired * price;
        const costPerKm = totalCost / distance;

        document.getElementById('tripCost').textContent = this.formatCurrency(totalCost);
        document.getElementById('fuelRequired').textContent = fuelRequired.toFixed(1) + ' L';
        document.getElementById('costPerKm').textContent = '$' + costPerKm.toFixed(3);
    }

    calculateFuelEfficiency() {
        const distance = parseFloat(document.getElementById('distanceTraveled').value) || 0;
        const fuel = parseFloat(document.getElementById('fuelUsed').value) || 0;

        if (distance <= 0 || fuel <= 0) {
            this.showToast('Please enter valid values', true);
            return;
        }

        const efficiency = (fuel / distance) * 100;
        const kmPerLitre = distance / fuel;

        document.getElementById('calcEfficiency').textContent = efficiency.toFixed(1) + ' L/100km';
        document.getElementById('kmPerLitre').textContent = kmPerLitre.toFixed(1) + ' km/L';
    }

    compareFuelPrices() {
        const price1 = parseFloat(document.getElementById('station1Price').value) || 0;
        const price2 = parseFloat(document.getElementById('station2Price').value) || 0;
        const tankSize = parseFloat(document.getElementById('tankSize').value) || 0;

        if (tankSize <= 0) {
            this.showToast('Please enter a valid tank size', true);
            return;
        }

        const cost1 = price1 * tankSize;
        const cost2 = price2 * tankSize;
        const savings = Math.abs(cost1 - cost2);

        document.getElementById('station1Cost').textContent = this.formatCurrency(cost1);
        document.getElementById('station2Cost').textContent = this.formatCurrency(cost2);
        document.getElementById('tankSavings').textContent = this.formatCurrency(savings);
    }

    // === BMI Calculator ===
    switchBMIUnit(unit) {
        this.unitBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.unit === unit);
        });
        document.getElementById('imperialInputs').style.display = unit === 'imperial' ? 'block' : 'none';
        document.getElementById('metricInputs').style.display = unit === 'metric' ? 'block' : 'none';
    }

    calculateBMI() {
        let heightM, weightKg;
        const isImperial = document.querySelector('.unit-btn.active').dataset.unit === 'imperial';

        if (isImperial) {
            const feet = parseFloat(document.getElementById('heightFeet').value) || 0;
            const inches = parseFloat(document.getElementById('heightInches').value) || 0;
            const lbs = parseFloat(document.getElementById('weightLbs').value) || 0;

            heightM = (feet * 12 + inches) * 0.0254;
            weightKg = lbs * 0.453592;
        } else {
            heightM = (parseFloat(document.getElementById('heightCm').value) || 0) / 100;
            weightKg = parseFloat(document.getElementById('weightKg').value) || 0;
        }

        if (heightM <= 0 || weightKg <= 0) {
            this.showToast('Please enter valid measurements', true);
            return;
        }

        const bmi = weightKg / (heightM * heightM);
        const category = this.getBMICategory(bmi);

        document.getElementById('bmiValue').textContent = bmi.toFixed(1);
        const bmiCategoryEl = document.getElementById('bmiCategory');
        bmiCategoryEl.textContent = category.text;
        bmiCategoryEl.className = `bmi-category ${category.class}`;

        const position = Math.min(Math.max((bmi - 15) / 25 * 100, 0), 100);
        const indicator = document.getElementById('bmiIndicator');
        indicator.style.left = `calc(${position}% - 2px)`;
        indicator.classList.add('show');
    }

    getBMICategory(bmi) {
        if (bmi < 18.5) return { text: 'Underweight', class: 'underweight' };
        if (bmi < 25) return { text: 'Normal Weight', class: 'normal' };
        if (bmi < 30) return { text: 'Overweight', class: 'overweight' };
        return { text: 'Obese', class: 'obese' };
    }

    // === Age Calculator ===
    setDefaultDates() {
        const today = new Date();
        if (this.targetDate) this.targetDate.valueAsDate = today;
        if (this.birthDate) {
            const defaultBirth = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());
            this.birthDate.valueAsDate = defaultBirth;
        }

        // Date calculator defaults
        const diffStart = document.getElementById('diffStartDate');
        const diffEnd = document.getElementById('diffEndDate');
        const baseDate = document.getElementById('baseDate');
        const workStart = document.getElementById('workStartDate');
        const workEnd = document.getElementById('workEndDate');

        if (diffStart) diffStart.valueAsDate = today;
        if (diffEnd) {
            const nextMonth = new Date(today);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            diffEnd.valueAsDate = nextMonth;
        }
        if (baseDate) baseDate.valueAsDate = today;
        if (workStart) workStart.valueAsDate = today;
        if (workEnd) {
            const twoWeeks = new Date(today);
            twoWeeks.setDate(twoWeeks.getDate() + 14);
            workEnd.valueAsDate = twoWeeks;
        }
    }

    calculateAge() {
        const birth = new Date(this.birthDate.value);
        const target = new Date(this.targetDate.value);

        if (isNaN(birth.getTime())) {
            this.showToast('Please enter a valid birth date', true);
            return;
        }

        if (birth > target) {
            this.showToast('Birth date cannot be in the future', true);
            return;
        }

        let years = target.getFullYear() - birth.getFullYear();
        let months = target.getMonth() - birth.getMonth();
        let days = target.getDate() - birth.getDate();

        if (days < 0) {
            months--;
            const prevMonth = new Date(target.getFullYear(), target.getMonth(), 0);
            days += prevMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        const totalDays = Math.floor((target - birth) / (1000 * 60 * 60 * 24));
        const totalWeeks = Math.floor(totalDays / 7);
        const totalMonths = years * 12 + months;
        const totalHours = totalDays * 24;

        document.getElementById('ageYears').textContent = years;
        document.getElementById('ageMonths').textContent = months;
        document.getElementById('ageDays').textContent = days;
        document.getElementById('totalMonths').textContent = totalMonths.toLocaleString();
        document.getElementById('totalWeeks').textContent = totalWeeks.toLocaleString();
        document.getElementById('totalDays').textContent = totalDays.toLocaleString();
        document.getElementById('totalHours').textContent = totalHours.toLocaleString();

        let nextBirthday = new Date(target.getFullYear(), birth.getMonth(), birth.getDate());
        if (nextBirthday <= target) {
            nextBirthday.setFullYear(target.getFullYear() + 1);
        }

        const daysUntil = Math.ceil((nextBirthday - target) / (1000 * 60 * 60 * 24));

        document.getElementById('nextBirthday').textContent = nextBirthday.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('daysUntilBirthday').textContent = daysUntil;
    }

    // === Date Calculator ===
    calculateDateDifference() {
        const start = new Date(document.getElementById('diffStartDate').value);
        const end = new Date(document.getElementById('diffEndDate').value);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            this.showToast('Please enter valid dates', true);
            return;
        }

        const diffTime = Math.abs(end - start);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30.44);
        const diffYears = Math.floor(diffDays / 365.25);

        document.getElementById('dateDiff').textContent = diffDays + ' days';
        document.getElementById('diffYears').textContent = diffYears;
        document.getElementById('diffMonths').textContent = diffMonths;
        document.getElementById('diffWeeks').textContent = diffWeeks;
        document.getElementById('diffDays').textContent = diffDays;
    }

    calculateAddSubtract() {
        const base = new Date(document.getElementById('baseDate').value);
        const days = parseInt(document.getElementById('daysToAdd').value) || 0;
        const operation = document.getElementById('addOrSubtract').value;

        if (isNaN(base.getTime())) {
            this.showToast('Please enter a valid date', true);
            return;
        }

        const result = new Date(base);
        if (operation === 'add') {
            result.setDate(result.getDate() + days);
        } else {
            result.setDate(result.getDate() - days);
        }

        document.getElementById('resultDate').textContent = result.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('resultDayOfWeek').textContent = result.toLocaleDateString('en-US', {
            weekday: 'long'
        });
    }

    calculateWorkdays() {
        const start = new Date(document.getElementById('workStartDate').value);
        const end = new Date(document.getElementById('workEndDate').value);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            this.showToast('Please enter valid dates', true);
            return;
        }

        let workdays = 0;
        let weekendDays = 0;
        const current = new Date(start);

        while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workdays++;
            } else {
                weekendDays++;
            }
            current.setDate(current.getDate() + 1);
        }

        const totalDays = workdays + weekendDays;

        document.getElementById('workingDays').textContent = workdays;
        document.getElementById('totalCalendarDays').textContent = totalDays;
        document.getElementById('weekendDays').textContent = weekendDays;
    }

    // === Percentage Calculator ===
    calculatePercentage() {
        // Basic: X% of Y
        const percentOf = parseFloat(document.getElementById('percentOf')?.value) || 0;
        const percentOfNumber = parseFloat(document.getElementById('percentOfNumber')?.value) || 0;
        const resultEl = document.getElementById('percentOfResult');
        if (resultEl) resultEl.textContent = this.formatNumber(percentOfNumber * percentOf / 100);

        // What percent is X of Y?
        const whatNum = parseFloat(document.getElementById('whatPercentNum')?.value) || 0;
        const whatOf = parseFloat(document.getElementById('whatPercentOf')?.value) || 1;
        const whatResultEl = document.getElementById('whatPercentResult');
        if (whatResultEl) whatResultEl.textContent = this.formatNumber(whatNum / whatOf * 100) + '%';

        // Percentage change
        const changeFrom = parseFloat(document.getElementById('changeFrom')?.value) || 0;
        const changeTo = parseFloat(document.getElementById('changeTo')?.value) || 0;
        let changePercent = 0;
        if (changeFrom !== 0) {
            changePercent = ((changeTo - changeFrom) / Math.abs(changeFrom)) * 100;
        }
        const changeSign = changePercent >= 0 ? '+' : '';
        const changeResultEl = document.getElementById('changeResult');
        if (changeResultEl) changeResultEl.textContent = changeSign + this.formatNumber(changePercent) + '%';

        // Increase/Decrease
        const increaseNum = parseFloat(document.getElementById('increaseNum')?.value) || 0;
        const increasePercent = parseFloat(document.getElementById('increasePercent')?.value) || 0;
        const increaseType = document.getElementById('increaseType')?.value || 'increase';
        const multiplier = increaseType === 'increase' ? (1 + increasePercent / 100) : (1 - increasePercent / 100);
        const increaseResultEl = document.getElementById('increaseResult');
        if (increaseResultEl) increaseResultEl.textContent = this.formatNumber(increaseNum * multiplier);
    }

    // === Conversion Calculator ===
    calculateTemperature() {
        const value = parseFloat(document.getElementById('tempValue').value) || 0;
        const from = document.getElementById('tempFrom').value;

        let celsius;
        if (from === 'celsius') celsius = value;
        else if (from === 'fahrenheit') celsius = (value - 32) * 5 / 9;
        else if (from === 'kelvin') celsius = value - 273.15;

        const fahrenheit = celsius * 9 / 5 + 32;
        const kelvin = celsius + 273.15;

        document.getElementById('tempCelsius').innerHTML = celsius.toFixed(2) + ' &deg;C';
        document.getElementById('tempFahrenheit').innerHTML = fahrenheit.toFixed(2) + ' &deg;F';
        document.getElementById('tempKelvin').textContent = kelvin.toFixed(2) + ' K';
    }

    calculateLength() {
        const value = parseFloat(document.getElementById('lengthValue').value) || 0;
        const from = document.getElementById('lengthFrom').value;

        // Convert to cm first
        const toCm = { cm: 1, m: 100, km: 100000, inch: 2.54, feet: 30.48, yard: 91.44, mile: 160934.4 };
        const cm = value * toCm[from];

        document.getElementById('lengthCm').textContent = this.formatNumber(cm) + ' cm';
        document.getElementById('lengthM').textContent = this.formatNumber(cm / 100) + ' m';
        document.getElementById('lengthKm').textContent = this.formatNumber(cm / 100000) + ' km';
        document.getElementById('lengthInch').textContent = this.formatNumber(cm / 2.54) + ' in';
        document.getElementById('lengthFeet').textContent = this.formatNumber(cm / 30.48) + ' ft';
        document.getElementById('lengthMile').textContent = this.formatNumber(cm / 160934.4) + ' mi';
    }

    calculateWeight() {
        const value = parseFloat(document.getElementById('weightValue').value) || 0;
        const from = document.getElementById('weightFrom').value;

        // Convert to kg first
        const toKg = { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495, stone: 6.35029 };
        const kg = value * toKg[from];

        document.getElementById('weightKg').textContent = this.formatNumber(kg) + ' kg';
        document.getElementById('weightG').textContent = this.formatNumber(kg * 1000) + ' g';
        document.getElementById('weightLb').textContent = this.formatNumber(kg / 0.453592) + ' lb';
        document.getElementById('weightOz').textContent = this.formatNumber(kg / 0.0283495) + ' oz';
        document.getElementById('weightStone').textContent = this.formatNumber(kg / 6.35029) + ' st';
    }

    calculateVolume() {
        const value = parseFloat(document.getElementById('volumeValue').value) || 0;
        const from = document.getElementById('volumeFrom').value;

        // Convert to litres first
        const toL = { l: 1, ml: 0.001, gal: 3.78541, qt: 0.946353, pt: 0.473176, cup: 0.236588, floz: 0.0295735 };
        const l = value * toL[from];

        document.getElementById('volumeL').textContent = this.formatNumber(l) + ' L';
        document.getElementById('volumeMl').textContent = this.formatNumber(l * 1000) + ' mL';
        document.getElementById('volumeGal').textContent = this.formatNumber(l / 3.78541) + ' gal';
        document.getElementById('volumeQt').textContent = this.formatNumber(l / 0.946353) + ' qt';
        document.getElementById('volumePt').textContent = this.formatNumber(l / 0.473176) + ' pt';
        document.getElementById('volumeCup').textContent = this.formatNumber(l / 0.236588) + ' cups';
    }

    // === Utility Methods ===
    formatCurrency(num) {
        return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    formatNumber(num) {
        if (Math.abs(num) >= 1000000) {
            return num.toExponential(2);
        }
        if (Math.abs(num) < 0.001 && num !== 0) {
            return num.toExponential(2);
        }
        return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
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
    new CalculatorSuite();
});
