// ============================================================
// VALO MARKET - Main Application
// ============================================================
// Firebase is initialized in firebase-config.js
// Variables available: auth, db, storage

let currentUser = null;
let isAdmin = false;
let allListings = [];

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 VALO MARKET Started');
    initAuth();
    loadListings();
    updateStats();
    initSecretAdminAccess();
    
    // Check URL for admin access
    if (window.location.hash === '#admin' || window.location.pathname.includes('/admin')) {
        showAdminLogin();
    }
});

// Secret Admin Access - Ctrl+Shift+A or URL /admin or #admin
function initSecretAdminAccess() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            showAdminLogin();
        }
    });
}

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
    // Show chat widget for logged in users
    document.getElementById('chatWidget').style.display = 'block';
    loadUserChatMessages();
}

function updateUIForGuest() {
    document.getElementById('btnAuth').style.display = 'block';
    document.getElementById('userMenu').style.display = 'none';
    document.getElementById('coinsDisplay').style.display = 'none';
    document.getElementById('chatWidget').style.display = 'none';
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
// Email/Password Login & Register
// ============================================================
async function loginWithEmail() {
    const usernameOrEmail = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!usernameOrEmail || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    try {
        // Check if input is email or username
        let email = usernameOrEmail;
        
        // If not email format, search by username
        if (!usernameOrEmail.includes('@')) {
            const userSnap = await db.collection('users').where('username', '==', usernameOrEmail).get();
            if (userSnap.empty) {
                showToast('ไม่พบ Username นี้', 'error');
                return;
            }
            email = userSnap.docs[0].data().email;
        }
        
        // Login with Firebase Auth
        await auth.signInWithEmailAndPassword(email, password);
        closeModal('authModal');
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
        
        // Clear form
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (e) {
        console.error('Login error:', e);
        if (e.code === 'auth/user-not-found') {
            showToast('ไม่พบบัญชีนี้', 'error');
        } else if (e.code === 'auth/wrong-password') {
            showToast('รหัสผ่านไม่ถูกต้อง', 'error');
        } else if (e.code === 'auth/invalid-email') {
            showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        }
    }
}

async function registerWithEmail() {
    const email = document.getElementById('registerEmail').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // Validation
    if (!email || !username || !password || !confirmPassword) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        return;
    }
    
    if (username.length < 3) {
        showToast('Username ต้องมีอย่างน้อย 3 ตัวอักษร', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('รหัสผ่านไม่ตรงกัน', 'error');
        return;
    }
    
    try {
        // Check if username already exists
        const existingUser = await db.collection('users').where('username', '==', username).get();
        if (!existingUser.empty) {
            showToast('Username นี้ถูกใช้แล้ว', 'error');
            return;
        }
        
        // Create user with Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update display name
        await user.updateProfile({ displayName: username });
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            username,
            email,
            avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=ff4655&color=fff',
            coins: 100,
            membership: { tier: 'none' },
            stats: { totalSales: 0, totalPurchases: 0, rating: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeModal('authModal');
        showToast('สมัครสมาชิกสำเร็จ! ได้รับ 100 Coins ฟรี', 'success');
        
        // Clear form
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerUsername').value = '';
        document.getElementById('registerPassword').value = '';
        document.getElementById('registerConfirmPassword').value = '';
    } catch (e) {
        console.error('Register error:', e);
        if (e.code === 'auth/email-already-in-use') {
            showToast('Email นี้ถูกใช้แล้ว', 'error');
        } else if (e.code === 'auth/invalid-email') {
            showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        } else if (e.code === 'auth/weak-password') {
            showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        }
    }
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
let selectedChatUser = null;
let chatUnsubscribe = null;

// Admin Credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin123';

function showAdminLogin() {
    openModal('adminLoginModal');
}

function loginAdmin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    
    if (!username || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        isAdmin = true;
        closeModal('adminLoginModal');
        showPage('admin');
        loadAdminData();
        showToast('เข้าสู่ระบบ Admin สำเร็จ', 'success');
        
        // Clear form
        document.getElementById('adminUsername').value = '';
        document.getElementById('adminPassword').value = '';
    } else {
        showToast('Username หรือ Password ไม่ถูกต้อง', 'error');
    }
}

function logoutAdmin() {
    isAdmin = false;
    if (chatUnsubscribe) chatUnsubscribe();
    showPage('home');
    showToast('ออกจากระบบ Admin', 'success');
}

async function loadAdminData() {
    await loadPendingListings();
    await loadAllListings();
    await loadAdminDeposits();
    await loadAdminWithdrawals();
    await loadAdminUsers();
    await loadAdminChats();
}

// Load Pending Listings with Full Details
async function loadPendingListings() {
    const pendingList = document.getElementById('pendingList');
    try {
        const snap = await db.collection('listings').where('status', '==', 'pending').orderBy('createdAt', 'desc').get();
        document.getElementById('badgePending').textContent = snap.size;
        
        if (snap.empty) {
            pendingList.innerHTML = '<p class="empty">ไม่มีรายการรออนุมัติ</p>';
            return;
        }
        
        pendingList.innerHTML = snap.docs.map(d => {
            const l = d.data();
            const contact = l.contact || {};
            return `
                <div class="pending-item">
                    <div class="pending-item-header">
                        <h3>${l.title || 'ไม่มีชื่อ'}</h3>
                        <div class="actions">
                            <button class="btn-approve" onclick="approveListing('${d.id}')"><i class="fas fa-check"></i> อนุมัติ</button>
                            <button class="btn-reject" onclick="rejectListing('${d.id}')"><i class="fas fa-times"></i> ปฏิเสธ</button>
                        </div>
                    </div>
                    <div class="pending-item-grid">
                        <img src="${l.image || 'https://via.placeholder.com/150'}" alt="">
                        <div class="pending-item-info">
                            <div class="field"><label>Rank</label><span>${getRankName(l.rank)}</span></div>
                            <div class="field"><label>จำนวน Skins</label><span>${l.skins || 0}</span></div>
                            <div class="field"><label>ราคา</label><span>฿${(l.price || 0).toLocaleString()}</span></div>
                            <div class="field"><label>ประเภทขาย</label><span>${l.sellType === 'instant' ? 'ขายทันที' : 'ลงตลาด'}</span></div>
                            <div class="field"><label>ผู้ขาย</label><span>${l.sellerName || 'Unknown'}</span></div>
                            <div class="field"><label>วันที่ส่ง</label><span>${l.createdAt ? new Date(l.createdAt.toDate()).toLocaleDateString('th-TH') : '-'}</span></div>
                        </div>
                    </div>
                    ${l.featuredSkins ? `<div class="field" style="margin-top:10px"><label>Skins เด่น</label><span>${l.featuredSkins}</span></div>` : ''}
                    ${l.highlights ? `<div class="field" style="margin-top:10px"><label>จุดเด่น</label><span>${l.highlights}</span></div>` : ''}
                    <div class="pending-item-contacts">
                        <h4><i class="fas fa-address-book"></i> ข้อมูลติดต่อผู้ขาย</h4>
                        <div class="contact-list">
                            ${contact.facebook ? `<span><i class="fab fa-facebook"></i> ${contact.facebook}</span>` : ''}
                            ${contact.line ? `<span><i class="fab fa-line"></i> ${contact.line}</span>` : ''}
                            ${contact.discord ? `<span><i class="fab fa-discord"></i> ${contact.discord}</span>` : ''}
                            ${contact.phone ? `<span><i class="fas fa-phone"></i> ${contact.phone}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load pending error:', e);
        pendingList.innerHTML = '<p class="empty">เกิดข้อผิดพลาด</p>';
    }
}

// Load All Listings for Admin with Edit/Delete
async function loadAllListings() {
    const container = document.getElementById('adminListingsTable');
    try {
        const snap = await db.collection('listings').orderBy('createdAt', 'desc').get();
        
        if (snap.empty) {
            container.innerHTML = '<p class="empty">ไม่มีประกาศ</p>';
            return;
        }
        
        container.innerHTML = snap.docs.map(d => {
            const l = d.data();
            return `
                <div class="admin-listing-item">
                    <img src="${l.image || 'https://via.placeholder.com/60'}" alt="">
                    <div class="info">
                        <h4>${l.title || 'ไม่มีชื่อ'}</h4>
                        <p>${getRankName(l.rank)} • ${l.skins || 0} Skins • ${l.sellerName || 'Unknown'}</p>
                    </div>
                    <span class="price">฿${(l.price || 0).toLocaleString()}</span>
                    <span class="status ${l.status}">${getStatusName(l.status)}</span>
                    <div class="actions">
                        <button class="btn-view" onclick="viewListingAdmin('${d.id}')"><i class="fas fa-eye"></i></button>
                        <button class="btn-edit" onclick="editListing('${d.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn-delete" onclick="deleteListing('${d.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load listings error:', e);
        container.innerHTML = '<p class="empty">เกิดข้อผิดพลาด</p>';
    }
}

function getStatusName(status) {
    const names = { approved: 'อนุมัติ', pending: 'รออนุมัติ', rejected: 'ปฏิเสธ', sold: 'ขายแล้ว' };
    return names[status] || status;
}

// View Listing Full Details (Admin)
async function viewListingAdmin(id) {
    try {
        const doc = await db.collection('listings').doc(id).get();
        if (!doc.exists) {
            showToast('ไม่พบประกาศ', 'error');
            return;
        }
        const l = doc.data();
        const contact = l.contact || {};
        
        document.getElementById('viewListingContent').innerHTML = `
            <div class="listing-detail-view">
                <div class="images">
                    <img class="main-image" src="${l.image || 'https://via.placeholder.com/400'}" alt="">
                </div>
                <div class="details">
                    <div class="info-section">
                        <h3>${l.title || 'ไม่มีชื่อ'}</h3>
                        <span class="status ${l.status}">${getStatusName(l.status)}</span>
                    </div>
                    <div class="info-section">
                        <div class="info-row"><span class="info-label">Rank</span><span class="info-value">${getRankName(l.rank)}</span></div>
                        <div class="info-row"><span class="info-label">จำนวน Skins</span><span class="info-value">${l.skins || 0}</span></div>
                        <div class="info-row"><span class="info-label">ราคา</span><span class="info-value">฿${(l.price || 0).toLocaleString()}</span></div>
                        <div class="info-row"><span class="info-label">ประเภท</span><span class="info-value">${l.sellType === 'instant' ? 'ขายทันที' : 'ลงตลาด'}</span></div>
                    </div>
                    <div class="info-section">
                        <div class="info-row"><span class="info-label">Skins เด่น</span><span class="info-value">${l.featuredSkins || '-'}</span></div>
                        <div class="info-row"><span class="info-label">จุดเด่น</span><span class="info-value">${l.highlights || '-'}</span></div>
                    </div>
                    <div class="info-section">
                        <h4>ผู้ขาย</h4>
                        <div class="info-row"><span class="info-label">ชื่อ</span><span class="info-value">${l.sellerName || 'Unknown'}</span></div>
                        <div class="info-row"><span class="info-label">ID</span><span class="info-value">${l.sellerId || '-'}</span></div>
                    </div>
                    <div class="info-section">
                        <h4>ช่องทางติดต่อ</h4>
                        ${contact.facebook ? `<div class="contact-item"><i class="fab fa-facebook"></i>${contact.facebook}</div>` : ''}
                        ${contact.line ? `<div class="contact-item"><i class="fab fa-line"></i>${contact.line}</div>` : ''}
                        ${contact.discord ? `<div class="contact-item"><i class="fab fa-discord"></i>${contact.discord}</div>` : ''}
                        ${contact.phone ? `<div class="contact-item"><i class="fas fa-phone"></i>${contact.phone}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn-secondary" onclick="closeModal('viewListingModal')">ปิด</button>
                <button class="btn-primary" onclick="closeModal('viewListingModal');editListing('${id}')"><i class="fas fa-edit"></i> แก้ไข</button>
            </div>
        `;
        openModal('viewListingModal');
    } catch (e) {
        console.error('View error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// Edit Listing
async function editListing(id) {
    try {
        const doc = await db.collection('listings').doc(id).get();
        if (!doc.exists) {
            showToast('ไม่พบประกาศ', 'error');
            return;
        }
        const l = doc.data();
        
        document.getElementById('editListingId').value = id;
        document.getElementById('editTitle').value = l.title || '';
        document.getElementById('editRank').value = l.rank || 'gold';
        document.getElementById('editSkins').value = l.skins || 0;
        document.getElementById('editPrice').value = l.price || 0;
        document.getElementById('editFeaturedSkins').value = l.featuredSkins || '';
        document.getElementById('editHighlights').value = l.highlights || '';
        document.getElementById('editImage').value = l.image || '';
        document.getElementById('editStatus').value = l.status || 'pending';
        
        openModal('editListingModal');
    } catch (e) {
        console.error('Edit error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function saveEditListing(e) {
    e.preventDefault();
    const id = document.getElementById('editListingId').value;
    
    const updates = {
        title: document.getElementById('editTitle').value,
        rank: document.getElementById('editRank').value,
        skins: parseInt(document.getElementById('editSkins').value) || 0,
        price: parseInt(document.getElementById('editPrice').value) || 0,
        featuredSkins: document.getElementById('editFeaturedSkins').value,
        highlights: document.getElementById('editHighlights').value,
        image: document.getElementById('editImage').value,
        status: document.getElementById('editStatus').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('listings').doc(id).update(updates);
        showToast('บันทึกสำเร็จ', 'success');
        closeModal('editListingModal');
        loadAllListings();
        loadListings(); // Refresh marketplace
    } catch (e) {
        console.error('Save error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function deleteListing(id) {
    if (!confirm('ต้องการลบประกาศนี้?')) return;
    try {
        await db.collection('listings').doc(id).delete();
        showToast('ลบสำเร็จ', 'success');
        loadAllListings();
        loadListings();
    } catch (e) {
        console.error('Delete error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function approveListing(id) {
    try {
        await db.collection('listings').doc(id).update({ 
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('อนุมัติแล้ว', 'success');
        loadPendingListings();
        loadAllListings();
        loadListings();
    } catch (e) {
        console.error('Approve error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function rejectListing(id) {
    const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ):');
    try {
        await db.collection('listings').doc(id).update({ 
            status: 'rejected',
            rejectReason: reason || '',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('ปฏิเสธแล้ว', 'success');
        loadPendingListings();
        loadAllListings();
    } catch (e) {
        console.error('Reject error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function loadAdminDeposits() {
    try {
        const snap = await db.collection('deposits').where('status', '==', 'pending').get();
        document.getElementById('badgeDeposits').textContent = snap.size;
        document.getElementById('depositsList').innerHTML = snap.empty 
            ? '<p class="empty">ไม่มีรายการ</p>'
            : snap.docs.map(d => {
                const dep = d.data();
                return `<div class="admin-item"><div><strong>฿${dep.amount}</strong><br><small>${dep.method} - ${dep.userId}</small></div>
                <div><button class="btn-approve" onclick="approveDeposit('${d.id}',${dep.amount},'${dep.userId}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
    } catch (e) {
        document.getElementById('depositsList').innerHTML = '<p class="empty">Demo Mode</p>';
    }
}

async function loadAdminWithdrawals() {
    try {
        const snap = await db.collection('withdrawals').where('status', '==', 'pending').get();
        document.getElementById('badgeWithdrawals').textContent = snap.size;
        document.getElementById('withdrawalsList').innerHTML = snap.empty 
            ? '<p class="empty">ไม่มีรายการ</p>'
            : snap.docs.map(d => {
                const w = d.data();
                return `<div class="admin-item"><div><strong>฿${w.amount}</strong><br><small>${w.method} - ${w.account}</small></div>
                <div><button class="btn-approve" onclick="approveWithdraw('${d.id}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
    } catch (e) {
        document.getElementById('withdrawalsList').innerHTML = '<p class="empty">Demo Mode</p>';
    }
}

async function loadAdminUsers() {
    try {
        const snap = await db.collection('users').limit(50).get();
        document.getElementById('usersTable').innerHTML = snap.docs.map(d => {
            const u = d.data();
            return `<div class="admin-item"><div><strong>${u.username}</strong><br><small>${u.email || u.phone || '-'}</small></div><div>${u.coins || 0} Coins</div></div>`;
        }).join('') || '<p class="empty">ไม่มีผู้ใช้</p>';
    } catch (e) {
        document.getElementById('usersTable').innerHTML = '<p>Demo Mode</p>';
    }
}

async function approveDeposit(id, amount, userId) {
    try {
        await db.collection('deposits').doc(id).update({ status: 'approved' });
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({ coins: (userDoc.data().coins || 0) + amount });
        }
        showToast('อนุมัติการเติมเงินแล้ว', 'success');
        loadAdminDeposits();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function approveWithdraw(id) {
    try {
        await db.collection('withdrawals').doc(id).update({ status: 'approved' });
        showToast('อนุมัติการถอนเงินแล้ว', 'success');
        loadAdminWithdrawals();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function switchAdminTab(tab, el) {
    document.querySelectorAll('.admin-sidebar .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('admin-' + tab).classList.add('active');
    
    if (tab === 'chats') loadAdminChats();
}

function searchUsers(q) {
    // Simple filter
    const items = document.querySelectorAll('#usersTable .admin-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q.toLowerCase()) ? 'flex' : 'none';
    });
}

// ============================================================
// Chat System
// ============================================================

// User Chat Functions
function toggleChat() {
    const box = document.getElementById('chatBox');
    box.classList.toggle('active');
    if (box.classList.contains('active')) {
        loadUserChatMessages();
        markMessagesAsRead();
    }
}

async function loadUserChatMessages() {
    if (!currentUser) return;
    const container = document.getElementById('userChatMessages');
    
    try {
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.id)
            .orderBy('createdAt', 'asc')
            .limit(50)
            .get();
        
        container.innerHTML = snap.docs.map(d => {
            const m = d.data();
            const isUser = m.senderId === currentUser.id;
            return `<div class="chat-message ${isUser ? 'user' : 'admin'}">
                ${m.message}
                <span class="time">${formatTime(m.createdAt)}</span>
            </div>`;
        }).join('') || '<p style="text-align:center;color:var(--text-muted)">เริ่มแชทกับแอดมิน</p>';
        
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.log('Chat load error:', e);
    }
}

async function sendUserMessage() {
    if (!currentUser) return;
    const input = document.getElementById('userMessageInput');
    const message = input.value.trim();
    if (!message) return;
    
    try {
        await db.collection('chats').add({
            message,
            senderId: currentUser.id,
            senderName: currentUser.username,
            senderAvatar: currentUser.avatar,
            participants: [currentUser.id, 'admin'],
            isFromAdmin: false,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        loadUserChatMessages();
    } catch (e) {
        console.error('Send error:', e);
        showToast('ส่งข้อความไม่สำเร็จ', 'error');
    }
}

async function markMessagesAsRead() {
    if (!currentUser) return;
    try {
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.id)
            .where('isFromAdmin', '==', true)
            .where('read', '==', false)
            .get();
        
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
        
        document.getElementById('chatUnread').style.display = 'none';
    } catch (e) {
        console.log('Mark read error:', e);
    }
}

// Admin Chat Functions
async function loadAdminChats() {
    const container = document.getElementById('chatUsersList');
    
    try {
        // Get unique users who have chatted
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', 'admin')
            .orderBy('createdAt', 'desc')
            .get();
        
        // Group by user
        const userChats = {};
        snap.docs.forEach(d => {
            const m = d.data();
            const oderId = m.senderId === 'admin' ? m.participants.find(p => p !== 'admin') : m.senderId;
            if (!userChats[oderId]) {
                userChats[oderId] = {
                    oderId,
                    name: m.senderName,
                    avatar: m.senderAvatar || 'https://via.placeholder.com/40',
                    lastMessage: m.message,
                    unread: !m.read && m.isFromAdmin === false ? 1 : 0
                };
            } else if (!m.read && m.isFromAdmin === false) {
                userChats[oderId].unread++;
            }
        });
        
        const users = Object.values(userChats);
        document.getElementById('badgeChats').textContent = users.reduce((sum, u) => sum + u.unread, 0);
        
        container.innerHTML = users.length === 0 
            ? '<p class="empty" style="padding:20px">ไม่มีแชท</p>'
            : users.map(u => `
                <div class="chat-user-item ${selectedChatUser === u.oderId ? 'active' : ''}" onclick="selectChatUser('${u.oderId}')">
                    <img src="${u.avatar}" alt="">
                    <div class="info">
                        <div class="name">${u.name || 'Unknown'}</div>
                        <div class="preview">${u.lastMessage || ''}</div>
                    </div>
                    ${u.unread > 0 ? `<span class="unread-badge">${u.unread}</span>` : ''}
                </div>
            `).join('');
    } catch (e) {
        console.error('Load chats error:', e);
        container.innerHTML = '<p class="empty" style="padding:20px">Demo Mode</p>';
    }
}

async function selectChatUser(oderId) {
    selectedChatUser = oderId;
    document.querySelectorAll('.chat-user-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    document.getElementById('chatHeader').innerHTML = `<span>แชทกับ ${event.currentTarget.querySelector('.name').textContent}</span>`;
    document.getElementById('adminChatInput').style.display = 'flex';
    
    await loadAdminChatMessages(oderId);
    await markAdminMessagesAsRead(oderId);
}

async function loadAdminChatMessages(oderId) {
    const container = document.getElementById('adminChatMessages');
    
    try {
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', oderId)
            .orderBy('createdAt', 'asc')
            .get();
        
        container.innerHTML = snap.docs.map(d => {
            const m = d.data();
            const isAdmin = m.isFromAdmin;
            return `<div class="chat-message ${isAdmin ? 'user' : 'admin'}">
                ${m.message}
                <span class="time">${formatTime(m.createdAt)}</span>
            </div>`;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('Load messages error:', e);
    }
}

async function markAdminMessagesAsRead(oderId) {
    try {
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', oderId)
            .where('isFromAdmin', '==', false)
            .where('read', '==', false)
            .get();
        
        const batch = db.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
        
        loadAdminChats();
    } catch (e) {
        console.log('Mark read error:', e);
    }
}

async function sendAdminMessage() {
    if (!selectedChatUser) return;
    const input = document.getElementById('adminMessageInput');
    const message = input.value.trim();
    if (!message) return;
    
    try {
        await db.collection('chats').add({
            message,
            senderId: 'admin',
            senderName: 'Admin',
            participants: [selectedChatUser, 'admin'],
            isFromAdmin: true,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        loadAdminChatMessages(selectedChatUser);
    } catch (e) {
        console.error('Send error:', e);
        showToast('ส่งข้อความไม่สำเร็จ', 'error');
    }
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
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
