// Global array to hold the currently loaded expected stock data
let expectedStock = [];
let detectedHeaders = []; // Stores the headers detected from the pasted data
let lastScannedId = 'N/A'; 
let isDemoData = false; // NEW: Flag to track if the current data is the initial demo set

let stockMap = new Map(); // Key: Normalized Unique ID, Value: Index in expectedStock
let unexpectedScans = new Map(); // Key: Normalized ID, Value: { rawId: string, count: number }

// --- GLOBAL STATE FOR CURRENCY & SIGN-OFF ---
let detectedCurrencySymbol = '';
let lastFinancialSummaryHTML = ''; // Stores the HTML for printing
let colleagueName = ''; // Stores the name for sign-off

// --- DOM ELEMENTS ---
const stockTableBody = document.getElementById('stockTableBody');
const stockTableHeader = document.getElementById('stockTableHeader');
const scannerInput = document.getElementById('scannerInput');
const statusMessage = document.getElementById('statusMessage');
const stockDataTextarea = document.getElementById('stockDataTextarea');
const loadDataButton = document.getElementById('loadDataButton');
const loadStatusMessage = document.getElementById('loadStatusMessage');
const lastScannedDisplay = document.getElementById('lastScannedDisplay');
const completeCheckButton = document.getElementById('completeCheckButton');
const clearAllButton = document.getElementById('clearAllButton');
const discrepancyModal = document.getElementById('discrepancyModal');
const modalContent = document.getElementById('modalContent');
const filterInput = document.getElementById('filterInput'); 
const demoModeBadge = document.getElementById('demoModeBadge'); // NEW: Badge element

// Dynamic Mapping Input
const uniqueIdHeaderNameInput = document.getElementById('uniqueIdHeaderNameInput');
const quantityHeaderNameInput = document.getElementById('quantityHeaderNameInput'); 
const priceHeaderNameInput = document.getElementById('priceHeaderNameInput'); 
const colleagueNameInput = document.getElementById('colleagueNameInput');

// --- GENERIC INITIAL DATA STRUCTURE (FOR DEMO/FIRST LOAD) ---
const initialStockData = [
    { "Category": "Hardware", "Description": "Desktop PC - Model 7", "Asset ID": "PC-D7-4822", "Expected Quantity": "5", "Unit Price": "£1200.00", expectedQuantity: 5, scannedCount: 0, unitPrice: 1200.00, id: "PC-D7-4822", rawId: "PC-D7-4822" },
    { "Category": "Software", "Description": "Enterprise License Pack", "Asset ID": "SOFT-ENT-L9", "Expected Quantity": "15", "Unit Price": "€150.00", expectedQuantity: 15, scannedCount: 0, unitPrice: 150.00, id: "SOFT-ENT-L9", rawId: "SOFT-ENT-L9" },
    { "Category": "Consumable", "Description": "A4 Paper Pack - White", "Asset ID": "CON-PAP-A4", "Expected Quantity": "50", "Unit Price": "2.50", expectedQuantity: 50, scannedCount: 0, unitPrice: 2.50, id: "CON-PAP-A4", rawId: "CON-PAP-A4" },
    { "Category": "Tool", "Description": "Digital Multimeter", "Asset ID": "TOOL-DMM-01", "Expected Quantity": "2", "Unit Price": "99.99", expectedQuantity: 2, scannedCount: 0, unitPrice: 99.99, id: "TOOL-DMM-01", rawId: "TOOL-DMM-01" },
    { "Category": "Furniture", "Description": "Ergonomic Desk Chair", "Asset ID": "FURN-CHR-ERGO", "Expected Quantity": "3", "Unit Price": "£0.00", expectedQuantity: 3, scannedCount: 0, unitPrice: 0.00, id: "FURN-CHR-ERGO", rawId: "FURN-CHR-ERGO" },
];

const initialHeaders = ["Category", "Description", "Asset ID", "Expected Quantity", "Unit Price"];
// -------------------------------------------------------------------

/**
 * Normalizes a unique ID string for consistent comparison.
 * @param {string} id The raw ID string.
 * @returns {string} The normalized ID.
 */
function normalizeId(id) {
    return id.trim().toUpperCase();
}

/**
 * Detects the currency symbol from the raw price string.
 * @param {string} value The raw price string.
 * @returns {string} The detected symbol (e.g., '£', 'EUR'), or empty string.
 */
function getCurrencySymbol(value) {
    if (!value) return '';
    const trimmedValue = value.trim();
    // Common symbols to look for at the start
    const commonSymbols = ['£', '€', '$', '¥'];
    for (const symbol of commonSymbols) {
        if (trimmedValue.startsWith(symbol)) {
            return symbol;
        }
    }
    // Look for common three-letter currency codes (case-insensitive)
    const commonCodes = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'JPY'];
    for (const code of commonCodes) {
         if (trimmedValue.toUpperCase().startsWith(code)) {
            return code;
        }
    }

    // Fallback: Check for any single non-digit/non-decimal/non-sign character at the start
    const match = trimmedValue.match(/^[^0-9.-]/);
    if (match && match[0].length === 1) {
        return match[0];
    }
    
    return '';
}

/**
 * Cleans a string value (like price) by removing non-numeric characters (except . and -) and parses it to float.
 * @param {string} value The price string.
 * @returns {number} The parsed float, or 0 if invalid.
 */
