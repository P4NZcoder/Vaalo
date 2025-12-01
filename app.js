// ============================================================
// VALO MARKET - Main Application
// ============================================================
// Firebase is initialized in firebase-config.js
// Variables available: auth, db, storage

let currentUser = null;
let isAdmin = false;
let allListings = [];
let otpTimers = {};
let generatedOTP = {};

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 VALO MARKET Started');
    initAuth();
    loadListings();
    updateStats();
});

function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await loadUserData(user);
        } else {
            currentUser = null;
            updateUIForGuest();
        }
    });
}

async function loadUserData(firebaseUser) {
    try {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists) {
            currentUser = { id: firebaseUser.uid, ...userDoc.data() };
        } else {
            const newUser = {
                username: firebaseUser.displayName || 'User' + Date.now().toString().slice(-4),
                email: firebaseUser.email || '',
                phone: '',
                avatar: firebaseUser.photoURL || 'https://ui-avatars.com/api/?name=User&background=ff4655&color=fff',
                coins: 100,
                membership: { tier: 'none' },
                stats: { totalSales: 0, totalPurchases: 0, rating: 0 },
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(firebaseUser.uid).set(newUser);
            currentUser = { id: firebaseUser.uid, ...newUser };
            showToast('ยินดีต้อนรับ! ได้รับ 100 Coins ฟรี', 'success');
        }
        updateUIForUser();
    } catch (e) {
        console.error('Load user error:', e);
    }
}

function updateUIForUser() {
    document.getElementById('btnAuth').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('coinsDisplay').style.display = 'flex';
    document.getElementById('userName').textContent = currentUser?.username || 'User';
    document.getElementById('userCoins').textContent = (currentUser?.coins || 0).toLocaleString();
    if (currentUser?.avatar) document.getElementById('userAvatar').src = currentUser.avatar;
}

function updateUIForGuest() {
    document.getElementById('btnAuth').style.display = 'block';
    document.getElementById('userMenu').style.display = 'none';
    document.getElementById('coinsDisplay').style.display = 'none';
}

