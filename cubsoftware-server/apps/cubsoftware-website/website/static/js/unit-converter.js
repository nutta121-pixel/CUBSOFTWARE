// Unit Converter JavaScript

const units = {
    length: {
        name: 'Length',
        units: {
            meter: { name: 'Meters (m)', factor: 1 },
            kilometer: { name: 'Kilometers (km)', factor: 1000 },
            centimeter: { name: 'Centimeters (cm)', factor: 0.01 },
            millimeter: { name: 'Millimeters (mm)', factor: 0.001 },
            mile: { name: 'Miles (mi)', factor: 1609.344 },
            yard: { name: 'Yards (yd)', factor: 0.9144 },
            foot: { name: 'Feet (ft)', factor: 0.3048 },
            inch: { name: 'Inches (in)', factor: 0.0254 },
            nauticalMile: { name: 'Nautical Miles', factor: 1852 }
        },
        reference: [
            { from: '1 mile', to: '1.609 km' },
            { from: '1 foot', to: '30.48 cm' },
            { from: '1 inch', to: '2.54 cm' },
            { from: '1 meter', to: '3.281 feet' }
        ]
    },
    weight: {
        name: 'Weight',
        units: {
            kilogram: { name: 'Kilograms (kg)', factor: 1 },
            gram: { name: 'Grams (g)', factor: 0.001 },
            milligram: { name: 'Milligrams (mg)', factor: 0.000001 },
            pound: { name: 'Pounds (lb)', factor: 0.453592 },
            ounce: { name: 'Ounces (oz)', factor: 0.0283495 },
            ton: { name: 'Metric Tons', factor: 1000 },
            stone: { name: 'Stone', factor: 6.35029 }
        },
        reference: [
            { from: '1 kg', to: '2.205 lbs' },
            { from: '1 pound', to: '453.6 g' },
            { from: '1 ounce', to: '28.35 g' },
            { from: '1 stone', to: '6.35 kg' }
        ]
    },
    temperature: {
        name: 'Temperature',
        units: {
            celsius: { name: 'Celsius (°C)', type: 'temperature' },
            fahrenheit: { name: 'Fahrenheit (°F)', type: 'temperature' },
            kelvin: { name: 'Kelvin (K)', type: 'temperature' }
        },
        reference: [
            { from: '0°C', to: '32°F' },
            { from: '100°C', to: '212°F' },
            { from: '0 K', to: '-273.15°C' },
            { from: '20°C', to: '68°F' }
        ]
    },
    data: {
        name: 'Data',
        units: {
            byte: { name: 'Bytes (B)', factor: 1 },
            kilobyte: { name: 'Kilobytes (KB)', factor: 1024 },
            megabyte: { name: 'Megabytes (MB)', factor: 1048576 },
            gigabyte: { name: 'Gigabytes (GB)', factor: 1073741824 },
            terabyte: { name: 'Terabytes (TB)', factor: 1099511627776 },
            bit: { name: 'Bits', factor: 0.125 },
            kilobit: { name: 'Kilobits (Kb)', factor: 128 },
            megabit: { name: 'Megabits (Mb)', factor: 131072 },
            gigabit: { name: 'Gigabits (Gb)', factor: 134217728 }
        },
        reference: [
            { from: '1 GB', to: '1,024 MB' },
            { from: '1 MB', to: '1,024 KB' },
            { from: '1 byte', to: '8 bits' },
            { from: '1 TB', to: '1,024 GB' }
        ]
    },
    speed: {
        name: 'Speed',
        units: {
            mps: { name: 'Meters/sec (m/s)', factor: 1 },
            kph: { name: 'Kilometers/hour (km/h)', factor: 0.277778 },
            mph: { name: 'Miles/hour (mph)', factor: 0.44704 },
            knot: { name: 'Knots', factor: 0.514444 },
            fps: { name: 'Feet/sec (ft/s)', factor: 0.3048 },
            mach: { name: 'Mach (at sea level)', factor: 343 }
        },
        reference: [
            { from: '100 km/h', to: '62.14 mph' },
            { from: '1 knot', to: '1.852 km/h' },
            { from: 'Mach 1', to: '1,235 km/h' },
            { from: '60 mph', to: '96.56 km/h' }
        ]
    },
    time: {
        name: 'Time',
        units: {
            second: { name: 'Seconds', factor: 1 },
            minute: { name: 'Minutes', factor: 60 },
            hour: { name: 'Hours', factor: 3600 },
            day: { name: 'Days', factor: 86400 },
            week: { name: 'Weeks', factor: 604800 },
            month: { name: 'Months (30 days)', factor: 2592000 },
            year: { name: 'Years (365 days)', factor: 31536000 },
            millisecond: { name: 'Milliseconds', factor: 0.001 }
        },
        reference: [
            { from: '1 hour', to: '3,600 sec' },
            { from: '1 day', to: '86,400 sec' },
            { from: '1 week', to: '168 hours' },
            { from: '1 year', to: '8,760 hours' }
        ]
    },
    area: {
        name: 'Area',
        units: {
            sqmeter: { name: 'Square Meters (m²)', factor: 1 },
            sqkilometer: { name: 'Square Kilometers (km²)', factor: 1000000 },
            sqcentimeter: { name: 'Square Centimeters (cm²)', factor: 0.0001 },
            sqmile: { name: 'Square Miles (mi²)', factor: 2589988.11 },
            sqyard: { name: 'Square Yards (yd²)', factor: 0.836127 },
            sqfoot: { name: 'Square Feet (ft²)', factor: 0.092903 },
            sqinch: { name: 'Square Inches (in²)', factor: 0.00064516 },
            acre: { name: 'Acres', factor: 4046.86 },
            hectare: { name: 'Hectares', factor: 10000 }
        },
        reference: [
            { from: '1 acre', to: '4,047 m²' },
            { from: '1 hectare', to: '2.471 acres' },
            { from: '1 sq mile', to: '640 acres' },
            { from: '1 sq foot', to: '929 cm²' }
        ]
    },
    volume: {
        name: 'Volume',
        units: {
            liter: { name: 'Liters (L)', factor: 1 },
            milliliter: { name: 'Milliliters (mL)', factor: 0.001 },
            cubicmeter: { name: 'Cubic Meters (m³)', factor: 1000 },
            gallon: { name: 'Gallons (US)', factor: 3.78541 },
            quart: { name: 'Quarts (US)', factor: 0.946353 },
            pint: { name: 'Pints (US)', factor: 0.473176 },
            cup: { name: 'Cups (US)', factor: 0.236588 },
            fluidounce: { name: 'Fluid Ounces (US)', factor: 0.0295735 },
            cubicfoot: { name: 'Cubic Feet (ft³)', factor: 28.3168 },
            cubicinch: { name: 'Cubic Inches (in³)', factor: 0.0163871 }
        },
        reference: [
            { from: '1 gallon', to: '3.785 L' },
            { from: '1 liter', to: '33.81 fl oz' },
            { from: '1 cup', to: '236.6 mL' },
            { from: '1 cubic foot', to: '28.32 L' }
        ]
    }
};