function cleanAndParseFloat(value) {
    if (!value) return 0;
    // Remove everything that isn't a digit, dot, or minus sign
    const cleanedValue = value.replace(/[^0-9.-]+/g,"");
    const parsed = parseFloat(cleanedValue);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formats a number as a currency string or raw number based on detection.
 * @param {number} amount The numerical amount.
 * @param {boolean} isCurrency Whether to treat this as a currency value.
 * @returns {string} The formatted string.
 */
function formatValue(amount, isCurrency = false) {
    const formattedAmount = amount.toFixed(2);
    if (isCurrency && detectedCurrencySymbol) {
        // Prepend the detected symbol
        return `${detectedCurrencySymbol}${formattedAmount}`;
    }
    // Return raw number with 2 decimals if no symbol detected or not a currency
    return formattedAmount;
}

/**
 * Detects headers from raw text by splitting the first non-empty line.
 * @param {string} rawText The raw pasted data.
 * @returns {string[]} An array of detected header names.
 */
function detectHeadersFromText(rawText) {
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';
    
    const headerParts = firstLine.split(separator);
    return headerParts.map(h => h.trim()).filter(h => h.length > 0);
}

/**
 * Attempts to match column headers to required fields based on common keywords.
 */
function suggestHeaders(headers) {
    const normalizedHeaders = headers.map(h => h.trim().toLowerCase());
    
    // Common keywords for each field (most specific first)
    const uniqueIdKeywords = ['asset id', 'stock code', 'sku', 'id', 'barcode', 'code', 'product id', 'model'];
    const quantityKeywords = ['expected quantity', 'expected qty', 'qty', 'quantity', 'count', 'stock'];
    const priceKeywords = ['unit price', 'price', 'cost', 'value', 'rate', 'retail'];
    
    let suggestions = {
        uniqueId: '',
        quantity: '',
        price: ''
    };

    function findMatch(keywords) {
        for (const keyword of keywords) {
            const matchIndex = normalizedHeaders.findIndex(h => h.includes(keyword));
            if (matchIndex !== -1) {
                return headers[matchIndex];
            }
        }
        return '';
    }

    suggestions.uniqueId = findMatch(uniqueIdKeywords);
    suggestions.quantity = findMatch(quantityKeywords);
    suggestions.price = findMatch(priceKeywords);
    
    // Fallback for Unique ID if still not found: use the first column header.
    if (!suggestions.uniqueId && headers.length > 0) {
         suggestions.uniqueId = headers[0];
    }


    return suggestions;
}

/**
 * Handles data input change (e.g., paste) to auto-detect and pre-fill headers.
 */
function handleDataPaste() {
    const rawData = stockDataTextarea.value.trim();
    if (!rawData) return;
    
    const headers = detectHeadersFromText(rawData);
    if (headers.length === 0) return;

    // Only auto-detect if ALL three input fields are currently empty.
    const allInputsEmpty = !uniqueIdHeaderNameInput.value.trim() && !quantityHeaderNameInput.value.trim() && !priceHeaderNameInput.value.trim();

    if (allInputsEmpty) {
        const suggestions = suggestHeaders(headers);
        
        let detectedCount = 0;
        
        if (suggestions.uniqueId) {
            uniqueIdHeaderNameInput.value = suggestions.uniqueId;
            detectedCount++;
        }
        if (suggestions.quantity) {
            quantityHeaderNameInput.value = suggestions.quantity;
            detectedCount++;
        }
        if (suggestions.price) {
            priceHeaderNameInput.value = suggestions.price;
            detectedCount++;
        }
        
        if (detectedCount > 0) {
            showLoadMessage(`✅ Auto-detected ${detectedCount} header(s). Please review the fields above and click 'Load Data'.`, 'text-blue-600');
        } else {
            showLoadMessage(`⚠️ No headers auto-detected. Please manually enter the correct column header names above.`, 'text-orange-600');
        }
    }
}


/**
 * Parses the raw CSV/TSV text, detects headers, and extracts data.
 */
function parseCSV(rawText, uniqueIdHeaderName, quantityHeaderName, priceHeaderName) {
    const lines = rawText.trim().split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) { 
        return { data: [], headers: [] };
    }
    
    const firstLine = lines[0];
    const separator = firstLine.includes('\t') ? '\t' : ',';
    
    const headerParts = firstLine.split(separator);
    const headers = headerParts.map(h => h.trim()).filter(h => h.length > 0);
    
    const uniqueIdIndex = headers.findIndex(h => h.trim().toLowerCase() === uniqueIdHeaderName.trim().toLowerCase());
    const quantityIndex = quantityHeaderName.trim() 
        ? headers.findIndex(h => h.trim().toLowerCase() === quantityHeaderName.trim().toLowerCase()) 
        : -1; 
    const priceIndex = priceHeaderName.trim() 
        ? headers.findIndex(h => h.trim().toLowerCase() === priceHeaderName.trim().toLowerCase()) 
        : -1; 

    if (uniqueIdIndex === -1) {
        return { 
            data: [], 
            headers: [], 
            error: `Unique ID Header "${uniqueIdHeaderName}" not found in the pasted data headers.`
        };
    }
    
    const dataLines = lines.slice(1);
    const parsedData = [];
    const idCheckSet = new Set(); 
    let currencyDetectedInParse = false; // Flag to stop checking currency after the first one is found

    dataLines.forEach((line, index) => {
        const parts = line.split(separator);
        
        if (parts.length >= headers.length) {
            const uniqueId = parts[uniqueIdIndex].trim();

            if (uniqueId.length > 0) {
                const normalizedId = normalizeId(uniqueId); 

                if (idCheckSet.has(normalizedId)) {
                    console.warn(`Skipping data line ${index + 1}: Duplicate ID detected for ${uniqueId}. Only the first instance is used.`);
                    return; 
                }
                idCheckSet.add(normalizedId);
                
                let expectedQty = 1; 
                if (quantityIndex !== -1 && parts[quantityIndex]) {
                    const parsedQty = parseInt(parts[quantityIndex].trim());
                    expectedQty = isNaN(parsedQty) || parsedQty < 1 ? 1 : parsedQty;
                }
                
                // Parse Price
                let unitPrice = 0;
                if (priceIndex !== -1 && parts[priceIndex]) {
                    const rawPrice = parts[priceIndex].trim();
                    unitPrice = cleanAndParseFloat(rawPrice);
                    
                    // *** CURRENCY DETECTION LOGIC ***
                    if (!currencyDetectedInParse && unitPrice > 0) {
                        detectedCurrencySymbol = getCurrencySymbol(rawPrice);
                        currencyDetectedInParse = true;
                    }
                    // ***********************************

                }

                const item = { 
                    expectedQuantity: expectedQty, 
                    scannedCount: 0,
                    unitPrice: unitPrice 
                };
                
                item.id = normalizedId; 
                item.rawId = uniqueId; 

                headers.forEach((header, i) => {
                    if (parts[i]) {
                        item[header] = parts[i].trim();
                    } else {
                        item[header] = '';
                    }
                });
                
                parsedData.push(item);
            } else {
                console.warn(`Skipping data line ${index + 1} due to empty unique ID in column: ${line}`);
            }
        } else {
            console.warn(`Skipping data line ${index + 1} due to insufficient columns: ${line}`);
        }
    });

    // Ensure quantity and price headers are included in detectedHeaders if provided
    const finalHeaders = [...headers];
    if (quantityHeaderName.trim() && !finalHeaders.map(h => h.toLowerCase()).includes(quantityHeaderName.trim().toLowerCase())) {
         finalHeaders.push(quantityHeaderName.trim());
    }
    if (priceHeaderName.trim() && !finalHeaders.map(h => h.toLowerCase()).includes(priceHeaderName.trim().toLowerCase())) {
         finalHeaders.push(priceHeaderName.trim());
    }

    return { data: parsedData, headers: finalHeaders };
}


