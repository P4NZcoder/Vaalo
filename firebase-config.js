// ============================================================
// VALO MARKET - Firebase Configuration
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyAGD-1YkbV9-vxIJqx68leqAMfe_Xr1Pq4",
    authDomain: "valorent-9a13c.firebaseapp.com",
    projectId: "valorent-9a13c",
    storageBucket: "valorent-9a13c.firebasestorage.app",
    messagingSenderId: "113631887318",
    appId: "1:113631887318:web:56a851b583bb12ac9eee77",
    measurementId: "G-9N2XSGH69G"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase Services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Auth Settings
auth.languageCode = 'th';

// Firestore Settings (Optional - for better performance)
db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
});

// Enable offline persistence (Optional)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.log('Multiple tabs open, persistence enabled in first tab only');
    } else if (err.code === 'unimplemented') {
        console.log('Browser does not support persistence');
    }
});

// ============================================================
// Firebase Helper Functions
// ============================================================

// Get current user
function getCurrentUser() {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            unsubscribe();
            resolve(user);
        }, reject);
    });
}

// Upload image to Firebase Storage
async function uploadImage(file, path) {
    try {
        const storageRef = storage.ref();
        const fileRef = storageRef.child(path);
        const snapshot = await fileRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();
        return downloadURL;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Delete image from Firebase Storage
async function deleteImage(path) {
    try {
        const storageRef = storage.ref();
        const fileRef = storageRef.child(path);
        await fileRef.delete();
        return true;
    } catch (error) {
        console.error('Delete error:', error);
        throw error;
    }
}

// ============================================================
// Firestore Helper Functions
// ============================================================

// Get document by ID
async function getDoc(collection, docId) {
    const doc = await db.collection(collection).doc(docId).get();
    if (doc.exists) {
        return { id: doc.id, ...doc.data() };
    }
    return null;
}

// Get documents with query
async function getDocs(collection, conditions = [], orderByField = null, orderDirection = 'desc', limitCount = null) {
    let query = db.collection(collection);
    
    conditions.forEach(condition => {
        query = query.where(condition.field, condition.operator, condition.value);
    });
    
    if (orderByField) {
        query = query.orderBy(orderByField, orderDirection);
    }
    
    if (limitCount) {
        query = query.limit(limitCount);
    }
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Add document
async function addDoc(collection, data) {
    const docRef = await db.collection(collection).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
}

// Update document
async function updateDoc(collection, docId, data) {
    await db.collection(collection).doc(docId).update({
        ...data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
}

// Delete document
async function deleteDoc(collection, docId) {
    await db.collection(collection).doc(docId).delete();
    return true;
}

// Increment field value
function incrementValue(value) {
    return firebase.firestore.FieldValue.increment(value);
}

// Array operations
function arrayUnion(...elements) {
    return firebase.firestore.FieldValue.arrayUnion(...elements);
}

function arrayRemove(...elements) {
    return firebase.firestore.FieldValue.arrayRemove(...elements);
}

// Server timestamp
function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
}

// ============================================================
// Collection References
// ============================================================

const collections = {
    users: 'users',
    listings: 'listings',
    purchases: 'purchases',
    deposits: 'deposits',
    withdrawals: 'withdrawals',
    transactions: 'transactions',
    otps: 'otps',
    reports: 'reports',
    settings: 'settings'
};

// ============================================================
// Realtime Listeners
// ============================================================

// Listen to user changes
function onUserChange(userId, callback) {
    return db.collection('users').doc(userId).onSnapshot(doc => {
        if (doc.exists) {
            callback({ id: doc.id, ...doc.data() });
        }
    });
}

// Listen to listings changes
function onListingsChange(callback, status = 'approved') {
    return db.collection('listings')
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const listings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(listings);
        });
}

// Listen to pending items (for admin)
function onPendingItems(collection, callback) {
    return db.collection(collection)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snapshot => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(items);
        });
}

console.log('🔥 Firebase initialized successfully');
