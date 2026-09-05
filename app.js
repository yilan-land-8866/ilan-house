let salesData = [];
let chengjiaoData = [];
let offshelfData = [];
let allUnifiedData = [];
let currentStatusFilter = 'all'; // 'all', '銷售中', '已售出', '已下架'
let filteredData = [];
let currentPage = 1;
let pageSize = 50;
let sortField = 'date';
let sortDirection = -1; // -1 for desc, 1 for asc
let selectedRecord = null;

const COUNTY_TOWN_MAP = {
    '宜蘭縣': ['宜蘭','羅東','蘇澳','頭城','礁溪','壯圍','員山','冬山','五結','三星','大同','南澳'],
    '台北市': ['台北','萬華','中正','大安','信義','松山','士林','北投','中山','大同','內湖','南港','文山'],
    '新北市': ['新北','板橋','新莊','中和','永和','土城','三重','蘆洲','汐止','三峽','鶯歌','淡水','林口','新店','樹林','深坑'],
    '桃園市': ['桃園','中壢','平鎮','八德','楊梅','大溪','龍潭','蘆竹','龜山'],
    '基隆市': ['基隆'],
    '花蓮縣': ['花蓮','壽豐','吉安','新城','鳳林','瑞穗','光復','玉里','富里'],
    '台東縣': ['台東'],
    '台中市': ['台中'],
    '台南市': ['台南'],
    '高雄市': ['高雄'],
    '新竹縣市': ['新竹','竹北','竹東'],
    '苗栗縣': ['苗栗'],
    '彰化縣': ['彰化'],
    '雲林縣': ['雲林'],
    '嘉義縣市': ['嘉義'],
    '屏東縣': ['屏東'],
    '南投縣': ['南投']
};

const ALL_TOWNS_FLAT = [];
const TOWN_TO_COUNTY = {};
for (const county in COUNTY_TOWN_MAP) {
    const towns = COUNTY_TOWN_MAP[county];
    for (const t of towns) {
        ALL_TOWNS_FLAT.push(t);
        TOWN_TO_COUNTY[t] = county;
    }
}
ALL_TOWNS_FLAT.sort((a, b) => b.length - a.length);

function detectLocation(name, location) {
    const text = (name || '') + ' ' + (location || '');
    for (const t of ALL_TOWNS_FLAT) {
        if (text.includes(t)) {
            return { county: TOWN_TO_COUNTY[t], town: t };
        }
    }
    return { county: '', town: '' };
}

function sanitizeUnitPrice(unitPrice, totalPrice, areaPing) {
    if (!totalPrice || !areaPing || areaPing <= 0 || totalPrice <= 0) {
        return (unitPrice && !isNaN(unitPrice) && unitPrice > 0) ? Math.round(unitPrice * 100) / 100 : null;
    }

    const calcUnitPrice = totalPrice / areaPing;

    if (!unitPrice || isNaN(unitPrice) || unitPrice <= 0) {
        return Math.round(calcUnitPrice * 100) / 100;
    }

    // 雙重確認 1: 原始 Excel 單位為「元/坪」而非「萬/坪」 (除以 10000 後接近 總價/坪數)
    const unitInYuan = unitPrice / 10000;
    const ratioToCalc = unitInYuan / calcUnitPrice;
    if (ratioToCalc >= 0.5 && ratioToCalc <= 2.0) {
        return Math.round(unitInYuan * 100) / 100;
    }

    // 雙重確認 2: 單價與 (總價/坪數) 差異過大 (超過 5 倍或低於 0.2 倍)，以 總價/坪數 為準
    const ratioDirect = unitPrice / calcUnitPrice;
    if (ratioDirect > 5 || ratioDirect < 0.2) {
        return Math.round(calcUnitPrice * 100) / 100;
    }

    return Math.round(unitPrice * 100) / 100;
}

// v2 架構：非物件過濾已在後端 sync_engine.js / database.json 處理完畢
// 前端直接使用資料庫內容，僅保留 sanitizeUnitPrice 作為防禦性雙重確認

function getEffectivePing(item) {
    if (!item) return null;
    if (item.build_ping && item.build_ping > 0) return item.build_ping;
    if (item.land_ping && item.land_ping > 0) return item.land_ping;
    if (item.area_ping && item.area_ping > 0) return item.area_ping;
    return null;
}