let currentCategory = 'length';
const fromValueInput = document.getElementById('fromValue');
const toValueInput = document.getElementById('toValue');
const fromUnitSelect = document.getElementById('fromUnit');
const toUnitSelect = document.getElementById('toUnit');
const swapBtn = document.getElementById('swapBtn');
const conversionFormula = document.getElementById('conversionFormula');
const referenceGrid = document.getElementById('referenceGrid');
const categoryTabs = document.querySelectorAll('.category-tab');

// Initialize
function init() {
    setupCategoryTabs();
    loadCategory('length');
    setupEventListeners();
}

// Setup category tabs
function setupCategoryTabs() {
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadCategory(tab.dataset.category);
        });
    });
}

// Load category
function loadCategory(category) {
    currentCategory = category;
    const categoryData = units[category];

    // Populate selects
    fromUnitSelect.innerHTML = '';
    toUnitSelect.innerHTML = '';

    const unitKeys = Object.keys(categoryData.units);
    unitKeys.forEach((key, index) => {
        const unit = categoryData.units[key];
        fromUnitSelect.innerHTML += `<option value="${key}">${unit.name}</option>`;
        toUnitSelect.innerHTML += `<option value="${key}">${unit.name}</option>`;
    });

    // Set default selections
    if (unitKeys.length > 1) {
        toUnitSelect.value = unitKeys[1];
    }

    // Update reference
    updateReference(categoryData.reference);

    // Convert
    convert();
}