/**
 * Loads data from the textarea, replaces the expectedStock, and re-renders the table.
 */
function loadStockData() {
    const rawData = stockDataTextarea.value.trim();
    const uniqueIdHeaderName = uniqueIdHeaderNameInput.value.trim();
    const quantityHeaderName = quantityHeaderNameInput.value.trim(); 
    const priceHeaderName = priceHeaderNameInput.value.trim(); 

    if (!uniqueIdHeaderName) {
        showLoadMessage('ERROR: Please specify the Unique Product/SKU Header Name.', 'text-red-500');
        return;
    }

    if (!rawData) {
        showLoadMessage('Please paste data into the box first.', 'text-red-500');
        return;
    }

    // Ensure auto-detection has run to update the headers if inputs were empty
    handleDataPaste();

    // Reset currency symbol before parsing new data
    detectedCurrencySymbol = '';
    
    const result = parseCSV(rawData, uniqueIdHeaderName, quantityHeaderName, priceHeaderName);

    if (result.error) {
        showLoadMessage(`ERROR: ${result.error}`, 'text-red-500');
        return;
    }

    if (result.data.length === 0) {
        showLoadMessage('No valid stock items found. Check your pasted data and Unique ID Header Name.', 'text-red-500');
        return;
    }

    expectedStock = result.data;
    detectedHeaders = result.headers;
    isDemoData = false; // NEW: Set to false as real data is loaded

    stockMap.clear();
    expectedStock.forEach((item, index) => {
        stockMap.set(item.id, index);
    });
    
    unexpectedScans.clear();
    stockDataTextarea.value = '';
    lastScannedId = 'N/A';
    lastScannedDisplay.textContent = lastScannedId;

    renderTable();
    saveState();
    updateDemoBadge(); // NEW: Update the badge display

    const totalExpectedQty = expectedStock.reduce((total, item) => total + item.expectedQuantity, 0);

    let currencyMsg = '';
    if (priceHeaderName && detectedCurrencySymbol) {
        currencyMsg = ` (Detected currency: **${detectedCurrencySymbol}**).`;
    } else if (priceHeaderName) {
        currencyMsg = ` (Price column loaded, but no currency symbol detected. Displaying raw number).`;
    }

    showLoadMessage(`Successfully loaded ${expectedStock.length} unique items (${totalExpectedQty} total quantity) with ${detectedHeaders.length} columns.${currencyMsg} Ready to scan!`, 'text-green-600');
    scannerInput.focus();
}

/**
 * Renders the expected stock data into the HTML table dynamically.
 */
function renderTable() {
    stockTableBody.innerHTML = '';
    stockTableHeader.innerHTML = '';

    if (expectedStock.length === 0) {
        stockTableBody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-500">No stock data loaded. Please use the "Load New Stock List" section above.</td></tr>';
        return;
    }

    const headerRow = stockTableHeader.insertRow();
    
    detectedHeaders.forEach(header => {
        const th = document.createElement('th');
        th.classList.add('px-3', 'py-3', 'text-left', 'text-xs', 'font-medium', 'text-gray-500', 'uppercase', 'tracking-wider', 'whitespace-nowrap');
        th.textContent = header;
        headerRow.appendChild(th);
    });

    const fixedHeaders = ['Expected', 'Scanned', 'Remaining', 'Status'];
    fixedHeaders.forEach(text => {
        const th = document.createElement('th');
        th.classList.add('px-3', 'py-3', 'text-left', 'text-xs', 'font-medium', 'text-gray-500', 'uppercase', 'tracking-wider', 'whitespace-nowrap');
        th.textContent = text;
        headerRow.appendChild(th);
    });

    const uniqueIdHeaderName = uniqueIdHeaderNameInput.value.trim();

    expectedStock.forEach(item => {
        const row = stockTableBody.insertRow();
        row.id = `row-${item.id}`;
        const remaining = item.expectedQuantity - item.scannedCount;
        const isComplete = remaining <= 0;
        
        row.classList.add('hover:bg-gray-50');
        row.dataset.search = Object.values(item).join(' ').toUpperCase();

        if (isComplete) {
            row.classList.add('scanned-row');
        }

        detectedHeaders.forEach(header => {
            const cell = row.insertCell();
            cell.classList.add('px-3', 'py-2', 'whitespace-nowrap', 'text-sm', 'text-gray-900');
            cell.textContent = item[header] || '';

            if (header.toLowerCase() === uniqueIdHeaderName.toLowerCase()) {
                cell.id = `id-cell-${item.id}`;
                cell.textContent = item.rawId || item[header] || '';
                cell.classList.add('font-mono');
                if (isComplete) {
                    cell.classList.add('scanned-cell');
                } else {
                    cell.classList.add('text-gray-700');
                }
            }
        });

        let cell = row.insertCell();
        cell.classList.add('px-3', 'py-2', 'whitespace-nowrap', 'text-sm', 'font-semibold', 'text-blue-700');
        cell.textContent = item.expectedQuantity;

        cell = row.insertCell();
        cell.id = `scanned-count-cell-${item.id}`;
        cell.classList.add('px-3', 'py-2', 'whitespace-nowrap', 'text-sm', 'font-semibold');
        cell.classList.add(item.scannedCount > item.expectedQuantity ? 'text-red-600' : 'text-green-600');
        cell.textContent = item.scannedCount;

        cell = row.insertCell();
        cell.id = `remaining-cell-${item.id}`;
        cell.classList.add('px-3', 'py-2', 'whitespace-nowrap', 'text-sm', 'font-semibold');
        cell.classList.add(remaining > 0 ? 'text-red-600' : 'text-green-600');
        cell.textContent = remaining > 0 ? remaining : 0;

        cell = row.insertCell();
        cell.id = `status-cell-${item.id}`;
        cell.classList.add('px-3', 'py-2', 'whitespace-nowrap', 'text-sm');
        
        let statusHTML = '';
        if (remaining === item.expectedQuantity) {
            statusHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">PENDING</span>';
        } else if (remaining > 0) {
            statusHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">PARTIAL</span>';
        } else if (remaining === 0) {
            statusHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-200 text-green-800 shadow-md">COMPLETE</span>';
        } else if (remaining < 0) {
            statusHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-200 text-red-800 shadow-md">OVER-SCAN</span>';
        }
        cell.innerHTML = statusHTML;
    });
}