function getBrandInfo(item) {
    const code = (item.code || '').toUpperCase();
    const src = ((item.source_file || '') + ' ' + (item.id || '') + ' ' + (item.store_name || '')).toUpperCase();

    let brand = '永慶不動產';
    let brandClass = 'store-brand-yungching';
    let brandShort = '永慶';

    if (code.startsWith('UA') || src.includes('有巢')) {
        brand = '有巢氏房屋';
        brandShort = '有巢氏';
        brandClass = 'store-brand-youchao';
    } else if (code.startsWith('YA') || code.startsWith('YG') || src.includes('永義') || src.includes('YE')) {
        brand = '永義房屋';
        brandShort = '永義';
        brandClass = 'store-brand-yongyi';
    } else if (code.startsWith('HA') || code.startsWith('DA') || code.startsWith('EA') || src.includes('台慶')) {
        brand = '台慶不動產';
        brandShort = '台慶';
        brandClass = 'store-brand-taiching';
    } else if (src.includes('永慶') || src.includes('YC') || code.startsWith('AA') || code.startsWith('BA') || code.startsWith('A1')) {
        brand = '永慶不動產';
        brandShort = '永慶';
        brandClass = 'store-brand-yungching';
    }

    let rawStore = item.store_name || '';
    rawStore = rawStore.replace(/\([^\)]+\)/g, '').trim();

    if (!rawStore && item.id) {
        const parts = item.id.split('-');
        if (parts.length >= 2 && parts[0].length <= 8) {
            let p0 = parts[0].replace(/^(YE|YC|UA|HA|DA)/i, '').trim();
            if (p0) rawStore = p0;
        }
    }

    if (!rawStore) rawStore = '加盟店';

    if (!rawStore.endsWith('店') && !rawStore.endsWith('加盟')) {
        rawStore += '加盟店';
    } else if (rawStore.endsWith('加盟')) {
        rawStore += '店';
    }

    const fullStoreDisplay = `${brandShort} ${rawStore}`;

    return {
        brand,
        brandShort,
        brandClass,
        storeName: rawStore,
        fullDisplay: fullStoreDisplay
    };
}

function processLocations(list) {
    list.forEach(item => {
        const loc = detectLocation(item.name, item.location);
        item._county = loc.county;
        item._town = loc.town;
        
        // 有效坪數：建物坪數優先，其次土地坪數，最後主要參考坪數
        const effPing = getEffectivePing(item);
        item.unit_price = sanitizeUnitPrice(item.unit_price, item.total_price, effPing);
        item._brandInfo = getBrandInfo(item);
        const statusAlias = (item.status || '') + ' ' + (item.status === '已售出' ? '成交 已成交 售出' : '') + ' ' + (item.status === '銷售中' ? '銷售 在售 售' : '') + ' ' + (item.status === '已下架' ? '停售 到期 下架' : '');
        item._searchText = ((item.name || '') + ' ' + (item.location || '') + ' ' + (item.agent || '') + ' ' + (item.code || '') + ' ' + item._brandInfo.fullDisplay + ' ' + (item.store_name || '') + ' ' + statusAlias + ' ' + (item.category || '')).toLowerCase();
    });
}

// ═══ 雲端帳號審核與安全認證機制 (固定密碼：9081 作為管理員備用通道) ═══
const STORAGE_KEY_AUTH_PIN = 'real_estate_app_auth_pin';
const SYSTEM_PIN = '9081';

function handleUserLogout() {
    localStorage.removeItem(STORAGE_KEY_AUTH_PIN);
    localStorage.removeItem('yc_user_name');
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'flex';
    updateUserUI('未登入');
}


function updateUserUI(name) {
    const label = document.getElementById('userNameLabel');
    if (label) label.textContent = name;
}

function handleUserMenu() {
    const name = localStorage.getItem('yc_user_name') || '管理員';
    if (confirm(`👤 目前登入身分：${name}\n\n是否確定要登出並重新鎖定系統？`)) {
        handleUserLogout();
    }
}

function checkAuth() {
    const storedPin = localStorage.getItem(STORAGE_KEY_AUTH_PIN) || localStorage.getItem('yc_ios_pin') || '';
    const userName = localStorage.getItem('yc_user_name') || '已授權';
    updateUserUI(userName);

    const authOverlay = document.getElementById('authOverlay');
    if (storedPin) {
        if (authOverlay) authOverlay.style.display = 'none';
        loadData(storedPin).then(ok => {
            if (!ok) {
                if (authOverlay) authOverlay.style.display = 'flex';
                const input = document.getElementById('authPasswordInput');
                if (input) setTimeout(() => input.focus(), 100);
            }
        });
    } else {
        if (authOverlay) authOverlay.style.display = 'flex';
        const input = document.getElementById('authPasswordInput');
        if (input) setTimeout(() => input.focus(), 100);
    }
}