// Update reference grid
function updateReference(references) {
    referenceGrid.innerHTML = references.map(ref => `
        <div class="reference-card">
            <span class="from">${ref.from}</span>
            <span class="equals">=</span>
            <span class="to">${ref.to}</span>
        </div>
    `).join('');
}

// Setup event listeners
function setupEventListeners() {
    fromValueInput.addEventListener('input', convert);
    fromUnitSelect.addEventListener('change', convert);
    toUnitSelect.addEventListener('change', convert);

    swapBtn.addEventListener('click', () => {
        const tempUnit = fromUnitSelect.value;
        fromUnitSelect.value = toUnitSelect.value;
        toUnitSelect.value = tempUnit;
        convert();
    });

    // Copy result on click
    toValueInput.addEventListener('click', () => {
        if (toValueInput.value) {
            navigator.clipboard.writeText(toValueInput.value);
            showToast('Copied!');
        }
    });
}

// Convert
function convert() {
    const value = parseFloat(fromValueInput.value);
    const fromUnit = fromUnitSelect.value;
    const toUnit = toUnitSelect.value;

    if (isNaN(value)) {
        toValueInput.value = '';
        conversionFormula.innerHTML = '';
        return;
    }

    let result;
    const categoryData = units[currentCategory];

    // Special handling for temperature
    if (currentCategory === 'temperature') {
        result = convertTemperature(value, fromUnit, toUnit);
    } else {
        // Standard conversion using factors
        const fromFactor = categoryData.units[fromUnit].factor;
        const toFactor = categoryData.units[toUnit].factor;
        result = (value * fromFactor) / toFactor;
    }

    // Format result
    toValueInput.value = formatNumber(result);

    // Show formula
    showFormula(value, fromUnit, result, toUnit);
}

// Convert temperature
function convertTemperature(value, from, to) {
    // Convert to Celsius first
    let celsius;
    switch (from) {
        case 'celsius':
            celsius = value;
            break;
        case 'fahrenheit':
            celsius = (value - 32) * 5/9;
            break;
        case 'kelvin':
            celsius = value - 273.15;
            break;
    }

    // Convert from Celsius to target
    switch (to) {
        case 'celsius':
            return celsius;
        case 'fahrenheit':
            return (celsius * 9/5) + 32;
        case 'kelvin':
            return celsius + 273.15;
    }
}

// Format number
function formatNumber(num) {
    if (Math.abs(num) >= 1e9 || (Math.abs(num) < 0.0001 && num !== 0)) {
        return num.toExponential(6);
    }

    // Determine decimal places based on magnitude
    if (Math.abs(num) >= 1000) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    } else if (Math.abs(num) >= 1) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
    } else {
        return num.toLocaleString('en-US', { maximumFractionDigits: 8 });
    }
}

// Show formula
function showFormula(fromValue, fromUnit, toValue, toUnit) {
    const categoryData = units[currentCategory];
    const fromName = categoryData.units[fromUnit].name.split(' ')[0];
    const toName = categoryData.units[toUnit].name.split(' ')[0];

    conversionFormula.innerHTML = `
        <span class="highlight">${formatNumber(fromValue)}</span> ${fromName} =
        <span class="highlight">${formatNumber(toValue)}</span> ${toName}
    `;
}

// Show toast
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);