/**
 * Handles the input from the scanner/keyboard.
 */
function handleScan(event) {
    if (event.key === 'Enter') {
        event.preventDefault();

        const rawScannedId = scannerInput.value.trim();
        scannerInput.value = '';

        if (expectedStock.length === 0) {
            showMessage('Load a stock list first using the section above.', 'text-red-500');
            return;
        }

        if (!rawScannedId) {
            showMessage('Input is empty.', 'text-red-500');
            return;
        }

        const scannedId = normalizeId(rawScannedId);
        const itemIndex = stockMap.get(scannedId);

        if (typeof itemIndex !== 'undefined') {
            // ITEM FOUND IN EXPECTED LIST
            
            const matchedItem = expectedStock[itemIndex];
            matchedItem.scannedCount++;

            let remaining = matchedItem.expectedQuantity - matchedItem.scannedCount;
            let statusMessageText = '';
            let statusMessageClass = 'text-green-600';

            if (remaining >= 0) {
                statusMessageText = `SUCCESS: Item ${rawScannedId} checked in. ${remaining} remaining.`;
            } else if (remaining === -1) {
                statusMessageText = `⚠️ OVER-SCAN ALERT: Item ${rawScannedId} is now over its expected quantity of ${matchedItem.expectedQuantity}.`;
                statusMessageClass = 'text-red-600 font-bold';
            } else {
                statusMessageText = `⚠️ OVER-SCAN ALERT: Item ${rawScannedId} scanned again. Count is now ${matchedItem.scannedCount} (Expected ${matchedItem.expectedQuantity}).`;
                statusMessageClass = 'text-red-600 font-bold';
            }

            const rowElement = document.getElementById(`row-${scannedId}`);
            const idCellElement = document.getElementById(`id-cell-${scannedId}`);
            const scannedCountCell = document.getElementById(`scanned-count-cell-${scannedId}`);
            const remainingCell = document.getElementById(`remaining-cell-${scannedId}`);
            const statusCell = document.getElementById(`status-cell-${scannedId}`);

            if (rowElement && idCellElement) {
                
                // Update the scanned count
                scannedCountCell.textContent = matchedItem.scannedCount;

                // Update the remaining count
                remainingCell.textContent = remaining > 0 ? remaining : 0;
                remainingCell.classList.toggle('text-red-600', remaining > 0);
                remainingCell.classList.toggle('text-green-600', remaining <= 0);

                // Update the row color and status cell
                if (remaining <= 0) {
                    rowElement.classList.add('scanned-row');
                    idCellElement.classList.add('scanned-cell');
                    statusCell.innerHTML = remaining === 0 
                        ? '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-200 text-green-800 shadow-md">COMPLETE</span>'
                        : '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-200 text-red-800 shadow-md">OVER-SCAN</span>';
                    
                } else {
                    rowElement.classList.remove('scanned-row');
                    idCellElement.classList.remove('scanned-cell');
                    statusCell.innerHTML = '<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800">PARTIAL</span>';
                }
                
                // Flash the row for visual feedback
                flashRow(rowElement);

            } else {
                console.error('Table elements not found for ID:', scannedId);
            }
            
            lastScannedId = rawScannedId;
            lastScannedDisplay.textContent = lastScannedId;

            showMessage(statusMessageText, statusMessageClass);

        } else {
            // ITEM NOT FOUND IN EXPECTED LIST (UNEXPECTED ITEM)

            const existingScan = unexpectedScans.get(scannedId);
            if (existingScan) {
                existingScan.count++;
            } else {
                unexpectedScans.set(scannedId, { rawId: rawScannedId, count: 1 });
            }

            const count = unexpectedScans.get(scannedId).count;
            const message = `UNEXPECTED ITEM: ID ${rawScannedId} not on list. Scanned ${count} time(s).`;
            
            lastScannedId = rawScannedId;
            lastScannedDisplay.textContent = lastScannedId;
            
            showMessage(message, 'text-purple-600 font-bold');
        }
        
        // Save state after every successful or unexpected scan
        saveState();
    }
}

/**
 * Clears all scanned counts and unexpected items.
 */
function clearAllScans() {
    if (!confirm('Are you sure you want to clear ALL scans (expected items and unexpected items)? This action cannot be undone for the current session.')) {
        return;
    }
    expectedStock.forEach(item => {
        item.scannedCount = 0;
    });
    unexpectedScans.clear();
    lastScannedId = 'N/A';
    lastScannedDisplay.textContent = lastScannedId;
    renderTable();
    saveState();
    showMessage('All scan counts reset.', 'text-green-600');
    scannerInput.focus();
}

/**
 * Generates the financial summary HTML.
 * Returns an object {html: string, totalMissingValue: number, totalOverValue: number}
 */