async function verifyPassword() {
    const input = document.getElementById('authPasswordInput');
    const errorMsg = document.getElementById('authErrorMsg');
    const enteredPin = input ? input.value.trim() : '';

    if (!enteredPin) {
        if (errorMsg) {
            errorMsg.textContent = '請輸入通行密碼';
            errorMsg.style.display = 'flex';
        }
        return;
    }

    if (errorMsg) {
        errorMsg.textContent = '🔓 正在驗證與解密資料庫...';
        errorMsg.style.display = 'flex';
    }

    const success = await loadData(enteredPin);
    if (success) {
        localStorage.setItem(STORAGE_KEY_AUTH_PIN, enteredPin);
        localStorage.setItem('yc_ios_pin', enteredPin);
        localStorage.setItem('yc_user_name', '系統管理員');
        updateUserUI('系統管理員');
        if (errorMsg) errorMsg.style.display = 'none';
        const authOverlay = document.getElementById('authOverlay');
        if (authOverlay) authOverlay.style.display = 'none';
    } else {
        if (errorMsg) {
            errorMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> 密碼錯誤，請重新輸入';
            errorMsg.style.display = 'flex';
        }
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

function handleUserLogout() {
    localStorage.removeItem(STORAGE_KEY_AUTH_PIN);
    localStorage.removeItem('yc_ios_pin');
    localStorage.removeItem('yc_user_name');
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'flex';
    updateUserUI('未登入');
}

function logoutAuth() {
    handleUserMenu();
}

// Initialize app on load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// ─── 載入資料庫 (軍規級 Web Crypto API AES-256-GCM + PBKDF2 動態解密) ────────
async function decryptPayload(encObj, enteredPin) {
    if (!encObj || !enteredPin) return [];
    if (Array.isArray(encObj)) return encObj;
    if (!encObj._encrypted || !encObj.data || !encObj.salt || !encObj.iv || !encObj.tag) return [];

    try {
        const strToBytes = b64 => {
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr;
        };

        const salt = strToBytes(encObj.salt);
        const iv = strToBytes(encObj.iv);
        const tag = strToBytes(encObj.tag);
        const ciphertext = strToBytes(encObj.data);

        const cipherWithTag = new Uint8Array(ciphertext.length + tag.length);
        cipherWithTag.set(ciphertext);
        cipherWithTag.set(tag, ciphertext.length);

        const subtle = window.crypto.subtle;
        const enc = new TextEncoder();
        const baseKey = await subtle.importKey(
            'raw',
            enc.encode(enteredPin),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const derivedKey = await subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const decryptedBuffer = await subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            derivedKey,
            cipherWithTag
        );

        const jsonStr = new TextDecoder('utf-8').decode(decryptedBuffer);
        return JSON.parse(jsonStr);
    } catch(err) {
        console.warn('Decryption failed with provided pin:', err);
        return null;
    }
}

async function loadData(pin) {
    const effPin = pin || localStorage.getItem(STORAGE_KEY_AUTH_PIN) || localStorage.getItem('yc_ios_pin') || '';
    if (!effPin) return false;

    showLoading();
    try {
        const isFileProtocol = window.location.protocol === 'file:';
        const salesUrl = isFileProtocol ? 'sales_data.json' : 'sales_data.json?t=' + Date.now();
        const chengjiaoUrl = isFileProtocol ? 'chengjiao_data.json' : 'chengjiao_data.json?t=' + Date.now();
        const offshelfUrl = isFileProtocol ? 'offshelf_data.json' : 'offshelf_data.json?t=' + Date.now();

        const fetchOpts = isFileProtocol ? {} : { cache: 'no-store' };
        const [rawSales, rawChengjiao, rawOffshelf] = await Promise.all([
            fetch(salesUrl, fetchOpts).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(chengjiaoUrl, fetchOpts).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(offshelfUrl, fetchOpts).then(r => r.ok ? r.json() : null).catch(() => null)
        ]);

        const [sRes, cRes, oRes] = await Promise.all([
            decryptPayload(rawSales, effPin),
            decryptPayload(rawChengjiao, effPin),
            decryptPayload(rawOffshelf, effPin)
        ]);

        if (sRes === null && cRes === null && oRes === null) {
            return false; // Wrong PIN!
        }

        salesData = sRes || [];
        chengjiaoData = cRes || [];
        offshelfData = oRes || [];

        // 統一標準化案件狀態
        salesData.forEach(item => { item.status = '銷售中'; });
        chengjiaoData.forEach(item => { item.status = '已售出'; });
        offshelfData.forEach(item => { item.status = '已下架'; });

        processLocations(salesData);
        processLocations(chengjiaoData);
        processLocations(offshelfData);

        // 融合為全案件單一資料庫
        allUnifiedData = [...salesData, ...chengjiaoData, ...offshelfData];

        const allBadge = document.getElementById('allBadge');
        if (allBadge) allBadge.textContent = allUnifiedData.length.toLocaleString();
        document.getElementById('salesBadge').textContent = salesData.length.toLocaleString();
        document.getElementById('chengjiaoBadge').textContent = chengjiaoData.length.toLocaleString();
        const offBadge = document.getElementById('offshelfBadge');
        if (offBadge) offBadge.textContent = offshelfData.length.toLocaleString();

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('syncTime').textContent = `最新更新：${y}/${m}/${d} ${hh}:${mm}`;

        populateCountySelect();
        applyFilter();
        return true;
    } catch (err) {
        console.error("Failed to load json datasets:", err);
        document.getElementById('tableBody').innerHTML = `
            <tr>
                <td colspan="10" class="loading-cell" style="color: #ef4444;">
                    <i class="fa-solid fa-triangle-exclamation"></i> 載入資料庫失敗，請重試或點擊「手動更新按鈕」。
                </td>
            </tr>
        `;
        return false;
    }
}

function getCurrentRawData() {
    if (currentStatusFilter === '銷售中' || currentStatusFilter === 'sales') return salesData;
    if (currentStatusFilter === '已售出' || currentStatusFilter === 'chengjiao') return chengjiaoData;
    if (currentStatusFilter === '已下架' || currentStatusFilter === 'offshelf') return offshelfData;
    return allUnifiedData;
}

function populateCountySelect() {
    const countySelect = document.getElementById('countySelect');
    if (!countySelect) return;

    const rawData = getCurrentRawData();
    const countyCounts = {};

    rawData.forEach(item => {
        if (item._county) {
            countyCounts[item._county] = (countyCounts[item._county] || 0) + 1;
        }
    });

    countySelect.innerHTML = '<option value="">全部縣市</option>';
    const sortedCounties = Object.keys(countyCounts).sort((a, b) => countyCounts[b] - countyCounts[a]);

    sortedCounties.forEach(county => {
        const opt = document.createElement('option');
        opt.value = county;
        opt.textContent = `${county} (${countyCounts[county]})`;
        countySelect.appendChild(opt);
    });

    populateTownSelect();
}

function populateTownSelect() {
    const countySelect = document.getElementById('countySelect');
    const townSelect = document.getElementById('townSelect');
    if (!townSelect) return;

    const selectedCounty = countySelect ? countySelect.value : '';
    const rawData = getCurrentRawData();
    const townCounts = {};

    rawData.forEach(item => {
        if (!selectedCounty || item._county === selectedCounty) {
            if (item._town) {
                townCounts[item._town] = (townCounts[item._town] || 0) + 1;
            }
        }
    });

    townSelect.innerHTML = '<option value="">全部鄉鎮市區</option>';
    if (selectedCounty && COUNTY_TOWN_MAP[selectedCounty]) {
        COUNTY_TOWN_MAP[selectedCounty].forEach(town => {
            const count = townCounts[town] || 0;
            const opt = document.createElement('option');
            opt.value = town;
            opt.textContent = `${town} (${count})`;
            townSelect.appendChild(opt);
        });
    } else {
        const sortedTowns = Object.keys(townCounts).sort((a, b) => townCounts[b] - townCounts[a]);
        sortedTowns.forEach(town => {
            const opt = document.createElement('option');
            opt.value = town;
            opt.textContent = `${town} (${townCounts[town]})`;
            townSelect.appendChild(opt);
        });
    }

    handleFilterChange();
}

function getLatestDate(allDataList) {
    if (!allDataList || allDataList.length === 0) return '';
    const sorted = [...allDataList].sort((a, b) => new Date(b.date) - new Date(a.date));
    return sorted[0].date || '';
}

function switchTab(statusKey) {
    switchStatusFilter(statusKey);
}

function switchStatusFilter(statusKey) {
    let target = statusKey || 'all';
    if (target === 'sales') target = '銷售中';
    else if (target === 'chengjiao') target = '已售出';
    else if (target === 'offshelf') target = '已下架';

    currentStatusFilter = target;

    const tabAll = document.getElementById('tabAll');
    if (tabAll) tabAll.classList.toggle('active', currentStatusFilter === 'all');
    
    const tabSales = document.getElementById('tabSales');
    if (tabSales) tabSales.classList.toggle('active', currentStatusFilter === '銷售中');
    
    const tabChengjiao = document.getElementById('tabChengjiao');
    if (tabChengjiao) tabChengjiao.classList.toggle('active', currentStatusFilter === '已售出');
    
    const tabOff = document.getElementById('tabOffshelf');
    if (tabOff) tabOff.classList.toggle('active', currentStatusFilter === '已下架');

    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect) {
        statusSelect.value = currentStatusFilter;
    }

    currentPage = 1;
    populateCountySelect();
    applyFilter();
}

function handleStatusSelectChange() {
    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect) {
        switchStatusFilter(statusSelect.value);
    }
}