// ============================================================
// Google Login
// ============================================================
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        closeModal('authModal');
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
    } catch (e) {
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

// ============================================================
// OTP Functions (Demo Mode)
// ============================================================
function sendOTP(type) {
    const phone = document.getElementById(type === 'login' ? 'loginPhone' : 'registerPhone').value;
    if (!phone || phone.length !== 10) {
        showToast('กรุณากรอกเบอร์โทร 10 หลัก', 'error');
        return;
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    generatedOTP[phone] = otp;
    document.getElementById(type + 'OtpGroup').style.display = 'block';
    startOTPTimer(type);
    showToast('OTP: ' + otp + ' (Demo)', 'success');
}

function startOTPTimer(type) {
    let time = 60;
    const el = document.getElementById(type + 'Timer');
    const btn = document.getElementById(type + 'Resend');
    if (otpTimers[type]) clearInterval(otpTimers[type]);
    btn.disabled = true;
    otpTimers[type] = setInterval(() => {
        time--;
        el.textContent = time;
        if (time <= 0) {
            clearInterval(otpTimers[type]);
            btn.disabled = false;
        }
    }, 1000);
}

function handleOtpInput(input, idx, type) {
    if (input.value.length === 1) {
        const inputs = input.parentElement.querySelectorAll('input');
        if (idx < 5) inputs[idx + 1].focus();
    }
}

async function verifyOTP(type) {
    const phone = document.getElementById(type === 'login' ? 'loginPhone' : 'registerPhone').value;
    const inputs = document.querySelectorAll('#' + type + 'OtpGroup .otp-inputs input');
    const otp = Array.from(inputs).map(i => i.value).join('');
    
    if (otp !== generatedOTP[phone]) {
        showToast('OTP ไม่ถูกต้อง', 'error');
        return;
    }
    
    if (type === 'login') {
        const snap = await db.collection('users').where('phone', '==', phone).get();
        if (snap.empty) {
            showToast('ไม่พบบัญชี กรุณาสมัครสมาชิก', 'error');
            return;
        }
        currentUser = { id: snap.docs[0].id, ...snap.docs[0].data() };
    } else {
        const username = document.getElementById('registerUsername').value;
        const userType = document.querySelector('input[name="userType"]:checked')?.value || 'both';
        if (!username) {
            showToast('กรุณากรอกชื่อผู้ใช้', 'error');
            return;
        }
        const exists = await db.collection('users').where('phone', '==', phone).get();
        if (!exists.empty) {
            showToast('เบอร์นี้ลงทะเบียนแล้ว', 'error');
            return;
        }
        const newUser = {
            username, phone, email: '', coins: 100, userType,
            avatar: 'https://ui-avatars.com/api/?name=' + username + '&background=ff4655&color=fff',
            membership: { tier: 'none' },
            stats: { totalSales: 0, totalPurchases: 0, rating: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        const ref = await db.collection('users').add(newUser);
        currentUser = { id: ref.id, ...newUser };
        showToast('สมัครสำเร็จ! ได้รับ 100 Coins', 'success');
    }
    updateUIForUser();
    closeModal('authModal');
    showToast('เข้าสู่ระบบสำเร็จ!', 'success');
}

function logout() {
    auth.signOut();
    currentUser = null;
    isAdmin = false;
    updateUIForGuest();
    showPage('home');
    showToast('ออกจากระบบแล้ว', 'success');
}

// ============================================================
// Listings
// ============================================================
async function loadListings() {
    try {
        const snap = await db.collection('listings').where('status', '==', 'approved').orderBy('createdAt', 'desc').get();
        allListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.log('Loading sample listings');
        allListings = getSampleListings();
    }
    if (allListings.length === 0) allListings = getSampleListings();
    renderListings(allListings);
}

function getSampleListings() {
    return [
        { id: '1', title: 'Radiant 85 Skins', rank: 'radiant', skins: 85, price: 12500, featuredSkins: 'Elderflame Vandal, Champions Phantom', status: 'approved', sellerId: 'sample', sellerName: 'ProGamer', contact: { line: 'progamer99' }, image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400' },
        { id: '2', title: 'Immortal 50 Skins', rank: 'immortal', skins: 50, price: 8900, featuredSkins: 'Reaver Vandal, Glitchpop Phantom', status: 'approved', sellerId: 'sample', sellerName: 'ValoKing', contact: { discord: 'ValoKing#1234' }, image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400' },
        { id: '3', title: 'Diamond 30 Skins', rank: 'diamond', skins: 30, price: 3500, featuredSkins: 'Prime Vandal', status: 'approved', sellerId: 'sample', sellerName: 'SkinLover', contact: { facebook: 'SkinLover' }, image: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400' },
        { id: '4', title: 'Ascendant 45 Skins', rank: 'ascendant', skins: 45, price: 5500, featuredSkins: 'Oni Phantom, Singularity Sheriff', status: 'approved', sellerId: 'sample', sellerName: 'RankMaster', contact: { line: 'rankmaster' }, image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400' },
        { id: '5', title: 'Platinum 15 Skins', rank: 'platinum', skins: 15, price: 1800, featuredSkins: 'Recon Phantom', status: 'approved', sellerId: 'sample', sellerName: 'NewPlayer', contact: { discord: 'NewPlayer#5555' }, image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0b?w=400' },
        { id: '6', title: 'Gold 5 Skins', rank: 'gold', skins: 5, price: 800, featuredSkins: 'Prime Classic', status: 'approved', sellerId: 'sample', sellerName: 'Starter', contact: { phone: '0891234567' }, image: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=400' }
    ];
}

function renderListings(listings) {
    const grid = document.getElementById('listingsGrid');
    if (!grid) return;
    if (listings.length === 0) {
        grid.innerHTML = '<p class="empty">ไม่พบประกาศ</p>';
        return;
    }
    grid.innerHTML = listings.map(l => `
        <div class="listing-card" onclick="viewListing('${l.id}')">
            <div class="listing-image"><img src="${l.image || 'https://via.placeholder.com/300x200'}" alt="${l.title}"></div>
            <div class="listing-badge ${l.rank}">${getRankName(l.rank)}</div>
            <div class="listing-info">
                <h3>${l.title}</h3>
                <p class="skins"><i class="fas fa-palette"></i> ${l.skins} Skins</p>
                <p class="featured">${l.featuredSkins || ''}</p>
                <div class="listing-footer">
                    <span class="price">฿${l.price.toLocaleString()}</span>
                    <button class="btn-buy" onclick="event.stopPropagation();showPurchaseModal('${l.id}')"><i class="fas fa-shopping-cart"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

function getRankName(rank) {
    const names = { radiant: 'Radiant', immortal: 'Immortal', ascendant: 'Ascendant', diamond: 'Diamond', platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', iron: 'Iron' };
    return names[rank] || rank;
}

function filterListings() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const price = document.getElementById('filterPrice')?.value || '';
    const rank = document.getElementById('filterRank')?.value || '';
    const skins = document.getElementById('filterSkins')?.value || '';
    
    let filtered = allListings.filter(l => {
        if (search && !l.title.toLowerCase().includes(search) && !(l.featuredSkins || '').toLowerCase().includes(search)) return false;
        if (rank && l.rank !== rank) return false;
        if (price) {
            const [min, max] = price.split('-').map(Number);
            if (l.price < min || l.price > max) return false;
        }
        if (skins) {
            const [min, max] = skins.split('-').map(Number);
            if (l.skins < min || l.skins > max) return false;
        }
        return true;
    });
    renderListings(filtered);
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterPrice').value = '';
    document.getElementById('filterRank').value = '';
    document.getElementById('filterSkins').value = '';
    renderListings(allListings);
}

function viewListing(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    
    document.getElementById('listingDetailContent').innerHTML = `
        <button class="back-btn" onclick="showPage('marketplace')"><i class="fas fa-arrow-left"></i> กลับ</button>
        <div class="detail-grid">
            <div class="detail-image"><img src="${listing.image || 'https://via.placeholder.com/500'}" alt="${listing.title}"></div>
            <div class="detail-info">
                <span class="rank-badge ${listing.rank}">${getRankName(listing.rank)}</span>
                <h1>${listing.title}</h1>
                <p class="skins-count"><i class="fas fa-palette"></i> ${listing.skins} Skins</p>
                <p class="featured-skins">${listing.featuredSkins || '-'}</p>
                <p class="highlights">${listing.highlights || ''}</p>
                <div class="price-box"><span class="price">฿${listing.price.toLocaleString()}</span></div>
                <button class="btn-primary btn-large" onclick="showPurchaseModal('${listing.id}')"><i class="fas fa-shopping-cart"></i> ซื้อเลย</button>
                <div class="seller-info"><p><i class="fas fa-user"></i> ผู้ขาย: ${listing.sellerName || 'Unknown'}</p></div>
            </div>
        </div>
    `;
    showPage('listing-detail');
}

// ============================================================
// Sell Listing
// ============================================================
function selectSellOption(type, el) {
    document.querySelectorAll('.sell-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('sellType').value = type;
}

async function submitListing(e) {
    e.preventDefault();
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    
    const rank = document.getElementById('listingRank').value;
    const skins = parseInt(document.getElementById('listingSkins').value);
    const price = parseInt(document.getElementById('listingPrice').value);
    const featuredSkins = document.getElementById('listingFeaturedSkins').value;
    const highlights = document.getElementById('listingHighlights').value;
    const sellType = document.getElementById('sellType').value;
    
    const contact = {
        facebook: document.getElementById('contactFacebook').value,
        line: document.getElementById('contactLine').value,
        discord: document.getElementById('contactDiscord').value,
        phone: document.getElementById('contactPhoneSell').value
    };
    
    if (!contact.facebook && !contact.line && !contact.discord && !contact.phone) {
        showToast('กรุณากรอกช่องทางติดต่ออย่างน้อย 1 ช่อง', 'error');
        return;
    }
    
    const listing = {
        title: `${getRankName(rank)} ${skins} Skins`,
        rank, skins, price, featuredSkins, highlights, contact, sellType,
        sellerId: currentUser.id,
        sellerName: currentUser.username,
        status: 'pending',
        image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('listings').add(listing);
        showToast('ส่งประกาศแล้ว รอแอดมินอนุมัติ', 'success');
        document.getElementById('sellForm').reset();
        showPage('dashboard');
    } catch (e) {
        console.error(e);
        showToast('ส่งสำเร็จ! (Demo Mode)', 'success');
        showPage('marketplace');
    }
}

function previewImages(e) {
    const files = e.target.files;
    const preview = document.getElementById('imagePreviews');
    const placeholder = document.getElementById('uploadPlaceholder');
    preview.innerHTML = '';
    if (files.length > 0) {
        placeholder.style.display = 'none';
        Array.from(files).slice(0, 5).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.innerHTML += `<div class="preview-item"><img src="${ev.target.result}"></div>`;
            };
            reader.readAsDataURL(file);
        });
    } else {
        placeholder.style.display = 'block';
    }
}

// ============================================================
// Purchase
// ============================================================
function showPurchaseModal(id) {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    
    document.getElementById('purchaseContent').innerHTML = `
        <button class="close-btn" onclick="closeModal('purchaseModal')">&times;</button>
        <h2><i class="fas fa-shopping-cart"></i> ยืนยันการซื้อ</h2>
        <div class="purchase-item">
            <img src="${listing.image || 'https://via.placeholder.com/100'}" alt="">
            <div><h3>${listing.title}</h3><p>${listing.skins} Skins</p></div>
        </div>
        <div class="purchase-summary">
            <div class="row"><span>ราคาไอดี</span><span>฿${listing.price.toLocaleString()}</span></div>
            <div class="row"><span>ประกันไอดี</span>
                <select id="insuranceSelect" onchange="updatePurchaseTotal(${listing.price})">
                    <option value="0">ไม่ต้องการ (฿0)</option>
                    <option value="50">3 วัน (฿50)</option>
                    <option value="100">7 วัน (฿100)</option>
                    <option value="300">30 วัน (฿300)</option>
                </select>
            </div>
            <hr>
            <div class="row total"><span>รวม</span><span id="purchaseTotal">฿${listing.price.toLocaleString()}</span></div>
            <div class="row balance"><span>Coins ของคุณ</span><span>${currentUser.coins.toLocaleString()} Coins</span></div>
        </div>
        <button class="btn-primary" onclick="confirmPurchase('${listing.id}')"><i class="fas fa-check"></i> ยืนยันซื้อ</button>
    `;
    openModal('purchaseModal');
}

function updatePurchaseTotal(price) {
    const insurance = parseInt(document.getElementById('insuranceSelect').value) || 0;
    document.getElementById('purchaseTotal').textContent = '฿' + (price + insurance).toLocaleString();
}

async function confirmPurchase(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    
    const insurance = parseInt(document.getElementById('insuranceSelect')?.value) || 0;
    const total = listing.price + insurance;
    
    if (currentUser.coins < total) {
        showToast('Coins ไม่เพียงพอ', 'error');
        closeModal('purchaseModal');
        showDepositModal();
        return;
    }
    
    try {
        // Deduct coins
        currentUser.coins -= total;
        await db.collection('users').doc(currentUser.id).update({ coins: currentUser.coins });
        
        // Record purchase
        await db.collection('purchases').add({
            listingId: listing.id,
            buyerId: currentUser.id,
            sellerId: listing.sellerId,
            price: listing.price,
            insurance, total,
            status: 'completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        updateUIForUser();
    } catch (e) {
        console.log('Demo purchase');
        currentUser.coins -= total;
    }
    
    closeModal('purchaseModal');
    showContactInfo(listing);
    showToast('ซื้อสำเร็จ!', 'success');
}

function showContactInfo(listing) {
    const c = listing.contact || {};
    let html = '';
    if (c.facebook) html += `<p><i class="fab fa-facebook"></i> ${c.facebook}</p>`;
    if (c.line) html += `<p><i class="fab fa-line"></i> ${c.line}</p>`;
    if (c.discord) html += `<p><i class="fab fa-discord"></i> ${c.discord}</p>`;
    if (c.phone) html += `<p><i class="fas fa-phone"></i> ${c.phone}</p>`;
    document.getElementById('sellerContactDetails').innerHTML = html || '<p>ไม่พบข้อมูล</p>';
    openModal('contactInfoModal');
}

// ============================================================
// Deposit & Withdraw
// ============================================================
function showDepositModal() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    openModal('depositModal');
}

function selectDepositAmount(amount, el) {
    document.querySelectorAll('.amount-btns button').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('depositAmount').value = amount;
}

function processDeposit() {
    const amount = parseInt(document.getElementById('depositAmount').value);
    if (amount < 50) {
        showToast('ขั้นต่ำ 50 บาท', 'error');
        return;
    }
    const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'promptpay';
    document.getElementById('paymentAmountDisplay').textContent = '฿' + amount.toLocaleString();
    document.getElementById('paymentMethodDisplay').textContent = method === 'promptpay' ? 'พร้อมเพย์' : method === 'truewallet' ? 'TrueMoney' : 'โอนธนาคาร';
    closeModal('depositModal');
    openModal('paymentQRModal');
}

function previewSlip(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('slipPreview').innerHTML = `<img src="${ev.target.result}" style="max-width:200px">`;
        };
        reader.readAsDataURL(file);
    }
}

async function submitPaymentSlip() {
    const amount = parseInt(document.getElementById('depositAmount').value);
    try {
        await db.collection('deposits').add({
            userId: currentUser.id,
            amount,
            method: document.querySelector('input[name="paymentMethod"]:checked')?.value,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.log('Demo deposit'); }
    
    // Demo: Add coins immediately
    currentUser.coins += amount;
    try {
        await db.collection('users').doc(currentUser.id).update({ coins: currentUser.coins });
    } catch (e) {}
    updateUIForUser();
    closeModal('paymentQRModal');
    showToast(`เติม ${amount} Coins สำเร็จ! (Demo)`, 'success');
}

function showWithdrawModal() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    document.getElementById('withdrawBalance').textContent = currentUser.coins.toLocaleString();
    openModal('withdrawModal');
}

function toggleBankFields() {
    const method = document.getElementById('withdrawMethod').value;
    const bankFields = document.getElementById('bankFields');
    const label = document.getElementById('accountLabel');
    if (method === 'bank') {
        bankFields.style.display = 'block';
        label.textContent = 'เลขบัญชี';
    } else {
        bankFields.style.display = 'none';
        label.textContent = method === 'promptpay' ? 'เบอร์พร้อมเพย์' : 'เบอร์ TrueMoney';
    }
}

async function processWithdraw() {
    const amount = parseInt(document.getElementById('withdrawAmount').value);
    if (!amount || amount < 100) {
        showToast('ขั้นต่ำ 100 Coins', 'error');
        return;
    }
    if (amount > currentUser.coins) {
        showToast('Coins ไม่เพียงพอ', 'error');
        return;
    }
    
    currentUser.coins -= amount;
    try {
        await db.collection('users').doc(currentUser.id).update({ coins: currentUser.coins });
        await db.collection('withdrawals').add({
            userId: currentUser.id,
            amount,
            method: document.getElementById('withdrawMethod').value,
            account: document.getElementById('withdrawAccount').value,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.log('Demo withdraw'); }
    
    updateUIForUser();
    closeModal('withdrawModal');
    showToast('ส่งคำขอถอนเงินแล้ว รอดำเนินการ', 'success');
}

// ============================================================
// Membership
// ============================================================
async function buyMembership(tier, price) {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    if (currentUser.coins < price) {
        showToast('Coins ไม่เพียงพอ', 'error');
        showDepositModal();
        return;
    }
    
    currentUser.coins -= price;
    currentUser.membership = { tier, expiresAt: new Date(Date.now() + 30*24*60*60*1000) };
    
    try {
        await db.collection('users').doc(currentUser.id).update({
            coins: currentUser.coins,
            membership: currentUser.membership
        });
    } catch (e) {}
    
    updateUIForUser();
    showToast(`สมัครสมาชิก ${tier.toUpperCase()} สำเร็จ!`, 'success');
}

// ============================================================
// Dashboard
// ============================================================
function loadDashboardData() {
    if (!currentUser) return;
    document.getElementById('dashCoins').textContent = (currentUser.coins || 0).toLocaleString();
    document.getElementById('dashSales').textContent = currentUser.stats?.totalSales || 0;
    document.getElementById('dashPending').textContent = 0;
    document.getElementById('dashRating').textContent = currentUser.stats?.rating || '-';
}

function switchDashboardTab(tab, btn) {
    document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
}

// ============================================================
// Admin
// ============================================================
function showAdminLogin() {
    openModal('adminLoginModal');
}

function loginAdmin() {
    const pw = document.getElementById('adminPassword').value;
    if (pw === 'admin123') {
        isAdmin = true;
        closeModal('adminLoginModal');
        showPage('admin');
        loadAdminData();
        showToast('เข้าสู่ระบบ Admin สำเร็จ', 'success');
    } else {
        showToast('รหัสผ่านไม่ถูกต้อง', 'error');
    }
}

function logoutAdmin() {
    isAdmin = false;
    showPage('home');
    showToast('ออกจากระบบ Admin', 'success');
}

async function loadAdminData() {
    // Load pending listings
    try {
        const pendingSnap = await db.collection('listings').where('status', '==', 'pending').get();
        const pendingList = document.getElementById('pendingList');
        document.getElementById('badgePending').textContent = pendingSnap.size;
        
        if (pendingSnap.empty) {
            pendingList.innerHTML = '<p class="empty">ไม่มีรายการ</p>';
        } else {
            pendingList.innerHTML = pendingSnap.docs.map(d => {
                const l = d.data();
                return `<div class="admin-item">
                    <div><strong>${l.title}</strong><br><small>${l.rank} - ${l.skins} Skins - ฿${l.price}</small></div>
                    <div><button class="btn-approve" onclick="approveListing('${d.id}')"><i class="fas fa-check"></i></button>
                    <button class="btn-reject" onclick="rejectListing('${d.id}')"><i class="fas fa-times"></i></button></div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        document.getElementById('pendingList').innerHTML = '<p>Demo Mode</p>';
    }
    
    // Load deposits
    try {
        const depSnap = await db.collection('deposits').where('status', '==', 'pending').get();
        document.getElementById('badgeDeposits').textContent = depSnap.size;
        const depList = document.getElementById('depositsList');
        if (depSnap.empty) {
            depList.innerHTML = '<p class="empty">ไม่มีรายการ</p>';
        } else {
            depList.innerHTML = depSnap.docs.map(d => {
                const dep = d.data();
                return `<div class="admin-item"><div><strong>฿${dep.amount}</strong><br><small>${dep.method}</small></div>
                <div><button class="btn-approve" onclick="approveDeposit('${d.id}',${dep.amount},'${dep.userId}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
        }
    } catch (e) {}
    
    // Load withdrawals
    try {
        const wdSnap = await db.collection('withdrawals').where('status', '==', 'pending').get();
        document.getElementById('badgeWithdrawals').textContent = wdSnap.size;
        const wdList = document.getElementById('withdrawalsList');
        if (wdSnap.empty) {
            wdList.innerHTML = '<p class="empty">ไม่มีรายการ</p>';
        } else {
            wdList.innerHTML = wdSnap.docs.map(d => {
                const w = d.data();
                return `<div class="admin-item"><div><strong>฿${w.amount}</strong><br><small>${w.method} - ${w.account}</small></div>
                <div><button class="btn-approve" onclick="approveWithdraw('${d.id}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
        }
    } catch (e) {}
    
    // Load users
    try {
        const usersSnap = await db.collection('users').limit(50).get();
        document.getElementById('usersTable').innerHTML = usersSnap.docs.map(d => {
            const u = d.data();
            return `<div class="admin-item"><div><strong>${u.username}</strong><br><small>${u.email || u.phone || '-'}</small></div><div>${u.coins || 0} Coins</div></div>`;
        }).join('') || '<p class="empty">ไม่มีผู้ใช้</p>';
    } catch (e) {
        document.getElementById('usersTable').innerHTML = '<p>Demo Mode</p>';
    }
}

async function approveListing(id) {
    try {
        await db.collection('listings').doc(id).update({ status: 'approved' });
    } catch (e) {}
    showToast('อนุมัติแล้ว', 'success');
    loadAdminData();
    loadListings();
}

async function rejectListing(id) {
    try {
        await db.collection('listings').doc(id).update({ status: 'rejected' });
    } catch (e) {}
    showToast('ปฏิเสธแล้ว', 'success');
    loadAdminData();
}

async function approveDeposit(id, amount, userId) {
    try {
        await db.collection('deposits').doc(id).update({ status: 'approved' });
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({ coins: (userDoc.data().coins || 0) + amount });
        }
    } catch (e) {}
    showToast('อนุมัติการเติมเงินแล้ว', 'success');
    loadAdminData();
}

async function approveWithdraw(id) {
    try {
        await db.collection('withdrawals').doc(id).update({ status: 'approved' });
    } catch (e) {}
    showToast('อนุมัติการถอนเงินแล้ว', 'success');
    loadAdminData();
}

function switchAdminTab(tab, el) {
    document.querySelectorAll('.admin-sidebar .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('admin-' + tab).classList.add('active');
}

function searchUsers(q) {
    // Simple search - demo
}

// ============================================================
// UI Functions
// ============================================================
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    document.querySelector(`.nav-link[onclick*="${page}"]`)?.classList.add('active');
    window.scrollTo(0, 0);
    
    if (page === 'dashboard' && currentUser) loadDashboardData();
    if (page === 'admin' && isAdmin) loadAdminData();
}

function showAuthModal() {
    openModal('authModal');
}

function switchAuthTab(tab, btn) {
    document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab + 'Form').classList.add('active');
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.remove('show');
    }
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function updateStats() {
    try {
        const listingsSnap = await db.collection('listings').where('status', '==', 'approved').get();
        const usersSnap = await db.collection('users').get();
        document.getElementById('statSales').textContent = listingsSnap.size;
        document.getElementById('statUsers').textContent = usersSnap.size;
    } catch (e) {
        document.getElementById('statSales').textContent = '1,234';
        document.getElementById('statUsers').textContent = '5,678';
    }
}

console.log('✅ App loaded successfully');