function generateFinancialSummary() {
    const priceHeaderName = priceHeaderNameInput.value.trim(); 
    if (!priceHeaderName) {
        return { html: '', totalMissingValue: 0, totalOverValue: 0 };
    }

    let totalExpectedValue = 0;
    let totalScannedValue = 0;
    let totalMissingValue = 0;
    let totalOverValue = 0;
    let totalDiscrepancyValue = 0; // The difference: Scanned - Expected

    expectedStock.forEach(item => {
        const expectedValue = item.expectedQuantity * item.unitPrice;
        const scannedValue = item.scannedCount * item.unitPrice;
        
        totalExpectedValue += expectedValue;
        totalScannedValue += scannedValue;

        const discrepancy = scannedValue - expectedValue;
        if (discrepancy < 0) {
            totalMissingValue += Math.abs(discrepancy);
        } else if (discrepancy > 0) {
            totalOverValue += discrepancy;
        }
    });
    
    // Add value of unexpected scans (no expected quantity, so total discrepancy is their scanned value)
    for (const [key, value] of unexpectedScans.entries()) {
        const item = expectedStock.find(i => i.id === key) || {}; // Look up to get unitPrice if somehow scanned item was removed from expected list (shouldn't happen, but safe).
        const unitPrice = item.unitPrice || 0;
        
        // If there's an unexpected scan, it could be a raw scan (no unit price)
        // The current logic of unexpectedScans only stores non-expected items.
        // However, an over-scan on an an expected item is already handled in the expectedStock loop.
        // We need to look up the unexpected item's price if it had been loaded, but the unexpected list is designed for items *not* in the expected list. 
        // Since we don't have a database of prices for truly unexpected items, we can only tally the value of over-scanned *expected* items.
        // The existing logic already calculates totalOverValue from expected items' over-scans. We'll leave the unexpectedScans out of the financial tally unless they are somehow tied to a price, which the current data model doesn't support for unlisted IDs.

        // If the unexpected item ID *did* exist in a previous load but was removed, its value is 0 here.
        // For simplicity and accuracy based on the currently loaded data, only use over-scans from expectedStock.
    }
    
    totalDiscrepancyValue = totalScannedValue - totalExpectedValue; // Can be negative or positive

    const format = (amount) => formatValue(amount, true);
    
    const html = `
        <div id="financial-summary-print" class="p-6 bg-white border border-gray-300 rounded-xl shadow-lg mb-6">
            <h4 class="text-xl font-bold text-gray-800 mb-4">Financial Discrepancy Summary (Based on '${priceHeaderName}' column)</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="p-3 border rounded-lg bg-indigo-50">
                    <p class="text-sm font-medium text-indigo-700">Expected Inventory Value</p>
                    <p class="text-xl font-bold text-indigo-800">${format(totalExpectedValue)}</p>
                </div>
                <div class="p-3 border rounded-lg bg-green-50">
                    <p class="text-sm font-medium text-green-700">Scanned Inventory Value</p>
                    <p class="text-xl font-bold text-green-800">${format(totalScannedValue)}</p>
                </div>
                <div class="p-3 border rounded-lg ${totalMissingValue > 0 ? 'bg-red-50' : 'bg-gray-50'}">
                    <p class="text-sm font-medium text-red-700">Missing Value (Understocked)</p>
                    <p class="text-xl font-bold ${totalMissingValue > 0 ? 'text-red-800' : 'text-gray-800'}">${format(totalMissingValue)}</p>
                </div>
                <div class="p-3 border rounded-lg ${totalOverValue > 0 ? 'bg-yellow-50' : 'bg-gray-50'}">
                    <p class="text-sm font-medium text-yellow-700">Over Value (Overstocked)</p>
                    <p class="text-xl font-bold ${totalOverValue > 0 ? 'text-yellow-800' : 'text-gray-800'}">${format(totalOverValue)}</p>
                </div>
            </div>
            <div class="mt-4 p-4 border rounded-lg ${totalDiscrepancyValue !== 0 ? (totalDiscrepancyValue < 0 ? 'bg-red-100' : 'bg-green-100') : 'bg-gray-100'}">
                <p class="text-lg font-bold ${totalDiscrepancyValue !== 0 ? (totalDiscrepancyValue < 0 ? 'text-red-900' : 'text-green-900') : 'text-gray-900'}">
                    Net Inventory Discrepancy: ${totalDiscrepancyValue < 0 ? 'LOSS' : (totalDiscrepancyValue > 0 ? 'GAIN' : 'BALANCED')} of ${format(Math.abs(totalDiscrepancyValue))}
                </p>
            </div>
        </div>
    `;
    lastFinancialSummaryHTML = html;
    return { html: html, totalMissingValue: totalMissingValue, totalOverValue: totalOverValue };
}

/**
 * Generates a common HTML table for a list of items.
 * @param {string} title The title of the report section.
 * @param {Array<Object>} data The list of items to report on.
 * @param {boolean} isMissingList Flag: true for expected item discrepancies (Missing/Over), false for unexpected items.
 */
function generateReportTable(title, data, isMissingList = true) {
    if (data.length === 0) {
        return `<h4 class="text-xl font-semibold text-gray-800 mb-4">${title} (${data.length} Items)</h4>
                <p class="text-md text-gray-600 mb-6">No items found for this list. The count is zero. ✅</p>`;
    }

    const priceHeaderName = priceHeaderNameInput.value.trim();
    const includePrice = !!priceHeaderName && isMissingList;

    let headers = '';
    let bodyRowsHTML = '';

    if (isMissingList) {
        // --- Expected Items Discrepancy List ---
        
        // Dynamic headers from the loaded file
        const dynamicHeaders = detectedHeaders; 
        const dynamicHeaderHTML = dynamicHeaders.map(h => `<th class="font-semibold text-gray-700">${h}</th>`).join('');

        // Fixed headers for quantity/status
        let fixedHeaders = ['Expected Qty', 'Scanned Qty', 'Discrepancy'];
        if (!quantityHeaderNameInput.value.trim()) {
             // If no quantity header was loaded, simplify fixed headers for single-item assets
             fixedHeaders = ['Status']; 
        }
        const fixedHeaderHTML = fixedHeaders.map(h => `<th class="font-semibold text-gray-700">${h}</th>`).join('');

        // Price headers
        let priceHeaderHTML = '';
        if (includePrice) {
            priceHeaderHTML = `<th class="font-semibold text-gray-700">${priceHeaderName}</th>
                               <th class="font-semibold text-gray-700">Value Missing/Over</th>`;
        }
        
        headers = dynamicHeaderHTML + fixedHeaderHTML + priceHeaderHTML;

        bodyRowsHTML = data.map(item => {
            const dataCells = dynamicHeaders.map(h => `<td>${item[h] || ''}</td>`).join('');
            let fixedCells;
            let priceCells = '';

            const discrepancy = item.expectedQuantity - item.scannedCount;
            
            if (!quantityHeaderNameInput.value.trim()) {
                const statusText = discrepancy > 0 ? 'MISSING' : 'OVER-SCANNED';
                fixedCells = `<td>${statusText}</td>`;
            } else {
                fixedCells = `<td>${item.expectedQuantity}</td>
                              <td>${item.scannedCount}</td>
                              <td class="${discrepancy > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}">${discrepancy}</td>`;
            }

            if (includePrice) {
                const valueDiscrepancy = discrepancy * item.unitPrice;
                priceCells = `<td>${formatValue(item.unitPrice, true)}</td>
                              <td class="${valueDiscrepancy > 0 ? 'text-red-600 font-semibold' : (valueDiscrepancy < 0 ? 'text-green-600 font-semibold' : '')}">
                                ${formatValue(valueDiscrepancy, true)}
                              </td>`;
            }

            return `<tr>${dataCells}${fixedCells}${priceCells}</tr>`;
        }).join('');
        
    } else {
        // --- UNEXPECTED Items List (The FIX) ---
        
        // Only include the raw ID and the count
        const unexpectedHeaders = ['Unique ID (Scanned)', 'Count (Unexpected)'];
        headers = unexpectedHeaders.map(h => `<th class="font-semibold text-gray-700">${h}</th>`).join('');

        bodyRowsHTML = data.map(item => {
            // 'item' here is { rawId: string, count: number } from unexpectedScans.values()
            return `<tr>
                        <td class="font-mono">${item.rawId}</td>
                        <td class="font-semibold">${item.count}</td>
                    </tr>`;
        }).join('');
    }


    let html = `
        <h4 class="text-xl font-semibold text-gray-800 mb-4">${title} (${data.length} Items)</h4>
        <table class="print-table w-full border-collapse mb-8">
            <thead>
                <tr>
                    ${headers}
                </tr>
            </thead>
            <tbody>
                ${bodyRowsHTML}
            </tbody>
        </table>
    `;
    
    return html;
}