function handleCountyChange() {
    populateTownSelect();
}

function handleFilterChange() {
    currentPage = 1;
    applyFilter();
}

function applyFilter() {
    const rawData = getCurrentRawData();
    filterAndRender(rawData);
}

function filterAndRender(rawData) {
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const county = document.getElementById('countySelect') ? document.getElementById('countySelect').value : '';
    const town = document.getElementById('townSelect') ? document.getElementById('townSelect').value : '';
    const category = document.getElementById('categorySelect').value;
    const minPrice = parseFloat(document.getElementById('minPrice').value) || null;
    const maxPrice = parseFloat(document.getElementById('maxPrice').value) || null;
    const minArea = parseFloat(document.getElementById('minArea').value) || null;
    const maxArea = parseFloat(document.getElementById('maxArea').value) || null;

    filteredData = rawData.filter(item => {
        // Keyword Search
        if (search && (!item._searchText || !item._searchText.includes(search))) {
            return false;
        }

        // County & Town Filter
        if (county && item._county !== county) return false;
        if (town && item._town !== town) return false;

        // Category Filter
        if (category && item.category !== category) return false;

        // Price Filter
        if (minPrice !== null && (item.total_price === null || item.total_price < minPrice)) return false;
        if (maxPrice !== null && (item.total_price === null || item.total_price > maxPrice)) return false;

        // Area Filter (matches build_ping, land_ping, or area_ping)
        if (minArea !== null) {
            const pings = [item.build_ping, item.land_ping, item.area_ping].filter(v => v !== null && v !== undefined && v > 0);
            if (pings.length === 0 || !pings.some(p => p >= minArea)) return false;
        }
        if (maxArea !== null) {
            const pings = [item.build_ping, item.land_ping, item.area_ping].filter(v => v !== null && v !== undefined && v > 0);
            if (pings.length === 0 || !pings.some(p => p <= maxArea)) return false;
        }

        return true;
    });

    // Apply Sorting (Nulls / Zero / Empty are always placed at the bottom)
    filteredData.sort((a, b) => {
        const isNumField = ['total_price', 'unit_price', 'area_ping', 'build_ping', 'land_ping'].includes(sortField);

        if (sortField === 'date') {
            const dA = a.date || '0000/00/00';
            const dB = b.date || '0000/00/00';
            return sortDirection === 1 ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }

        if (sortField === 'status') {
            const order = { '銷售中': 1, '已售出': 2, '已下架': 3 };
            const oA = order[a.status] || 99;
            const oB = order[b.status] || 99;
            return sortDirection === 1 ? (oA - oB) : (oB - oA);
        }

        if (isNumField) {
            let valA = a[sortField];
            let valB = b[sortField];
            if (sortField === 'area_ping') {
                valA = a.area_ping || a.build_ping || a.land_ping;
                valB = b.area_ping || b.build_ping || b.land_ping;
            }
            const hasA = valA !== null && valA !== undefined && !isNaN(valA) && valA > 0;
            const hasB = valB !== null && valB !== undefined && !isNaN(valB) && valB > 0;

            if (!hasA && !hasB) return 0;
            if (!hasA) return 1; // Put null at bottom
            if (!hasB) return -1; // Put null at bottom

            return sortDirection === 1 ? (valA - valB) : (valB - valA);
        }

        let strA = String(a[sortField] || '');
        let strB = String(b[sortField] || '');
        return sortDirection === 1 ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    updateKPIs(filteredData);
    renderTable();
}

function getPingDisplayHtml(item) {
    const hasBuild = item.build_ping && item.build_ping > 0;
    const hasLand = item.land_ping && item.land_ping > 0;

    if (hasBuild && hasLand) {
        return `
            <div class="ping-cell">
                <div class="ping-row ping-val-build"><span class="ping-tag ping-tag-build">建</span><span class="ping-num">${item.build_ping.toLocaleString()} 坪</span></div>
                <div class="ping-row ping-val-land"><span class="ping-tag ping-tag-land">地</span><span class="ping-num">${item.land_ping.toLocaleString()} 坪</span></div>
            </div>
        `;
    } else if (hasBuild) {
        return `
            <div class="ping-cell">
                <div class="ping-row ping-val-build"><span class="ping-tag ping-tag-build">建</span><span class="ping-num">${item.build_ping.toLocaleString()} 坪</span></div>
            </div>
        `;
    } else if (hasLand) {
        return `
            <div class="ping-cell">
                <div class="ping-row ping-val-land"><span class="ping-tag ping-tag-land">地</span><span class="ping-num">${item.land_ping.toLocaleString()} 坪</span></div>
            </div>
        `;
    } else if (item.area_ping) {
        return `<div class="ping-cell"><div class="ping-row"><span class="ping-num">${item.area_ping.toLocaleString()} 坪</span></div></div>`;
    }
    return '-';
}

function updateKPIs(data) {
    const totalCount = data.length;
    let totalVolume = 0;
    let totalArea = 0;
    let areaCount = 0;
    let totalUnitPrice = 0;
    let unitCount = 0;

    data.forEach(d => {
        if (d.total_price) totalVolume += d.total_price;
        if (d.area_ping) {
            totalArea += d.area_ping;
            areaCount++;
        }
        if (d.unit_price) {
            totalUnitPrice += d.unit_price;
            unitCount++;
        }
    });

    const volumeInYi = (totalVolume / 10000).toFixed(2);
    const avgUnitPrice = unitCount > 0 ? (totalUnitPrice / unitCount).toFixed(1) : 0;
    const avgArea = areaCount > 0 ? (totalArea / areaCount).toFixed(1) : 0;

    document.getElementById('kpiTotalCount').innerHTML = `${totalCount.toLocaleString()} <small>筆</small>`;
    document.getElementById('kpiTotalVolume').innerHTML = `${volumeInYi} <small>億</small>`;
    document.getElementById('kpiAvgUnitPrice').innerHTML = `${avgUnitPrice} <small>萬/坪</small>`;
    document.getElementById('kpiAvgArea').innerHTML = `${avgArea} <small>坪</small>`;
}

function getLocationDisplay(item) {
    if (!item || !item.location) return '-';
    const loc = item.location.trim();
    if (!loc) return '-';
    if (loc === item.name || loc === item.id || (item.code && loc.includes(item.code) && !/(段|\d+號|\d+地號|地號|門牌|坐落|路\d*號|街\d*號)/.test(loc))) {
        return '-';
    }
    return escapeHtml(loc);
}

function getStatusBadge(status) {
    if (status === '已售出' || status === '成交') {
        return `<span class="status-pill status-pill-sold"><i class="fa-solid fa-handshake"></i> 已售出</span>`;
    }
    if (status === '已下架') {
        return `<span class="status-pill status-pill-offshelf"><i class="fa-solid fa-ban"></i> 已下架</span>`;
    }
    return `<span class="status-pill status-pill-sales"><i class="fa-solid fa-house-circle-check"></i> 銷售中</span>`;
}

function renderTable() {
    const tbody = document.getElementById('tableBody');
    if (filteredData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="loading-cell">
                    <i class="fa-solid fa-magnifying-glass"></i> 沒有符合條件的案件紀錄。
                </td>
            </tr>
        `;
        updatePagination(0);
        return;
    }

    const startIndex = (currentPage - 1) * pageSize;
    const pageItems = filteredData.slice(startIndex, startIndex + pageSize);

    tbody.innerHTML = pageItems.map((item, idx) => `
        <tr onclick="openDetailModal(${startIndex + idx})">
            <td><i class="fa-regular fa-calendar" style="color: #64748b; margin-right: 6px;"></i>${item.date || '-'}</td>
            <td style="text-align: center;">${getStatusBadge(item.status)}</td>
            <td>${getCategoryTag(item.category, item.status)}</td>
            <td class="case-name-cell">
                ${item._town ? `<span class="town-chip"><i class="fa-solid fa-location-dot"></i> ${item._town}</span>` : ''}
                <span class="case-name-title">${escapeHtml(item.name || '-')}</span>
            </td>
            <td>${escapeHtml(item.location || '-')}</td>
            <td>${getPingDisplayHtml(item)}</td>
            <td class="unit-price-cell">${item.unit_price ? `<span class="unit-price-text">${item.unit_price.toFixed(1)}</span>` : '-'}</td>
            <td style="text-align: right;" class="price-cell">
                <span class="price-text">${item.total_price ? item.total_price.toLocaleString() : '-'}</span>
                ${item.total_price ? '<span class="price-unit">萬</span>' : ''}
            </td>
            <td style="font-weight: 600;">${escapeHtml(item.agent || '-')}</td>
            <td>
                <div class="store-dual-cell">
                    <span class="store-brand-badge ${(item._brandInfo || {}).brandClass || 'store-brand-other'}">
                        <i class="fa-solid fa-store"></i> ${(item._brandInfo || {}).brand || '加盟店'}
                    </span>
                    <span class="store-name-text">${escapeHtml((item._brandInfo || {}).storeName || item.store_name || '-')}</span>
                </div>
            </td>
        </tr>
    `).join('');

    updatePagination(filteredData.length);
}

function getCategoryTag(cat, status) {
    let tagClass = 'tag-other';
    if (cat === '農舍') tagClass = 'tag-nongshe';
    else if (cat === '別墅') tagClass = 'tag-bieshu';
    else if (cat === '店面') tagClass = 'tag-dianmian';
    else if (cat === '建地' || cat === '農地' || cat === '農建地') tagClass = 'tag-jiandi';
    else if (cat === '華廈') tagClass = 'tag-huaxia';
    else if (cat === '透天') tagClass = 'tag-toutian';
    return `<span class="tag-badge ${tagClass}">${cat || '其他'}</span>`;
}

function updatePagination(total) {
    const totalPages = Math.ceil(total / pageSize) || 1;
    const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, total);

    document.getElementById('pageStart').textContent = start;
    document.getElementById('pageEnd').textContent = end;
    document.getElementById('totalRecords').textContent = total.toLocaleString();

    document.getElementById('pageIndicator').textContent = `${currentPage} / ${totalPages}`;
    document.getElementById('btnPrevPage').disabled = currentPage <= 1;
    document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
}

function changePage(delta) {
    const totalPages = Math.ceil(filteredData.length / pageSize) || 1;
    currentPage += delta;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    renderTable();
}

function handlePageSizeChange() {
    pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    currentPage = 1;
    renderTable();
}

function sortTable(field) {
    if (sortField === field) {
        sortDirection = sortDirection * -1;
    } else {
        sortField = field;
        sortDirection = -1;
    }
    const rawData = getCurrentRawData();
    filterAndRender(rawData);
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect) statusSelect.value = 'all';
    currentStatusFilter = 'all';
    
    const tabAll = document.getElementById('tabAll');
    if (tabAll) tabAll.classList.add('active');
    document.getElementById('tabSales').classList.remove('active');
    document.getElementById('tabChengjiao').classList.remove('active');
    const offTab = document.getElementById('tabOffshelf');
    if (offTab) offTab.classList.remove('active');

    if (document.getElementById('countySelect')) document.getElementById('countySelect').value = '';
    if (document.getElementById('townSelect')) document.getElementById('townSelect').innerHTML = '<option value="">全部鄉鎮</option>';
    document.getElementById('categorySelect').value = '';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.getElementById('minArea').value = '';
    document.getElementById('maxArea').value = '';
    handleFilterChange();
}

function openDetailModal(idx) {
    try {
        selectedRecord = filteredData[idx];
        if (!selectedRecord) return;

        const statusPrefix = selectedRecord.status === '已售出' || selectedRecord.status === '成交' ? '🤝 已售出' : (selectedRecord.status === '已下架' ? '📦 已下架' : '🏡 銷售中');
        document.getElementById('modalTitle').textContent = `【${statusPrefix}】${selectedRecord.name || ''}`;
        
        let historyHtml = '';
        if (selectedRecord.history && Array.isArray(selectedRecord.history) && selectedRecord.history.length > 0) {
            historyHtml = `
                <div class="modal-history-container">
                    <div class="history-title"><i class="fa-solid fa-clock-rotate-left"></i> 歷次委託與改價軌跡</div>
                    <div class="history-timeline-list">
                        ${selectedRecord.history.slice().reverse().map((h, hIdx) => `
                            <div class="history-row ${hIdx === 0 ? 'current' : ''}">
                                <div class="history-dot"></div>
                                <div class="history-body">
                                    <div class="history-header">
                                        <span class="history-date"><i class="fa-regular fa-calendar"></i> ${escapeHtml(h.date || '-')}</span>
                                        <span class="history-price">${h.total_price ? Number(h.total_price).toLocaleString() + ' 萬' : ''}</span>
                                    </div>
                                    ${h.name ? `<div class="history-name"><i class="fa-solid fa-tag"></i> 案名：${escapeHtml(h.name)}</div>` : ''}
                                    <div class="history-desc">${escapeHtml(h.event || '資料異動更正')}</div>
                                    ${h.agent ? `<div class="history-sub"><i class="fa-solid fa-user-tie"></i> ${escapeHtml(h.agent)} ${h.store_name ? '· ' + escapeHtml(h.store_name) : ''}</div>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        document.getElementById('modalBody').innerHTML = `
            <div class="detail-row"><span class="detail-label">案件狀態</span><span class="detail-val">${getStatusBadge(selectedRecord.status)}</span></div>
            <div class="detail-row"><span class="detail-label">接案/異動日期</span><span class="detail-val">${escapeHtml(selectedRecord.date || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">案件類別</span><span class="detail-val">${escapeHtml(selectedRecord.category || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">縣市/鄉鎮</span><span class="detail-val">${escapeHtml((selectedRecord._county || '') + ' ' + (selectedRecord._town || ''))}</span></div>
            <div class="detail-row"><span class="detail-label">土地地號/門牌</span><span class="detail-val">${escapeHtml(selectedRecord.location || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">總價 (萬元)</span><span class="detail-val" style="color: #dc2626; font-size: 18px; font-weight: 800;">${selectedRecord.total_price ? selectedRecord.total_price.toLocaleString() + ' 萬' : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">單價 (萬/坪)</span><span class="detail-val">${selectedRecord.unit_price ? selectedRecord.unit_price.toFixed(1) + ' 萬/坪' : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">建物權狀坪數</span><span class="detail-val" style="color: #2563eb; font-weight: 700;">${selectedRecord.build_ping ? selectedRecord.build_ping.toLocaleString() + ' 坪' : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">土地總坪數</span><span class="detail-val" style="color: #16a34a; font-weight: 700;">${selectedRecord.land_ping ? selectedRecord.land_ping.toLocaleString() + ' 坪' : '-'}</span></div>
            <div class="detail-row"><span class="detail-label">開發/專案經紀人</span><span class="detail-val" style="color: #2563eb; font-weight: 700;">${escapeHtml(selectedRecord.agent || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">所屬加盟店家/公司</span><span class="detail-val">
                <span class="store-chip ${(selectedRecord._brandInfo || {}).brandClass || 'store-brand-other'}">
                    <i class="fa-solid fa-store"></i> ${escapeHtml((selectedRecord._brandInfo || {}).fullDisplay || selectedRecord.store_name || '-')}
                </span>
                ${selectedRecord.store_name ? `<span style="font-size: 12px; color: #64748b; margin-left: 8px;">(${escapeHtml(selectedRecord.store_name)})</span>` : ''}
            </span></div>
            <div class="detail-row"><span class="detail-label">物件編號</span><span class="detail-val font-mono" style="font-weight: 700; color: #0284c7;">${escapeHtml(selectedRecord.code || '-')}</span></div>
            <div class="detail-row"><span class="detail-label">原始檔案路徑</span><span class="detail-val" style="word-break: break-all; font-size: 12px; color: #64748b;">${escapeHtml(selectedRecord.source_file || '-')}</span></div>
            ${historyHtml}
        `;

        const modal = document.getElementById('detailModal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    } catch(err) {
        console.error('Error opening detail modal:', err);
    }
}

function closeModal() {
    const modal = document.getElementById('detailModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

function copyFilePath() {
    if (selectedRecord && selectedRecord.source_file) {
        copySinglePath(selectedRecord.source_file);
    }
}

function copySinglePath(pathStr) {
    navigator.clipboard.writeText(pathStr).then(() => {
        alert("已複製檔案路徑至剪貼簿！\n" + pathStr);
    }).catch(() => {
        alert("檔案路徑：\n" + pathStr);
    });
}

function exportFilteredCSV() {
    if (filteredData.length === 0) {
        alert("目前沒有可匯出的案件資料！");
        return;
    }

    let csv = "\uFEFF"; // UTF-8 BOM
    csv += "接案日期,案件狀態,縣市,鄉鎮,案件類型,案件名稱,土地地號/門牌,建物坪數(坪),土地坪數(坪),主要參考坪數(坪),單價(萬/坪),總價(萬),經紀人,所屬加盟店,物件編號,原始檔案路徑\n";

    filteredData.forEach(d => {
        const storeDisplay = (d._brandInfo || {}).fullDisplay || d.store_name || '';
        csv += `"${d.date || ''}","${d.status || '銷售'}","${d._county || ''}","${d._town || ''}","${d.category || ''}","${(d.name || '').replace(/"/g, '""')}","${(d.location || '').replace(/"/g, '""')}",${d.build_ping || ''},${d.land_ping || ''},${d.area_ping || ''},${d.unit_price || ''},${d.total_price || ''},"${d.agent || ''}","${storeDisplay.replace(/"/g, '""')}","${d.code || ''}","${(d.source_file || '').replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const filterName = currentStatusFilter === 'all' ? '全部案件' : currentStatusFilter;
    link.setAttribute('download', `不動產案件清單_${filterName}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showLoading() {
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="9" class="loading-cell">
                <i class="fa-solid fa-circle-notch fa-spin"></i> 載入資料庫中...
            </td>
        </tr>
    `;
}

function reloadApp() {
    loadData();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ─── 內部資料安全與防爬保護 (Anti-Scraping & Copy Protection) ───────
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'u')) {
        e.preventDefault();
    }
});