/**
 * Renders the modal with discrepancy details.
 */
function completeCheck() {
    if (expectedStock.length === 0) {
         showMessage('Please load a stock list before completing the check.', 'text-red-500');
        return;
    }

    // 1. Filter Missing/Over-scanned Items (from expected list)
    let missingItems = [];
    let overScannedItems = [];
    expectedStock.forEach(item => {
        const discrepancy = item.expectedQuantity - item.scannedCount;
        if (discrepancy > 0) {
            // Item is understocked
            missingItems.push(item);
        } else if (discrepancy < 0) {
            // Item is overstocked
            overScannedItems.push(item);
        }
    });

    // 2. Prepare Unexpected Scans (items not in expected list)
    const unexpectedList = Array.from(unexpectedScans.values());

    // 3. Generate HTML content
    let modalHTML = '<div class="space-y-6">';

    const financialSummary = generateFinancialSummary();
    if (financialSummary.html) {
        modalHTML += financialSummary.html;
    } else {
         modalHTML += '<p class="text-md text-gray-600 mb-6 p-4 border rounded-lg bg-gray-50">Financial summary skipped. No Price/Cost header was provided.</p>';
    }

    modalHTML += `
        <div class="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">
            Report Signed Off By: <span class="font-bold text-indigo-700">${colleagueNameInput.value.trim() || 'N/A (Please sign off above)'}</span>
        </div>
    `;
    
    // Missing Items
    const missingTableHTML = generateReportTable('Missing/Understocked Items', missingItems, true);
    modalHTML += `<div class="p-4 border border-red-300 bg-red-50 rounded-lg shadow-sm">${missingTableHTML}</div>`;

    // Over-scanned Items
    const overScannedTableHTML = generateReportTable('Over-Scanned Items (Expected ID Found, but Scanned Too Many)', overScannedItems, true);
    modalHTML += `<div class="p-4 border border-yellow-300 bg-yellow-50 rounded-lg shadow-sm">${overScannedTableHTML}</div>`;

    // Unexpected Items
    const unexpectedTableHTML = generateReportTable('Unexpected Items (Not Found in Stock List)', unexpectedList, false);
    modalHTML += `<div class="p-4 border border-purple-300 bg-purple-50 rounded-lg shadow-sm">${unexpectedTableHTML}</div>`;


    modalHTML += '</div>';

    modalContent.innerHTML = modalHTML;
    discrepancyModal.classList.remove('hidden');
}

// =========================================================================
// === NEW: Report ID Generation Function ===
// =========================================================================

/**
 * Generates a unique, filename-friendly Report ID based on date, time, and user name.
 * @returns {string} The formatted report ID.
 */
function generateReportID() {
    const now = new Date();
    
    // Format Date/Time (YYYYMMDD_HHMMSS)
    const datePart = now.getFullYear().toString() + 
                     (now.getMonth() + 1).toString().padStart(2, '0') + 
                     now.getDate().toString().padStart(2, '0');
    const timePart = now.getHours().toString().padStart(2, '0') + 
                     now.getMinutes().toString().padStart(2, '0') + 
                     now.getSeconds().toString().padStart(2, '0');
    
    // Format User Name
    const rawName = colleagueNameInput.value.trim() || 'UNSPECIFIED_USER';
    // Replace non-alphanumeric characters (except space, hyphen, underscore) with nothing, then replace spaces/hyphens with underscores.
    const namePart = rawName.toUpperCase()
                        .replace(/[^A-Z0-9\s-_]/g, '')
                        .replace(/[\s-]/g, '_');
                        
    return `INVENTORY_REPORT_${datePart}_${timePart}_${namePart}`;
}


// =========================================================================
// === FIX START: Asynchronous Print Functions with Report ID ===
// =========================================================================

/**
 * Helper function to create and trigger the print process, ensuring cleanup.
 * @param {string} reportId The unique ID to use for the report title/filename.
 * @param {string} title The title for the print report.
 * @param {string} tableHTML The HTML content for the discrepancy table.
 * @param {boolean} includeFinancialSummary Whether to include the financial summary.
 */
function triggerPrint(reportId, title, tableHTML, includeFinancialSummary) { 
    // 1. Hide the modal to avoid printing it
    discrepancyModal.classList.add('hidden');
    
    // --- NEW: Set document title for filename ---
    const originalTitle = document.title;
    document.title = reportId; 
    // ---------------------------------------------

    const printContainer = document.createElement('div');
    printContainer.className = 'print-container'; 
    
    let htmlContent = `
        <h1 style="font-size: 14pt; font-weight: bold; margin-bottom: 5px;">Inventory Discrepancy Report: ${title}</h1>
        <p style="font-size: 10pt; color: #555; margin-bottom: 5px;">
            Report ID: <span style="font-weight: bold; color: #1f2937;">${reportId}</span>
        </p>
        <p style="font-size: 10pt; color: #555; margin-bottom: 15px;">
            Date: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} 
            | Checked By: ${colleagueNameInput.value.trim() || 'N/A'}
        </p>
    `;

    if (includeFinancialSummary && lastFinancialSummaryHTML) {
        htmlContent += lastFinancialSummaryHTML;
    }

    htmlContent += tableHTML;

    printContainer.innerHTML = htmlContent;

    // 2. Add the container to the body for printing
    document.body.appendChild(printContainer);

    // 3. FIX: Define cleanup function to be called AFTER the print dialog closes
    const removePrintContainer = () => {
        document.body.removeChild(printContainer);
        // --- NEW: Restore document title ---
        document.title = originalTitle;
        // -----------------------------------
        window.removeEventListener('afterprint', removePrintContainer); 
        // Optionally re-open the modal
        discrepancyModal.classList.remove('hidden');
    };

    // 4. Attach the cleanup function to the 'afterprint' event
    window.addEventListener('afterprint', removePrintContainer); 
    
    // 5. Trigger the print dialog
    window.print();
}


/**
 * Prepares and triggers the print dialog for the missing items list.
 */
function printMissingItems() {
    const reportId = generateReportID(); // GENERATE ID
    // 1. Filter the relevant data
    let missingItems = expectedStock.filter(item => (item.expectedQuantity - item.scannedCount) > 0);
    let overScannedItems = expectedStock.filter(item => (item.expectedQuantity - item.scannedCount) < 0);
    
    // 2. Generate the report tables
    const missingTableHTML = generateReportTable('Missing/Understocked Items', missingItems, true);
    const overScannedTableHTML = generateReportTable('Over-Scanned Items (Expected ID Found, but Scanned Too Many)', overScannedItems, true);
    
    // 3. Combine content for printing
    const reportContent = missingTableHTML + overScannedTableHTML;

    // 4. Call the fixed triggerPrint utility
    triggerPrint(reportId, 'Missing & Over-Scanned Items', reportContent, true); // PASS ID
}

/**
 * Prepares and triggers the print dialog for the unexpected items list.
 */
function printUnexpectedList() {
    const reportId = generateReportID(); // GENERATE ID
    // 1. Prepare the relevant data
    const unexpectedList = Array.from(unexpectedScans.values());

    // 2. Generate the report table
    const unexpectedTableHTML = generateReportTable('Unexpected Items (Not Found in Stock List)', unexpectedList, false);

    // 3. Call the fixed triggerPrint utility (Financial Summary is not relevant for items not on the expected list)
    triggerPrint(reportId, 'Unexpected Items', unexpectedTableHTML, false); // PASS ID
}

// =========================================================================
// === FIX END ===
// =========================================================================


/**
 * Renders a temporary message below the scanner input.
 * @param {string} messageText The message to display.
 * @param {string} colorClass Tailwind class for color (e.g., 'text-red-500').
 */
function showMessage(messageText, colorClass) {
    clearTimeout(window.scanTimeout);
    statusMessage.textContent = messageText;
    statusMessage.className = `mt-3 text-sm font-medium h-5 ${colorClass}`;
    window.scanTimeout = setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'mt-3 text-sm font-medium h-5';
    }, 3000);
}

/**
 * Renders a temporary message below the load data buttons.
 * @param {string} messageText The message to display.
 * @param {string} colorClass Tailwind class for color (e.g., 'text-red-500').
 */
function showLoadMessage(messageText, colorClass) {
    clearTimeout(window.loadStatusTimeout);
    loadStatusMessage.textContent = messageText;
    loadStatusMessage.className = `mt-3 text-sm font-medium h-5 ${colorClass}`;
    window.loadStatusTimeout = setTimeout(() => {
        loadStatusMessage.textContent = '';
        loadStatusMessage.className = 'mt-3 text-sm font-medium h-5';
    }, 5000);
}

// --- DEMO DATA & INITIALIZATION ---

/**
 * Updates the demo mode badge visibility.
 */
function updateDemoBadge() {
    if (isDemoData) {
        demoModeBadge.classList.remove('hidden');
    } else {
        demoModeBadge.classList.add('hidden');
    }
}

/**
 * Loads initial stock data for demo purposes.
 */
function initializeWithInitialData() {
    expectedStock = initialStockData.map(item => ({ ...item })); // Deep clone
    detectedHeaders = initialHeaders;
    isDemoData = true;

    stockMap.clear();
    expectedStock.forEach((item, index) => {
        stockMap.set(item.id, index);
    });
    unexpectedScans.clear();
    stockDataTextarea.value = '';
    lastScannedId = 'N/A';
    lastScannedDisplay.textContent = lastScannedId;
    detectedCurrencySymbol = '£'; // Default currency for demo data
    
    // Set the headers in the input fields for the demo data
    uniqueIdHeaderNameInput.value = 'Asset ID';
    quantityHeaderNameInput.value = 'Expected Quantity';
    priceHeaderNameInput.value = 'Unit Price';
    
    renderTable();
}


// --- UTILITIES ---

/**
 * Flashes a table row element to give visual feedback on a scan.
 * @param {HTMLElement} rowElement The row to flash.
 */
function flashRow(rowElement) {
    rowElement.classList.add('scan-flash');
    setTimeout(() => {
        rowElement.classList.remove('scan-flash');
    }, 300); // 300ms flash duration
}

/**
 * Filters the stock table based on the input text.
 */
function filterTable() {
    const filterText = filterInput.value.toUpperCase();
    const rows = stockTableBody.getElementsByTagName('tr');
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Use the dataset to hold all searchable text for performance
        const searchableText = row.dataset.search || '';
        
        if (searchableText.includes(filterText)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    }
}

/**
 * Saves the current application state to localStorage.
 */
function saveState() {
    const state = {
        expectedStock: expectedStock,
        unexpectedScans: Array.from(unexpectedScans.entries()), // Maps cannot be directly stringified
        detectedHeaders: detectedHeaders,
        isDemoData: isDemoData,
        lastScannedId: lastScannedId,
        detectedCurrencySymbol: detectedCurrencySymbol,
        colleagueName: colleagueNameInput.value,
        // Save header inputs so they persist between sessions
        uniqueIdHeaderName: uniqueIdHeaderNameInput.value,
        quantityHeaderName: quantityHeaderNameInput.value,
        priceHeaderName: priceHeaderNameInput.value
    };
    localStorage.setItem('stockCheckState', JSON.stringify(state));
}

/**
 * Loads the application state from localStorage.
 */
function loadState() {
    const savedState = localStorage.getItem('stockCheckState');
    if (savedState) {
        const state = JSON.parse(savedState);
        
        expectedStock = state.expectedStock;
        detectedHeaders = state.detectedHeaders;
        isDemoData = state.isDemoData;
        lastScannedId = state.lastScannedId;
        detectedCurrencySymbol = state.detectedCurrencySymbol;
        
        // Restore headers to input fields
        uniqueIdHeaderNameInput.value = state.uniqueIdHeaderName || '';
        quantityHeaderNameInput.value = state.quantityHeaderName || '';
        priceHeaderNameInput.value = state.priceHeaderName || '';

        // Restore sign-off name
        colleagueNameInput.value = state.colleagueName || '';

        // Rebuild Maps
        stockMap.clear();
        expectedStock.forEach((item, index) => {
            stockMap.set(item.id, index);
        });
        unexpectedScans = new Map(state.unexpectedScans);

        lastScannedDisplay.textContent = lastScannedId;

        renderTable();
        updateDemoBadge();
        showMessage(`State loaded for ${expectedStock.length} items. Ready to scan.`, 'text-blue-600');

    } else {
        // If no state exists, load demo data for a clean start
        initializeWithInitialData();
        saveState();
        showMessage('Welcome! Demo data loaded automatically.', 'text-blue-600');
    }
}

/**
 * Clears all local storage and reloads the initial state.
 */
function resetAppAndClearStorage() {
     if (!confirm('WARNING: Are you sure you want to completely RESET the app? This will clear all data, scans, and settings from your browser storage.')) {
        return;
    }
    localStorage.removeItem('stockCheckState');
    
    // Clear input fields
    uniqueIdHeaderNameInput.value = '';
    quantityHeaderNameInput.value = '';
    priceHeaderNameInput.value = '';
    colleagueNameInput.value = '';
    stockDataTextarea.value = '';

    // Re-run initialization to load fresh demo data
    loadState(); 
    
    showMessage('Application fully reset. All data cleared from storage.', 'text-red-600');
}

// --- EXPORT FUNCTIONS ---
// (No changes needed, kept for completeness)

/**
 * Exports a list of items to a CSV file.
 */
function exportToCSV(filename, list, columns) {
    const csvRows = [];
    
    // 1. Get all unique headers (including custom fields like rawId/count if needed)
    const headers = columns || detectedHeaders; 
    
    // Add custom headers if exporting a non-expected list
    if (filename.includes('unexpected') && !columns) {
        headers.push('Count (Unexpected)');
        headers.push('Unique ID (Raw)');
    } else if (filename.includes('full') && !columns) {
        headers.push('Expected Quantity');
        headers.push('Scanned Quantity');
        headers.push('Remaining Quantity');
    }
    
    // Format headers for CSV
    csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    // 2. Generate rows
    list.forEach(item => {
        const values = headers.map(header => {
            let value;
            if (header === 'Count (Unexpected)') {
                 value = item.count || 0;
            } else if (header === 'Unique ID (Raw)') {
                value = item.rawId || item[uniqueIdHeaderNameInput.value.trim()] || '';
            } else if (header === 'Expected Quantity') {
                value = item.expectedQuantity || 0;
            } else if (header === 'Scanned Quantity') {
                value = item.scannedCount || 0;
            } else if (header === 'Remaining Quantity') {
                 const remaining = item.expectedQuantity - item.scannedCount;
                 value = remaining > 0 ? remaining : 0;
            } else {
                value = item[header] || '';
            }
            // Handle commas and quotes within values
            return `"${String(value).replace(/"/g, '""')}"`; 
        });
        csvRows.push(values.join(','));
    });

    // 3. Create Blob and download
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Exports the full list with current scan data to CSV.
 */
function exportFullList() {
    const filename = `Stock_Check_Full_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    exportToCSV(filename, expectedStock);
}

/**
 * Exports the unexpected items list to CSV.
 */
function exportUnexpectedItems() {
     const unexpectedList = Array.from(unexpectedScans.values());
    const filename = `Stock_Check_Unexpected_Items_${new Date().toISOString().slice(0, 10)}.csv`;
    // For unexpected items, we only export the raw ID and the count
    exportToCSV(filename, unexpectedList, ['Unique ID (Raw)', 'Count (Unexpected)']);
}

/**
 * Exports the full list with current scan data to JSON.
 */
function exportFullListJSON() {
    const filename = `Stock_Check_Full_Report_${new Date().toISOString().slice(0, 10)}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ 
        expectedStock: expectedStock,
        unexpectedScans: Array.from(unexpectedScans.entries())
    }, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}


// --- INITIALIZATION ---
window.onload = function() {
    loadState(); 
    
    scannerInput.addEventListener('keydown', handleScan);
    loadDataButton.addEventListener('click', loadStockData);
    
    // New event listener for auto-detection on paste/input
    stockDataTextarea.addEventListener('input', handleDataPaste);
    
    completeCheckButton.addEventListener('click', completeCheck);
    clearAllButton.addEventListener('click', clearAllScans);
    
    filterInput.addEventListener('keyup', filterTable); 

    // Listener for Sign-off Input to save state on every change
    colleagueNameInput.addEventListener('input', () => {
        saveState();
    });

    // NEW: Full Reset Button Listener
    document.getElementById('resetAppButton').addEventListener('click', resetAppAndClearStorage);
    
    // REMOVED 'Load Demo Button Listener' as logic is now in the button's HTML onclick attribute.
    
    scannerInput.focus(); 
};
