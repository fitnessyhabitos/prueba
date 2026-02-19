import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App v16.0 (COACH MODE & ADVANCED EDIT)...");

// --- 1. REGISTRO SERVICE WORKER ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ Service Worker OK:', reg.scope))
            .catch(err => console.error('❌ SW Error:', err));
    });
}

const firebaseConfig = {
  apiKey: "AIzaSyDW40Lg6QvBc3zaaA58konqsH3QtDrRmyM",
  authDomain: "fitdatatg.firebaseapp.com",
  projectId: "fitdatatg",
  storageBucket: "fitdatatg.firebasestorage.app",
  messagingSenderId: "1019606805247",
  appId: "1:1019606805247:web:3a3e5c0db061aa62773aca"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

// --- NUEVA INICIALIZACIÓN FIRESTORE (Zero Warnings & Multi-Tab Support) ---
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

// --- VARIABLES GLOBALES ---
const AVAILABLE_DIETS = [
    { name: "Dieta Volumen (3000kcal)", file: "volumen_3000.html" },
    { name: "Dieta Definición (2000kcal)", file: "definicion_2000.html" },
    { name: "Dieta Mantenimiento", file: "mantenimiento.html" },
    { name: "Dieta Anti Inflamatoria", file: "Anti.html" },
    { name: "Ayuno Intermitente", file: "ayuno.html" }
];

let audioCtx = null;
let currentUser = null; 
let userData = null; 
let activeWorkout = null; 
let timerInt = null; 
let durationInt = null;
let wakeLock = null;
let totalRestTime = 60; 
let restEndTime = 0; 
let noteTargetIndex = null;
let communityUnsubscribe = null; 
let currentNoticeId = null; 
let currentNoticeType = null; 
let deferredPrompt = null; 

// Cache & Filtros
let rankFilterTime = 'all';        
let rankFilterGender = 'all';       
let rankFilterCat = 'kg';           
let adminUsersCache = null; 
let editingHistoryId = null; 
let currentHistoryDetails = null; 

// Charts
let chartInstance = null; let progressChart = null; let fatChartInstance = null; let bioChartInstance = null; let measureChartInstance = null; let coachFatChart = null; let coachBioChart = null; let coachMeasureChart = null; let radarChartInstance = null; let coachChart = null; let userRadarChart = null; let coachRadarChart = null;

let selectedUserCoach = null; 
let selectedUserObj = null; 
let editingRoutineId = null; 
let currentPose = 'front'; 
let coachCurrentPose = 'front'; 
let allRoutinesCache = []; 
let currentRoutineSelections = [];
window.currentRoutineSelections = currentRoutineSelections; 
let swapTargetIndex = null; 
let selectedPlanForMassAssign = null; 
let selectedRoutineForMassAssign = null;
let assignMode = 'plan'; 
let noticeTargetUid = null; 

// Variables Infinite Scroll
let exercisesBatchIndex = 0;
let filteredExercisesList = [];
let exercisesObserver = null;
const BATCH_SIZE = 20;

// --- INSTALACIÓN PWA ---
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btnAndroid = document.getElementById('btn-install-android');
  const container = document.getElementById('install-prompt-container');
  if(btnAndroid && container) {
      container.classList.remove('hidden');
      btnAndroid.classList.remove('hidden');
      btnAndroid.onclick = () => {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult) => {
              if (choiceResult.outcome === 'accepted') { container.classList.add('hidden'); }
              deferredPrompt = null;
          });
      };
  }
});

const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);
if (isIos() && !isInStandaloneMode()) {
    const container = document.getElementById('install-prompt-container');
    const iosHint = document.getElementById('ios-install-hint');
    if(container && iosHint) { container.classList.remove('hidden'); iosHint.classList.remove('hidden'); }
}

// --- TELEGRAM UI ---
function injectTelegramUI() {
    const regForm = document.getElementById('register-form');
    const regEmail = document.getElementById('reg-email');
    if (regForm && regEmail && !document.getElementById('reg-telegram')) {
        const input = document.createElement('input');
        input.type = 'text'; input.id = 'reg-telegram'; input.placeholder = 'Usuario Telegram (ej: @juanperez)';
        input.style.marginBottom = '10px';
        regEmail.parentNode.insertBefore(input, regEmail);
    }

    const restInput = document.getElementById('cfg-rest-time');
    const existingUi = document.getElementById('telegram-ui-wrapper');
    if(existingUi) existingUi.remove();

    if (restInput && userData?.allowTelegram) { 
        const wrapper = document.createElement('div');
        wrapper.id = 'telegram-ui-wrapper';
        wrapper.style.cssText = "width: 100%; margin-top: 25px; margin-bottom: 25px; text-align: center; border-top: 1px solid #222; padding-top: 15px;"; 
        const telegramIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:8px;"><path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" fill="white"/></svg>`;
        wrapper.innerHTML = `<label style="display:block; margin-bottom:8px; font-size:0.85rem; color:#aaa; font-weight:bold;">📸 Tu Usuario Telegram (Activo)</label><input type="text" id="cfg-telegram" placeholder="@usuario" value="${userData.telegram || ''}" style="width: 70%; max-width: 250px; margin: 0 auto 15px auto; background: #1a1a1a; border: 1px solid var(--accent-color); color: white; padding: 10px; border-radius: 8px; text-align: center; display:block;"><button onclick="window.contactCoach()" class="btn" style="width: auto; margin: 0 auto; padding: 12px 25px; border-radius: 50px; font-size: 0.85rem; display:flex; align-items:center; justify-content:center;">${telegramIcon} Contactar Coach</button>`;
        restInput.parentElement.insertAdjacentElement('afterend', wrapper);
    }
}

// --- AUTH LISTENER ---
onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    
    if(user) {
        currentUser = user;
        
        // Restauración Inmediata LocalStorage
        const savedW = localStorage.getItem('fit_active_workout');
        if(savedW) { 
            try { 
                activeWorkout = JSON.parse(savedW);
                // Si estamos en Ghost Mode (entrenando cliente), mostrar aviso
                if(activeWorkout.ghostUid) {
                    showToast("⚠️ MODO COACH ACTIVO: Entrenando Cliente");
                }
                startTimerMini();
            } catch(e) { console.error("Error restoring local workout", e); }
        }

        try {
            const snap = await getDoc(doc(db,"users",user.uid));
            if(snap.exists()){
                userData = snap.data();
                checkPhotoVisualReminder();
                initCommunityListener();
                checkPhotoReminder();
                injectTelegramUI();
                checkNotices(); 
                
                if(userData.role === 'admin' || userData.role === 'assistant') { 
                    document.getElementById('top-btn-coach').classList.remove('hidden'); 
                }
                
                if(userData.role !== 'admin' && userData.role !== 'assistant' && !sessionStorage.getItem('notif_dismissed')) {
                    const routinesSnap = await getDocs(query(collection(db, "routines"), where("assignedTo", "array-contains", user.uid)));
                    if(!routinesSnap.empty) document.getElementById('notif-badge').style.display = 'block';
                }

                if(userData.approved){
                    if(loadingScreen) { loadingScreen.style.opacity = '0'; setTimeout(() => loadingScreen.classList.add('hidden'), 300); }
                    document.getElementById('main-header').classList.remove('hidden');
                    loadRoutines();
                    
                    if(activeWorkout) {
                        renderWorkout();
                        switchTab('workout-view');
                        showToast("⚡ Sesión restaurada");
                    } else {
                        switchTab('routines-view');
                    }
                    
                } else { alert("Cuenta en revisión."); signOut(auth); }
            }
        } catch(e) { console.log("Offline or Error:", e); if(loadingScreen) loadingScreen.classList.add('hidden'); }
    } else {
        if(loadingScreen) loadingScreen.classList.add('hidden');
        switchTab('auth-view');
        document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
        injectTelegramUI();
    }
});

function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7); return d.getUTCFullYear() + "_W" + weekNo; }

function initCommunityListener() {
    if (communityUnsubscribe) communityUnsubscribe(); 
    const q = query(collection(db, "workouts"), orderBy("date", "desc"), limit(1));
    communityUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const w = change.doc.data();
                const now = Date.now() / 1000;
                const workoutTime = w.date ? w.date.seconds : 0;
                if (now - workoutTime < 60 && w.uid !== currentUser.uid) { showToast(`🔥 Alguien terminó: ${w.routine}`); }
            }
        });
    });
}

// --- NAVEGACIÓN ---
let scrollPos = 0;
window.openModal = (id) => { scrollPos = window.pageYOffset; document.body.style.top = `-${scrollPos}px`; document.body.classList.add('modal-open'); const m = document.getElementById(id); if(m) m.classList.add('active'); };
window.closeModal = (id) => { const m = document.getElementById(id); if(m) m.classList.remove('active'); document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos); };
const normalizeText = (text) => { if(!text) return ""; return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
window.toggleElement = (id) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); };

window.switchTab = (t) => {
    const bar = document.getElementById('active-workout-bar');
    if(activeWorkout && t !== 'workout-view') {
        if(bar) bar.classList.remove('hidden');
        if(activeWorkout.ghostUid) {
             document.getElementById('bar-timer').style.color = 'var(--warning-color)';
             document.getElementById('bar-timer').innerText += " (COACH)";
        }
    } else {
        if(bar) bar.classList.add('hidden');
    }

    if (t === 'workout-view') {
        if(!activeWorkout) t = 'routines-view';
        else { renderWorkout(); startTimerMini(); }
    }

    document.querySelectorAll('.view-container').forEach(e => e.classList.remove('active'));
    const target = document.getElementById(t);
    if(target) { target.classList.add('active'); window.scrollTo(0,0); }
    
    document.querySelectorAll('.top-nav-item').forEach(n => n.classList.remove('active'));
    if (t === 'routines-view') document.getElementById('top-btn-routines').classList.add('active');
    if (t === 'ranking-view') document.getElementById('top-btn-ranking').classList.add('active');
    if (t === 'profile-view') { document.getElementById('top-btn-profile').classList.add('active'); window.loadProfile(); }
    if (t === 'admin-view' || t === 'coach-detail-view') { document.getElementById('top-btn-coach').classList.add('active'); }
};

// --- AUDIO ---
let lastBeepSecond = -1; 
function initAudioEngine() { if (!audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); } if (audioCtx.state === 'suspended') { audioCtx.resume(); } }
function playTickSound(isFinal = false) { if(!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume(); if (isFinal) { playFinalAlarm(); return; } const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.frequency.value = 1000; osc.type = 'sine'; osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime; osc.start(now); gain.gain.setValueAtTime(0.8, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1); osc.stop(now + 0.1); }
function playFinalAlarm() { if(!audioCtx) return; const now = audioCtx.currentTime; const osc1 = audioCtx.createOscillator(); const osc2 = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination); osc1.type = 'triangle'; osc2.type = 'triangle'; osc1.frequency.setValueAtTime(880, now); osc2.frequency.setValueAtTime(1760, now); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1.0, now + 0.05); gain.gain.setValueAtTime(1.0, now + 0.6); gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0); osc1.start(now); osc2.start(now); osc1.stop(now + 1.0); osc2.stop(now + 1.0); if("vibrate" in navigator) navigator.vibrate([300, 100, 300]); }
document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});
window.testSound = () => { playTickSound(false); setTimeout(() => playFinalAlarm(), 600); };
window.enableNotifications = () => { if (!("Notification" in window)) return alert("Tu dispositivo no soporta notificaciones."); Notification.requestPermission().then((p) => { if (p === "granted") { if("vibrate" in navigator) navigator.vibrate([200]); new Notification("Fit Data", { body: "✅ Notificaciones listas.", icon: "logo.png" }); alert("✅ Vinculado."); } else alert("❌ Permiso denegado."); }); };

window.switchProfileSubTab = (tabName) => {
    document.querySelectorAll('.p-tab-btn').forEach(btn => btn.classList.remove('active'));
    const cProgress = document.getElementById('tab-content-progress'); const cHistory = document.getElementById('tab-content-history'); const cSettings = document.getElementById('tab-content-settings');
    if(cProgress) cProgress.classList.add('hidden'); if(cHistory) cHistory.classList.add('hidden'); if(cSettings) cSettings.classList.add('hidden');
    const btn = document.getElementById(`ptab-btn-${tabName}`); if(btn) btn.classList.add('active');
    const content = document.getElementById(`tab-content-${tabName}`); if(content) content.classList.remove('hidden');
};

window.switchCoachSubTab = (tabName) => {
    const btns = document.querySelectorAll('#coach-detail-view .p-tab-btn'); btns.forEach(btn => btn.classList.remove('active'));
    const cProgress = document.getElementById('ctab-content-progress'); const cHistory = document.getElementById('ctab-content-history'); const cProfile = document.getElementById('ctab-content-profile');
    if(cProgress) cProgress.classList.add('hidden'); if(cHistory) cHistory.classList.add('hidden'); if(cProfile) cProfile.classList.add('hidden');
    const btn = document.getElementById(`ctab-btn-${tabName}`); if(btn) btn.classList.add('active');
    const content = document.getElementById(`ctab-content-${tabName}`); if(content) content.classList.remove('hidden');
};

// --- CHARTS HELPERS ---
function renderFilteredChart(canvasId, instanceVar, dataHistory, typeKey, color, rangeDays = 9999) {
    const ctx = document.getElementById(canvasId); if (!ctx) return null; 
    const existingChart = Chart.getChart(canvasId); if (existingChart) existingChart.destroy(); if (instanceVar) instanceVar.destroy(); 
    const now = Date.now(); const cutoff = now - (rangeDays * 24 * 60 * 60 * 1000);
    const safeData = Array.isArray(dataHistory) ? dataHistory.filter(d => { return d && typeof d === 'object' && d.date && typeof d.date.seconds === 'number'; }) : [];
    const filtered = safeData.filter(d => (d.date.seconds * 1000) > cutoff).sort((a,b) => a.date.seconds - b.date.seconds);
    const labels = filtered.map(d => new Date(d.date.seconds * 1000).toLocaleDateString('es-ES', {day:'2-digit', month:'short'}));
    const values = filtered.map(d => d[typeKey] || 0);
    return new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [{ label: typeKey.toUpperCase(), data: values, borderColor: color, backgroundColor: color + '20', tension: 0.3, fill: true, pointRadius: 4, pointBackgroundColor: '#000', pointBorderColor: color }] }, options: { maintainAspectRatio: false, layout: { padding: { top: 10, bottom: 5, left: 5, right: 10 } }, plugins: { legend: { display: false } }, scales: { x: { display: true, ticks: { color: '#666', maxRotation: 45, minRotation: 0, font: {size: 10} }, grid: { display: false } }, y: { grid: { color: '#333' }, ticks: { color: '#888' } } } } });
}

function injectChartFilter(canvasId, callbackName) {
    const canvas = document.getElementById(canvasId); if(!canvas) return; const parent = canvas.parentElement; if(parent.querySelector('.chart-filter-container')) return;
    const div = document.createElement('div'); div.className = 'chart-filter-container';
    div.innerHTML = `<select class="chart-filter-select" onchange="${callbackName}('${canvasId}', this.value)"><option value="30">1 Mes</option><option value="90">3 Meses</option><option value="180">6 Meses</option><option value="9999" selected>Todo</option></select>`;
    parent.insertBefore(div, canvas);
}
window.updateMeasureChart = (id, range) => { const sourceData = (id === 'coachMeasuresChart') ? selectedUserObj.measureHistory : userData.measureHistory; const instance = (id === 'coachMeasuresChart') ? coachMeasureChart : measureChartInstance; const newInst = renderFilteredMeasureChart(id, instance, sourceData, parseInt(range)); if(id === 'coachMeasuresChart') coachMeasureChart = newInst; else measureChartInstance = newInst; };

function renderFilteredMeasureChart(canvasId, instanceVar, dataHistory, rangeDays) {
    const ctx = document.getElementById(canvasId); if (!ctx) return null;
    const existingChart = Chart.getChart(canvasId); if (existingChart) existingChart.destroy();
    const now = Date.now(); const cutoff = now - (rangeDays * 24 * 60 * 60 * 1000);
    const safeData = Array.isArray(dataHistory) ? dataHistory.filter(d => { return d && typeof d === 'object' && d.date && typeof d.date.seconds === 'number'; }) : [];
    const filtered = safeData.filter(d => (d.date.seconds * 1000) > cutoff).sort((a,b) => a.date.seconds - b.date.seconds);
    const labels = filtered.map(d => new Date(d.date.seconds * 1000).toLocaleDateString('es-ES', {day:'2-digit', month:'short'}));
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}, {k:'thigh', l:'Muslo', c:'#F3FF33'}, {k:'calf', l:'Gemelo', c:'#FF8C00'}, {k:'shoulder', l:'Hombros', c:'#A133FF'}];
    const datasets = parts.map(p => ({ label: p.l, data: filtered.map(h => h[p.k] || 0), borderColor: p.c, tension: 0.3, pointRadius: 2, borderWidth: 2 }));
    return new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { maintainAspectRatio: false, layout: { padding: { top: 10, bottom: 5, left: 5, right: 10 } }, plugins: { legend: { display: true, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } }, scales: { y: { grid: { color: '#333' } }, x: { display: true, ticks: { color: '#666', maxRotation: 45, minRotation: 0, font: {size: 9} }, grid: { display: false } } } } });
}

// --- PERFIL Y BORRADO DE HISTORIAL ---
window.loadProfile = async () => {
    if(!userData) return;
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) { document.getElementById('avatar-text').style.display='none'; document.getElementById('avatar-img').src = userData.photo; document.getElementById('avatar-img').style.display='block'; }
    updatePhotoDisplay(userData);
    
    if(!userData.photo) { const header = document.querySelector('.profile-header'); if(!document.getElementById('photo-nudge')) { const nudge = document.createElement('div'); nudge.id = 'photo-nudge'; nudge.className = 'tip-box'; nudge.style.marginTop = '10px'; nudge.innerHTML = '📸 ¡Sube una foto para que tu Coach te reconozca mejor!'; header.parentNode.insertBefore(nudge, header.nextSibling); } } else { const nudge = document.getElementById('photo-nudge'); if(nudge) nudge.remove(); }
    if(userData.rankingOptIn) { document.getElementById('cfg-ranking').checked = true; document.getElementById('top-btn-ranking').classList.remove('hidden'); } else { document.getElementById('cfg-ranking').checked = false; document.getElementById('top-btn-ranking').classList.add('hidden'); }

    const fixChartContainer = (id) => { const c = document.getElementById(id); if(c && c.parentElement) { c.parentElement.style.height = '250px'; c.parentElement.style.marginBottom = '35px'; } };

    if(userData.showBio) { document.getElementById('user-bio-section').classList.remove('hidden'); if(userData.bioHistory && userData.bioHistory.length > 0) { fixChartContainer('chartBio'); injectChartFilter('chartBio', 'window.updateBioChart'); renderFilteredChart('chartBio', bioChartInstance, userData.bioHistory, 'muscle', '#00ffff', 9999); } } else { document.getElementById('user-bio-section').classList.add('hidden'); }
    if(userData.dietFile) document.getElementById('btn-diet-view').classList.remove('hidden'); else document.getElementById('btn-diet-view').classList.add('hidden');
    if(userData.showSkinfolds) { document.getElementById('user-skinfolds-section').classList.remove('hidden'); if(userData.skinfoldHistory && userData.skinfoldHistory.length > 0) { fixChartContainer('chartFat'); injectChartFilter('chartFat', 'window.updateFatChart'); fatChartInstance = renderFilteredChart('chartFat', fatChartInstance, userData.skinfoldHistory, 'fat', '#ffaa00', 9999); } } else { document.getElementById('user-skinfolds-section').classList.add('hidden'); }
    if(userData.showMeasurements) { document.getElementById('user-measures-section').classList.remove('hidden'); if(userData.measureHistory && userData.measureHistory.length > 0) { fixChartContainer('chartMeasures'); injectChartFilter('chartMeasures', 'window.updateMeasureChart'); measureChartInstance = renderFilteredMeasureChart('chartMeasures', measureChartInstance, userData.measureHistory, 90); } } else { document.getElementById('user-measures-section').classList.add('hidden'); }
    
    const photosCard = document.getElementById('user-photos-card'); if (photosCard) { if (userData.showPhotos !== false) { photosCard.classList.remove('hidden'); } else { photosCard.classList.add('hidden'); } }
    if(userData.restTime) document.getElementById('cfg-rest-time').value = userData.restTime;
    if(userData.telegram) { const tInput = document.getElementById('cfg-telegram'); if(tInput) tInput.value = userData.telegram; }

    document.getElementById('stat-workouts').innerText = userData.stats?.workouts || 0;
    document.getElementById('stat-kg').innerText = userData.stats?.totalKg ? (userData.stats.totalKg/1000).toFixed(1)+'t' : 0;
    document.getElementById('stat-sets').innerText = userData.stats?.totalSets || 0;
    document.getElementById('stat-reps').innerText = userData.stats?.totalReps || 0;
    
    if(userData.weightHistory) { fixChartContainer('weightChart'); injectChartFilter('weightChart', 'window.updateWeightChart'); chartInstance = renderFilteredChart('weightChart', chartInstance, userData.weightHistory, 'weight', '#ff3333', 9999); }

    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    try {
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date).slice(0, 10);
        histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
        workouts.forEach(d => {
            let dateStr = '-', timeStr = '';
            if(d.date) { 
                const dateObj = d.date.toDate ? d.date.toDate() : new Date(d.date.seconds*1000); 
                dateStr = dateObj.toLocaleDateString('es-ES', {day:'2-digit', month:'short'}); 
                timeStr = d.duration ? `⏱️ ${d.duration}` : dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            let rpeColor = 'rpe-easy'; if(d.rpe === 'Duro' || d.rpe === 'Intenso') rpeColor = 'rpe-hard'; if(d.rpe === 'Fallo' || d.rpe === 'Extremo') rpeColor = 'rpe-max';
            const detailsStr = d.details ? encodeURIComponent(JSON.stringify(d.details)) : ""; const noteStr = d.note ? encodeURIComponent(d.note) : "";
            
            const btnVer = d.details ? `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.id}', '${d.routine}', '${detailsStr}', '${noteStr}', '${timeStr}')">🔍</button>` : '';
            const btnBorrar = `<button class="btn-small btn-danger" style="margin:0 5px; padding:2px 6px;" onclick="window.deleteHistoryWorkout('${d.id}')">🗑️</button>`;
            
            histDiv.innerHTML += `<div class="history-row"><div style="color:var(--accent-color); font-weight:bold;">${dateStr}</div><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:5px;">${d.routine}</div><div style="display:flex; justify-content:center;"><span class="rpe-dot ${rpeColor}" title="${d.rpe}"></span></div><div style="text-align:right;">${btnVer}${btnBorrar}</div></div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error."; }
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});
};

window.deleteHistoryWorkout = async (id) => {
    if(!confirm("⚠️ ¿BORRAR ESTE ENTRENO?\n\nSi borras este entreno, la próxima vez que entrenes recuperaremos los datos del entreno ANTERIOR válido.")) return;
    try {
        await deleteDoc(doc(db, "workouts", id));
        alert("✅ Entreno eliminado.");
        if (document.getElementById('coach-detail-view').classList.contains('active')) {
             window.openCoachView(selectedUserCoach, selectedUserObj);
        } else {
             window.loadProfile();
        }
    } catch(e) { alert("Error: " + e.message); }
};

window.updateWeightChart = (id, range) => { const sourceData = (id === 'coachWeightChart') ? selectedUserObj.weightHistory : userData.weightHistory; const instance = (id === 'coachWeightChart') ? coachChart : chartInstance; const newInst = renderFilteredChart(id, instance, sourceData, 'weight', '#ff3333', parseInt(range)); if(id === 'coachWeightChart') coachChart = newInst; else chartInstance = newInst; };
window.updateBioChart = (id, range) => { const sourceData = (id === 'coachBioChart') ? selectedUserObj.bioHistory : userData.bioHistory; const instance = (id === 'coachBioChart') ? coachBioChart : bioChartInstance; const newInst = renderFilteredChart(id, instance, sourceData, 'muscle', '#00ffff', parseInt(range)); if(id === 'coachBioChart') coachBioChart = newInst; else bioChartInstance = newInst; };
window.updateFatChart = (id, range) => { const sourceData = (id === 'coachFatChart') ? selectedUserObj.skinfoldHistory : userData.skinfoldHistory; const instance = (id === 'coachFatChart') ? coachFatChart : fatChartInstance; const newInst = renderFilteredChart(id, instance, sourceData, 'fat', '#ffaa00', parseInt(range)); if(id === 'coachFatChart') coachFatChart = newInst; else fatChartInstance = newInst; };

function checkPhotoReminder() { if(!userData.photoDay) return; const now = new Date(); const day = now.getDay(); const time = now.toTimeString().substr(0,5); if(day == userData.photoDay && time === userData.photoTime) alert("📸 HORA DE TU FOTO DE PROGRESO 📸"); }
function checkPhotoVisualReminder() {
    const bannerId = 'photo-missing-banner'; const existing = document.getElementById(bannerId); if(existing) existing.remove();
    if(!userData.photo || userData.photo === "") {
        const div = document.createElement('div'); div.id = bannerId; div.style.cssText = "background: #ffaa00; color: #000; padding: 10px; text-align: center; font-weight: bold; font-size: 0.9rem; cursor: pointer; animation: pulse 2s infinite; margin-top:5px;"; div.innerHTML = "📸 ¡Sube tu foto de perfil para aparecer en el Ranking! (Click aquí)"; div.onclick = () => { switchTab('profile-view'); };
        const header = document.getElementById('main-header'); if(header && header.parentNode) header.parentNode.insertBefore(div, header.nextSibling);
    }
}
window.toggleAuth = (m) => { document.getElementById('login-form').classList.toggle('hidden',m!=='login'); document.getElementById('register-form').classList.toggle('hidden',m!=='register'); };
window.logout = () => signOut(auth).then(()=>location.reload());
window.recoverPass = async () => { const email = prompt("Introduce tu email:"); if(email) try { await sendPasswordResetEmail(auth, email); alert("📧 Correo enviado."); } catch(e) { alert("Error: " + e.message); } };
window.dismissNotif = () => { document.getElementById('notif-badge').style.display = 'none'; switchTab('routines-view'); sessionStorage.setItem('notif_dismissed', 'true'); };

function getExerciseData(name) {
    if(!name) return { img: 'logo.png', mInfo: {main:'General', sec:[]}, type:'c', v:null };
    let match = EXERCISES.find(e => e.n === name);
    if (!match) { const cleanName = normalizeText(name); match = EXERCISES.find(e => normalizeText(e.n) === cleanName); }
    if (!match) { const cleanName = normalizeText(name); match = EXERCISES.find(e => { const cleanDbName = normalizeText(e.n); return cleanDbName.includes(cleanName) || cleanName.includes(cleanDbName); }); }
    if (!match) {
        const n = normalizeText(name); let m = "General", img = "logo.png";
        if(n.includes("press")||n.includes("pecho")||n.includes("aperturas")) { m="Pecho"; img="pecho.png"; }
        else if(n.includes("remo")||n.includes("jalon")||n.includes("espalda")||n.includes("dominadas")) { m="Espalda"; img="espalda.png"; }
        else if(n.includes("sentadilla")||n.includes("prensa")||n.includes("extension")||n.includes("zancada")) { m="Cuádriceps"; img="cuadriceps.png"; }
        else if(n.includes("curl")||n.includes("biceps")) { m="Bíceps"; img="biceps.png"; }
        else if(n.includes("triceps")||n.includes("frances")||n.includes("fondos")) { m="Tríceps"; img="triceps.png"; }
        else if(n.includes("hombro")||n.includes("militar")||n.includes("elevacion")||n.includes("pajaros")) { m="Hombros"; img="hombros.png"; }
        return { img: img, mInfo: getMuscleInfoByGroup(m), type:'c', v:null };
    }
    return { img: match.img, mInfo: getMuscleInfoByGroup(match.m), type: match.t || 'c', v: match.v };
}
function getMuscleInfoByGroup(m) { let s = []; if(m==="Pecho") s=["Tríceps","Hombros"]; else if(m==="Espalda") s=["Bíceps", "Antebrazo"]; else if(m==="Cuádriceps") s=["Glúteos", "Gemelos"]; else if(m==="Isquios") s=["Glúteos", "Espalda Baja"]; else if(m==="Hombros") s=["Tríceps", "Trapecio"]; else if(m==="Bíceps") s=["Antebrazo"]; else if(m==="Tríceps") s=["Hombros", "Pecho"]; else if(m==="Glúteos") s=["Isquios", "Cuádriceps"]; return {main:m, sec:s}; }

async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        let myRoutines = [];
        s.forEach(d=>{ const r = d.data(); const isAssignedToMe = r.assignedTo && r.assignedTo.includes(currentUser.uid); if(isAssignedToMe){ myRoutines.push({id: d.id, ...r}); } });
        const orderPreference = userData.routineOrder || [];
        myRoutines.sort((a, b) => {
            let indexA = orderPreference.indexOf(a.id); let indexB = orderPreference.indexOf(b.id);
            if (indexA === -1) indexA = 9999; if (indexB === -1) indexB = 9999;
            return indexA - indexB;
        });
        if(myRoutines.length === 0) { l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>'; return; }
        myRoutines.forEach(r => {
            const div = document.createElement('div'); div.className = 'card'; const canEdit = r.uid === currentUser.uid;
            div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${canEdit ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${r.id}')">✏️</button><button style="background:none;border:none;" onclick="delRoutine('${r.id}')">🗑️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${r.id}')">ENTRENAR</button>`;
            l.appendChild(div);
        });
    });
}

// --- OPTIMIZACIÓN: INFINITE SCROLL EDITOR ---
function initExerciseList(list) {
    const c = document.getElementById('exercise-selector-list'); c.innerHTML = ''; 
    const sortedList = [...list].sort((a, b) => { 
        const aSelected = currentRoutineSelections.some(x => x.n === a.n); 
        const bSelected = currentRoutineSelections.some(x => x.n === b.n); 
        if (aSelected && !bSelected) return -1; if (!aSelected && bSelected) return 1; return 0; 
    });
    filteredExercisesList = sortedList; exercisesBatchIndex = 0;
    const sentinel = document.createElement('div'); sentinel.id = 'exercises-sentinel'; sentinel.style.height = '20px'; c.appendChild(sentinel);
    if (exercisesObserver) exercisesObserver.disconnect();
    exercisesObserver = new IntersectionObserver((entries) => { if(entries[0].isIntersecting) { renderNextBatch(); } }, { root: c, rootMargin: '200px' });
    exercisesObserver.observe(sentinel); renderNextBatch();
}

function renderNextBatch() {
    const c = document.getElementById('exercise-selector-list'); const sentinel = document.getElementById('exercises-sentinel'); if (!c || !sentinel) return;
    const batch = filteredExercisesList.slice(exercisesBatchIndex * BATCH_SIZE, (exercisesBatchIndex * BATCH_SIZE) + BATCH_SIZE);
    if (batch.length === 0) { exercisesObserver.disconnect(); return; }
    const fragment = document.createDocumentFragment();
    batch.forEach(e => {
        const d = document.createElement('div'); const selectedIndex = currentRoutineSelections.findIndex(x => x.n === e.n); const isSelected = selectedIndex > -1; const obj = isSelected ? currentRoutineSelections[selectedIndex] : null; 
        d.id = `ex-card-${normalizeText(e.n)}`; d.className = 'ex-select-item';
        if (isSelected) {
            d.classList.add('selected-red-active'); d.style.cssText = "background: rgba(50, 10, 10, 0.95); border-left: 4px solid var(--accent-color); border: 1px solid var(--accent-color); padding: 10px; margin-bottom: 5px; border-radius: 8px; flex-direction:column; align-items: stretch;";
            d.innerHTML = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;"><div style="display:flex; align-items:center; gap:10px;"><img src="${e.img}" onerror="this.src='logo.png'" loading="lazy" style="width:40px; height:40px; border-radius:4px; object-fit:cover;"><span style="font-weight:bold; color:white;">${e.n}</span></div><b class="btn-remove-ex" onclick="event.stopPropagation(); removeSelection('${obj.n}')" style="cursor:pointer; color:#ff5555; font-size:1.2rem; padding:5px;">✕</b></div><div class="summary-inputs" style="display:flex; gap:8px; align-items:center; width:100%;"><input type="number" value="${obj.series || 5}" oninput="window.updateSelectionData(${selectedIndex}, 'series', this.value)" onclick="event.stopPropagation()" placeholder="Ser" style="width:60px; text-align:center; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;"><span style="color:#aaa;">x</span><input type="text" value="${obj.reps || '20-16-16-16-16'}" onclick="event.stopPropagation()" style="flex:1; padding:8px; background:#000; border:1px solid #444; color:white; border-radius:4px;" oninput="window.updateSelectionData(${selectedIndex}, 'reps', this.value)" placeholder="Reps"><span style="font-size:1.8rem; cursor:pointer; margin-left:5px; ${obj.s ? 'color:var(--accent-color);' : 'color:#444;'}" onclick="event.stopPropagation(); toggleSuperset(${selectedIndex})" title="Superserie">🔗</span></div>`;
            d.onclick = null;
        } else {
            d.innerHTML = `<img src="${e.img}" onerror="this.src='logo.png'" loading="lazy"><span>${e.n}</span>`;
            d.onclick = () => { currentRoutineSelections.push({ n: e.n, s: false, series: 5, reps: "20-16-16-16-16" }); initExerciseList(filteredExercisesList); renderSelectedSummary(); };
        }
        fragment.appendChild(d);
    });
    c.insertBefore(fragment, sentinel); exercisesBatchIndex++;
}

window.openEditor = async (id = null) => { editingRoutineId = id; document.getElementById('editor-name').value = ''; document.getElementById('editor-title').innerText = id ? "EDITAR RUTINA" : "NUEVA RUTINA"; if (id) { const docSnap = await getDoc(doc(db, "routines", id)); const r = docSnap.data(); document.getElementById('editor-name').value = r.name; currentRoutineSelections = r.exercises.map(ex => ({ n: ex.n || ex, s: ex.s || false, series: ex.series || 5, reps: ex.reps || "20-16-16-16-16" })); } else { currentRoutineSelections = []; } window.currentRoutineSelections = currentRoutineSelections; initExerciseList(EXERCISES); renderSelectedSummary(); switchTab('editor-view'); };
window.filterExercises = (t) => { const cleanSearch = normalizeText(t); const filtered = EXERCISES.filter(e => { const nameMatch = normalizeText(e.n).includes(cleanSearch); const muscleMatch = e.m ? normalizeText(e.m).includes(cleanSearch) : false; return nameMatch || muscleMatch; }); initExerciseList(filtered); };

window.renderSelectedSummary = () => {
    const div = document.getElementById('selected-summary'); div.innerHTML = ''; 
    if(currentRoutineSelections.length > 0) {
        const legendDiv = document.createElement('div'); legendDiv.className = 'editor-legend'; legendDiv.style.cssText = "display:flex; gap:8px; overflow-x:auto; padding:12px; background:#111; margin-bottom:15px; white-space:nowrap; border-bottom:1px solid #333; align-items:center; border-radius: 8px; position:sticky; top:0; z-index:10; cursor:pointer;"; legendDiv.onclick = () => { document.getElementById('exercise-selector-list').scrollTo({top:0, behavior:'smooth'}); };
        let legendHTML = '<span style="font-size:0.7rem; color:#888; font-weight:bold; margin-right:5px;">ORDEN:</span>';
        currentRoutineSelections.forEach((obj, idx) => { const isLast = idx === currentRoutineSelections.length - 1; const linkSymbol = obj.s ? '<span style="color:var(--accent-color); font-weight:bold;">🔗</span>' : ''; const separator = (isLast && !obj.s) ? '' : '<span style="color:#444">›</span>'; legendHTML += `<span onclick="event.stopPropagation(); document.getElementById('ex-card-${normalizeText(obj.n)}').scrollIntoView({behavior:'smooth', block:'center'});" style="font-size:0.85rem; color:#fff; cursor:pointer; text-decoration:underline; text-decoration-color:rgba(255,255,255,0.2);">${idx+1}. ${obj.n} ${linkSymbol}</span> ${separator}`; });
        legendDiv.innerHTML = legendHTML; div.appendChild(legendDiv);
    }
};

window.updateSelectionData = (idx, field, val) => { if(currentRoutineSelections[idx]) { currentRoutineSelections[idx][field] = field === 'series' ? (parseInt(val)||0) : val; } };
window.toggleSuperset = (idx) => { if (idx < currentRoutineSelections.length - 1) { currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s; initExerciseList(filteredExercisesList); renderSelectedSummary(); } else { alert("No puedes hacer superserie con el último ejercicio."); } };
window.removeSelection = (name) => { currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); renderSelectedSummary(); window.filterExercises(document.getElementById('ex-search').value); }
window.saveRoutine = async () => { const n = document.getElementById('editor-name').value; const s = window.currentRoutineSelections; if(!n || s.length === 0) return alert("❌ Faltan datos"); const btn = document.getElementById('btn-save-routine'); btn.innerText = "💾 GUARDANDO..."; let initialAssignments = []; if (userData.role !== 'admin') { initialAssignments.push(currentUser.uid); } try { const data = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: initialAssignments }; if(editingRoutineId) { await updateDoc(doc(db, "routines", editingRoutineId), { name: n, exercises: s }); } else { await addDoc(collection(db, "routines"), data); } alert("✅ Guardado"); switchTab('routines-view'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "GUARDAR"; } };
window.cloneRoutine = async (id) => { if(!confirm("¿Deseas clonar esta rutina para editarla?")) return; try { const docRef = doc(db, "routines", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return alert("Error: No existe."); const originalData = docSnap.data(); const newName = prompt("Nombre copia:", `${originalData.name} (Copia)`); if (!newName) return; const copyData = { ...originalData, name: newName, uid: currentUser.uid, createdAt: serverTimestamp(), assignedTo: [] }; await addDoc(collection(db, "routines"), copyData); alert(`✅ Clonada. Ahora puedes editar "${newName}".`); window.loadAdminLibrary(); } catch (e) { alert("Error: " + e.message); } };
window.delRoutine = async (id) => { if(confirm("¿Borrar rutina permanentemente?")) await deleteDoc(doc(db,"routines",id)); window.loadAdminLibrary(); };
window.switchPose = (pose) => { currentPose = pose; document.getElementById('tab-front').classList.toggle('active', pose==='front'); document.getElementById('tab-back').classList.toggle('active', pose==='back'); updatePhotoDisplay(userData); };

function updatePhotoDisplay(u) {
    const prefix = currentPose === 'front' ? '' : '_back';
    const b = u[`photoBefore${prefix}`] || '', a = u[`photoAfter${prefix}`] || '';
    const dateB = u[`dateBefore${prefix}`] || '-', dateA = u[`dateAfter${prefix}`] || '-';
    document.getElementById('img-before').src = b; document.getElementById('img-overlay').src = a;
    document.getElementById('date-before').innerText = `ANTES (${dateB})`; document.getElementById('date-after').innerText = `AHORA (${dateA})`;
    document.getElementById('slider-handle').style.left = '0%'; document.getElementById('img-overlay').style.clipPath = 'inset(0 0 0 0)';
}

window.uploadAvatar = (inp) => { if(inp.files[0]) { const file = inp.files[0]; const path = `users/${currentUser.uid}/avatar.jpg`; const storageRef = ref(storage, path); uploadBytes(storageRef, file).then(async (snapshot) => { const url = await getDownloadURL(snapshot.ref); await updateDoc(doc(db,"users",currentUser.uid), {photo: url}); userData.photo = url; window.loadProfile(); }).catch(e => alert("Error subiendo foto: " + e.message)); } };
window.loadCompImg = (inp, field) => { if(inp.files[0]) { const file = inp.files[0]; const r = new FileReader(); r.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = async () => { const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const scale = 800 / img.width; canvas.width = 800; canvas.height = img.height * scale; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); canvas.toBlob(async (blob) => { const prefix = currentPose === 'front' ? 'front' : 'back'; const timestamp = Date.now(); const path = `users/${currentUser.uid}/progress/${timestamp}_${prefix}.jpg`; const storageRef = ref(storage, path); try { await uploadBytes(storageRef, blob); const url = await getDownloadURL(storageRef); const fieldPrefix = currentPose === 'front' ? '' : '_back'; const fieldName = field === 'before' ? `photoBefore${fieldPrefix}` : `photoAfter${fieldPrefix}`; const dateField = field === 'before' ? `dateBefore${fieldPrefix}` : `dateAfter${fieldPrefix}`; const today = new Date().toLocaleDateString(); const record = { date: today, url: url }; let update = {}; update[fieldName] = url; update[dateField] = today; const histField = fieldPrefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; update[histField] = arrayUnion(record); await updateDoc(doc(db, "users", currentUser.uid), update); userData[fieldName] = url; userData[dateField] = today; if(!userData[histField]) userData[histField] = []; userData[histField].push(record); updatePhotoDisplay(userData); } catch(err) { alert("Error: " + err.message); } }, 'image/jpeg', 0.8); }; }; r.readAsDataURL(file); } };
window.deletePhoto = async (type) => { if(!confirm("¿Borrar?")) return; const prefix = currentPose === 'front' ? '' : '_back'; const f = type === 'before' ? `photoBefore${prefix}` : `photoAfter${prefix}`; let u={}; u[f]=""; await updateDoc(doc(db,"users",currentUser.uid),u); userData[f]=""; updatePhotoDisplay(userData); };
window.moveSlider = (v) => { document.getElementById('img-overlay').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('slider-handle').style.left = `${v}%`; };
window.switchCoachPose = (pose) => { coachCurrentPose = pose; document.getElementById('coach-tab-front').classList.toggle('active', pose==='front'); document.getElementById('coach-tab-back').classList.toggle('active', pose==='back'); updateCoachPhotoDisplay(pose); };

function updateCoachPhotoDisplay(pose) {
    const u = selectedUserObj; if(!u) return; const prefix = pose === 'front' ? '' : '_back'; const histField = prefix === '' ? 'photoHistoryFront' : 'photoHistoryBack'; const history = u[histField] || []; const pCont = document.getElementById('coach-photos-container');
    pCont.innerHTML = `<div style="display:flex; gap:5px; margin-bottom:10px;"><select id="c-sel-before" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select><select id="c-sel-after" onchange="window.updateCoachSliderImages()" style="margin:0; font-size:0.8rem;"></select></div><div class="compare-wrapper" style="min-height:250px; background:#000; position:relative;"><div class="slider-labels"><span class="label-tag">ANTES</span><span class="label-tag">AHORA</span></div><img src="" id="c-img-before" class="compare-img" style="width:100%; height:100%; object-fit:contain;"><img src="" id="c-img-after" class="compare-img img-overlay" style="clip-path:inset(0 0 0 0); width:100%; height:100%; object-fit:contain;"><div class="slider-handle" id="coach-slider-handle" style="left:0%"><div class="slider-btn"></div></div></div><input type="range" min="0" max="100" value="0" style="width:100%; margin-top:15px;" oninput="window.moveCoachSlider(this.value)">`;
    const selB = document.getElementById('c-sel-before'); const selA = document.getElementById('c-sel-after');
    if(history.length === 0) { const current = u[`photoBefore${prefix}`]; const opt = new Option(current ? "Actual" : "Sin fotos", current || ""); selB.add(opt); selA.add(opt.cloneNode(true)); } 
    else { history.forEach((h, i) => { const label = h.date || `Foto ${i+1}`; selB.add(new Option(label, h.url)); selA.add(new Option(label, h.url)); }); selB.selectedIndex = 0; selA.selectedIndex = history.length - 1; }
    window.updateCoachSliderImages();
}

window.updateCoachSliderImages = () => { const urlB = document.getElementById('c-sel-before').value; const urlA = document.getElementById('c-sel-after').value; document.getElementById('c-img-before').src = urlB; document.getElementById('c-img-after').src = urlA; };
window.moveCoachSlider = (v) => { document.getElementById('c-img-after').style.clipPath = `inset(0 0 0 ${v}%)`; document.getElementById('coach-slider-handle').style.left = `${v}%`; };

function renderMeasureChart(canvasId, historyData) {
    const ctx = document.getElementById(canvasId); let instance = (canvasId === 'chartMeasures') ? measureChartInstance : coachMeasureChart; if(instance) instance.destroy();
    const labels = historyData.map(m => new Date(m.date.seconds*1000).toLocaleDateString());
    const parts = [{k:'chest', l:'Pecho', c:'#FF5733'}, {k:'waist', l:'Cintura', c:'#00FF88'}, {k:'hip', l:'Cadera', c:'#3357FF'}, {k:'arm', l:'Brazo', c:'#FF33A8'}, {k:'thigh', l:'Muslo', c:'#F3FF33'}, {k:'calf', l:'Gemelo', c:'#FF8C00'}, {k:'shoulder', l:'Hombros', c:'#A133FF'}];
    const datasets = parts.map(p => ({ label: p.l, data: historyData.map(h => h[p.k] || 0), borderColor: p.c, tension: 0.3, pointRadius: 2 }));
    const newChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: datasets }, options: { plugins: { legend: { display: true, labels: { color: '#888', boxWidth: 10, font: {size: 10} } } }, scales: { y: { grid: { color: '#333' } }, x: { display: true, ticks: { color: '#666', maxRotation: 45, minRotation: 0, font: {size: 10} }, grid: { display: false } } }, maintainAspectRatio: false } });
    if(canvasId === 'chartMeasures') measureChartInstance = newChart; else coachMeasureChart = newChart;
}

function renderMuscleRadar(canvasId, stats) {
    const ctx = document.getElementById(canvasId); if(!ctx) return; const existingChart = Chart.getChart(ctx); if (existingChart) existingChart.destroy();
    const muscleGroups = ["Pecho", "Espalda", "Cuádriceps", "Isquios", "Hombros", "Bíceps", "Tríceps", "Glúteos"]; const dataValues = muscleGroups.map(m => stats[m] || 0); const maxValue = Math.max(...dataValues); let calculatedStep = Math.ceil(maxValue / 5); if (calculatedStep < 1) calculatedStep = 1; const niceMax = Math.ceil(maxValue / calculatedStep) * calculatedStep;
    new Chart(ctx, { type: 'radar', data: { labels: muscleGroups, datasets: [{ label: 'Series', data: dataValues, backgroundColor: 'rgba(255, 51, 51, 0.25)', borderColor: '#ff3333', borderWidth: 2, pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointRadius: 3, pointHoverRadius: 5 }] }, options: { scales: { r: { angleLines: { color: 'rgba(255, 255, 255, 0.1)' }, grid: { color: 'rgba(255, 255, 255, 0.1)', circular: false }, pointLabels: { color: '#cccccc', font: { size: 10 } }, ticks: { display: false, stepSize: calculatedStep, maxTicksLimit: 6 }, suggestedMin: 0, max: niceMax > 0 ? niceMax : 5 } }, plugins: { legend: { display: false } }, maintainAspectRatio: false } });
}

window.openDietView = () => { if(!userData.dietFile) return; const url = `nutricion/${userData.dietFile}`; document.getElementById('diet-frame').src = url; window.openModal('modal-diet'); };
window.closeDiet = () => { document.getElementById('diet-frame').src = "about:blank"; window.closeModal('modal-diet'); };
window.assignDiet = async () => { const file = document.getElementById('coach-diet-select').value; if(!selectedUserCoach) return; const val = file === "" ? null : file; await updateDoc(doc(db, "users", selectedUserCoach), { dietFile: val }); alert("Dieta actualizada."); openCoachView(selectedUserCoach, selectedUserObj); };
window.saveMeasurements = async () => { const data = { date: new Date(), chest: document.getElementById('m-chest').value, waist: document.getElementById('m-waist').value, hip: document.getElementById('m-hip').value, arm: document.getElementById('m-arm').value, thigh: document.getElementById('m-thigh').value, calf: document.getElementById('m-calf').value, shoulder: document.getElementById('m-shoulder').value }; await updateDoc(doc(db, "users", currentUser.uid), { measureHistory: arrayUnion(data), measurements: data }); alert("Guardado ✅"); window.loadProfile(); };
window.calculateAndSaveSkinfolds = async () => { const s = { chest: parseFloat(document.getElementById('p-chest').value)||0, axilla: parseFloat(document.getElementById('p-axilla').value)||0, tricep: parseFloat(document.getElementById('p-tricep').value)||0, subscap: parseFloat(document.getElementById('p-subscap').value)||0, abdo: parseFloat(document.getElementById('p-abdo').value)||0, supra: parseFloat(document.getElementById('p-supra').value)||0, thigh: parseFloat(document.getElementById('p-thigh').value)||0 }; const sum = Object.values(s).reduce((a,b)=>a+b,0); const age = userData.age || 25, gender = userData.gender || 'male'; let bd = (gender === 'male') ? 1.112 - (0.00043499*sum) + (0.00000055*sum*sum) - (0.00028826*age) : 1.097 - (0.00046971*sum) + (0.00000056*sum*sum) - (0.00012828*age); const fat = ((495 / bd) - 450).toFixed(1); await updateDoc(doc(db, "users", currentUser.uid), { skinfoldHistory: arrayUnion({date: new Date(), fat: fat, skinfolds: s}), skinfolds: s, bodyFat: fat }); alert(`Grasa: ${fat}%. Guardado ✅`); window.loadProfile(); };
window.saveBioEntry = async () => { const muscle = parseFloat(document.getElementById('bio-muscle').value) || 0; const fat = parseFloat(document.getElementById('bio-fat').value) || 0; if(muscle === 0 && fat === 0) return alert("Introduce datos válidos."); const entry = { date: new Date(), muscle: muscle, fat: fat }; await updateDoc(doc(db, "users", currentUser.uid), { bioHistory: arrayUnion(entry) }); alert("Datos Guardados ✅"); if(!userData.bioHistory) userData.bioHistory = []; userData.bioHistory.push(entry); window.loadProfile(); };

window.saveConfig = async () => { 
    const rt = document.getElementById('cfg-rest-time').value; 
    const tg = document.getElementById('cfg-telegram')?.value || "";
    await updateDoc(doc(db,"users",currentUser.uid), { restTime: parseInt(rt), telegram: tg }); 
    userData.restTime = parseInt(rt); userData.telegram = tg;
    alert("Ajustes Guardados"); 
};

window.contactCoach = () => { showToast("💬 Abriendo chat... Te responderemos lo antes posible."); setTimeout(() => { window.open("https://t.me/fityhab", "_blank"); }, 1000); };
window.savePhotoReminder = async () => { const d = document.getElementById('photo-day').value; const t = document.getElementById('photo-time').value; await updateDoc(doc(db,"users",currentUser.uid), { photoDay:d, photoTime:t }); userData.photoDay = d; userData.photoTime = t; alert("Alarma Guardada"); };
window.addWeightEntry = async () => { const wStr = prompt("Introduce tu peso (kg):"); if(!wStr) return; const w = parseFloat(wStr.replace(',','.')); if(isNaN(w)) return alert("Número inválido"); const newEntry = { weight: w, date: new Date() }; try { await updateDoc(doc(db,"users",currentUser.uid), { weightHistory: arrayUnion(newEntry) }); if (!userData.weightHistory) userData.weightHistory = []; userData.weightHistory.push({ weight: w, date: { seconds: Date.now() / 1000 } }); window.loadProfile(); alert("✅ Peso Guardado"); } catch(e) { alert("Error al guardar: " + e.message); } };

function saveLocalWorkout() { 
    if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); 
}
window.cancelWorkout = () => { 
    if(confirm("⚠ ¿SEGURO QUE QUIERES CANCELAR?\nSe perderán los datos de este entrenamiento.")) { 
        activeWorkout = null; 
        localStorage.removeItem('fit_active_workout'); 
        if(durationInt) clearInterval(durationInt); 
        document.getElementById('active-workout-bar').classList.add('hidden');
        switchTab('routines-view'); 
    } 
};

// --- GHOST MODE & START WORKOUT (OPTIMIZADO O(1)) ---
window.startWorkout = async (rid, targetUid = null) => {
    if(activeWorkout) { if(!confirm("⚠️ Ya tienes un entreno en curso. ¿Deseas descartarlo e iniciar este nuevo?")) return; }
    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) { console.log("WakeLock error", e); } }
    
    try {
        const snap = await getDoc(doc(db, "routines", rid)); 
        const r = snap.data();
        const effectiveUid = targetUid || currentUser.uid;
        
        // 1. Obtener Datos de Usuario (Maximos históricos de O(1))
        let targetUserData = userData;
        if (targetUid && targetUid !== currentUser.uid) {
            const uSnap = await getDoc(doc(db, "users", targetUid));
            targetUserData = uSnap.exists() ? uSnap.data() : {};
        }
        
        const userMaxPerSet = targetUserData?.maxWeightsPerSet ?? {};

        // 2. Obtener solo la ÚLTIMA rutina idéntica para los valores Previos
        const q = query(
            collection(db, "workouts"), 
            where("uid", "==", effectiveUid), 
            where("routine", "==", r.name), 
            orderBy("date", "desc"), 
            limit(1)
        ); 
        const wSnap = await getDocs(q); 
        const lastWorkoutData = wSnap.empty ? null : wSnap.docs[0].data().details;
        
        const now = Date.now(); initAudioEngine();
        
        activeWorkout = { 
            name: r.name, startTime: now, ghostUid: targetUid,
            exs: r.exercises.map(exObj => { 
                const isString = typeof exObj === 'string'; const name = isString ? exObj : exObj.n; 
                const isSuperset = isString ? false : (exObj.s || false); 
                const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5); 
                const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16"); 
                const repsArray = customRepsPattern.split('-'); 
                const data = getExerciseData(name); 
                
                const exMaxSets = userMaxPerSet[name] ?? {}; 

                let sets = Array(customSeriesNum).fill().map((_, i) => ({ 
                    r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]), 
                    w: 0, d: false, prev: '-', prevKg: '-', prevReps: '-', maxKg: exMaxSets[i] ?? '-', numDisplay: (i + 1).toString() 
                })); 
                
                if(lastWorkoutData) { 
                    const prevEx = lastWorkoutData.find(ld => ld.n === name); 
                    if(prevEx && prevEx.s) { 
                        sets = sets.map((s, i) => { 
                            if(prevEx.s[i]) { 
                                s.prevReps = prevEx.s[i].r;
                                s.prevKg = prevEx.s[i].w;
                                const dLabel = prevEx.s[i].isDrop ? ' (D)' : ''; 
                                s.prev = `${s.prevReps}x${s.prevKg}kg${dLabel}`; 
                            } 
                            return s; 
                        }); 
                    } 
                } 
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            }) 
        };
        
        saveLocalWorkout(); renderWorkout(); switchTab('workout-view'); startTimerMini();
        if(targetUid) { showToast("⚠️ MODO COACH ACTIVO: Entrenando Cliente"); }

    } catch(e) { console.error("Error startWorkout:", e); alert("Error iniciando entreno: " + e.message); }
};

window.addSet = (exIdx) => { 
    const sets = activeWorkout.exs[exIdx].sets; 
    sets.push({r:16, w:0, d:false, prev:'-', prevKg: '-', prevReps: '-', maxKg: '-', numDisplay: (sets.length + 1).toString()}); 
    saveLocalWorkout(); renderWorkout(); 
};
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const allDone = ex.sets.every(s => s.d); const newState = !allDone; ex.sets.forEach(s => { s.d = newState; }); saveLocalWorkout(); renderWorkout(); if(newState) showToast("✅ Todas las series completadas"); };
window.openNoteModal = (idx) => { noteTargetIndex = idx; const existingNote = activeWorkout.exs[idx].note || ""; document.getElementById('exercise-note-input').value = existingNote; window.openModal('modal-note'); };
window.saveNote = () => { if (noteTargetIndex === null) return; const txt = document.getElementById('exercise-note-input').value.trim(); activeWorkout.exs[noteTargetIndex].note = txt; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-note'); showToast(txt ? "📝 Nota guardada" : "🗑️ Nota borrada"); };
window.toggleRankingOptIn = async (val) => { try { await updateDoc(doc(db, "users", currentUser.uid), { rankingOptIn: val }); userData.rankingOptIn = val; const btnRank = document.getElementById('top-btn-ranking'); if(val) btnRank.classList.remove('hidden'); else btnRank.classList.add('hidden'); showToast(val ? "🏆 Ahora participas en el Ranking" : "👻 Ranking desactivado"); } catch(e) { alert("Error actualizando perfil"); } };

window.changeRankFilter = (type, val) => {
    if(type === 'time') { rankFilterTime = val; document.querySelectorAll('#ranking-view .pill').forEach(el => el.classList.remove('active')); document.getElementById(`time-${val}`).classList.add('active'); document.getElementById(`gender-${rankFilterGender}`).classList.add('active'); }
    if(type === 'gender') { rankFilterGender = val; document.getElementById('gender-all').classList.remove('active'); document.getElementById('gender-male').classList.remove('active'); document.getElementById('gender-female').classList.remove('active'); document.getElementById(`gender-${val}`).classList.add('active'); }
    if(type === 'cat') { rankFilterCat = val; document.querySelectorAll('.pill-cat').forEach(el => el.classList.remove('active')); document.getElementById(`cat-${val}`).classList.add('active'); }
    window.loadRankingView();
};

window.loadRankingView = async () => {
    switchTab('ranking-view'); const list = document.getElementById('ranking-list'); list.innerHTML = '<div style="text-align:center; margin-top:50px; color:#666;">⏳ Verificando datos...</div>';
    try {
        const cacheKey = `rank_cache_${rankFilterTime}_${rankFilterGender}_${rankFilterCat}`; const todayStr = new Date().toDateString(); const cachedRaw = localStorage.getItem(cacheKey); let useCache = false; let rankingData = [];
        if (cachedRaw) { const cachedObj = JSON.parse(cachedRaw); if (cachedObj.date === todayStr) { rankingData = cachedObj.data; useCache = true; } }
        
        if (!useCache) {
            list.innerHTML = '<div style="text-align:center; margin-top:50px; color:var(--accent-color);">↻ Actualizando tabla diaria...</div>'; let orderByField = "", collectionField = "";
            if (rankFilterCat === 'kg') collectionField = "kg"; else if (rankFilterCat === 'workouts') collectionField = "workouts"; else if (rankFilterCat === 'reps') collectionField = "reps"; else if (rankFilterCat === 'sets') collectionField = "sets"; else if (rankFilterCat === 'prs') collectionField = "prCount";
            
            if (rankFilterTime === 'all') { 
                if (rankFilterCat === 'kg') orderByField = "stats.totalKg"; else if (rankFilterCat === 'workouts') orderByField = "stats.workouts"; else if (rankFilterCat === 'reps') orderByField = "stats.totalReps"; else if (rankFilterCat === 'sets') orderByField = "stats.totalSets"; else if (rankFilterCat === 'prs') orderByField = "stats.prCount"; 
            } else { 
                const now = new Date(); let timeKey = ""; 
                if(rankFilterTime === 'week') timeKey = `week_${getWeekNumber(now)}`; 
                if(rankFilterTime === 'month') timeKey = `month_${now.getFullYear()}_${now.getMonth()}`; 
                if(rankFilterTime === 'year') timeKey = `year_${now.getFullYear()}`; 
                if (rankFilterCat === 'prs') { list.innerHTML = "<div class='tip-box'>🏆 Los Récords solo se contabilizan en el Ranking Histórico.</div>"; return; } 
                orderByField = `stats_${timeKey}.${collectionField}`; 
            }
            
            // 🚀 TRUCO SENIOR: Solo usamos orderBy. Firebase tiene índices automáticos para esto.
            // Pedimos 150 documentos para tener margen suficiente tras filtrar en memoria.
            let q = query(collection(db, "users"), orderBy(orderByField, "desc"), limit(150));
            const snap = await getDocs(q); 
            
            if(snap.empty) { list.innerHTML = "<div class='tip-box'>No hay datos para este periodo/filtro todavía.</div>"; return; }
            
            rankingData = []; 
            snap.forEach(d => { 
                const u = d.data(); 
                
                // 🚀 FILTRO EN MEMORIA: Descartamos a los que no quieren participar o no son del género seleccionado.
                // Esto evita bloqueos de Firebase por falta de índices compuestos.
                if (u.rankingOptIn !== true) return;
                if (rankFilterGender !== 'all' && u.gender !== rankFilterGender) return;

                let rawValue = 0; 
                if (rankFilterTime === 'all') { 
                    const fieldName = orderByField.split('.')[1]; rawValue = u.stats ? u.stats[fieldName] : 0; 
                } else { 
                    const rootKey = orderByField.split('.')[0]; const subKey = orderByField.split('.')[1]; rawValue = (u[rootKey] && u[rootKey][subKey]) ? u[rootKey][subKey] : 0; 
                } 
                rankingData.push({ id: d.id, name: u.name, photo: u.photo, workouts: u.stats?.workouts || 0, value: rawValue }); 
            });
            
            // 🚀 Cortamos el array para mostrar solo a los 50 mejores tras el filtro
            rankingData = rankingData.slice(0, 50);

            try { localStorage.setItem(cacheKey, JSON.stringify({ date: todayStr, data: rankingData })); } catch (err) {}
        }
        
        list.innerHTML = ""; let rank = 1; 
        if (rankingData.length === 0) { list.innerHTML = "<div class='tip-box'>No hay usuarios visibles en este filtro.</div>"; return; }

        rankingData.forEach(u => { 
            const isMe = u.id === currentUser.uid; let displayValue = u.value; 
            if(rankFilterCat === 'kg') displayValue = (u.value / 1000).toFixed(1) + 't'; 
            else if(rankFilterCat === 'prs') displayValue = u.value + ' 🏆'; 
            else displayValue = u.value.toLocaleString(); 
            let posClass = ""; if(rank === 1) posClass = "ranking-1"; if(rank === 2) posClass = "ranking-2"; if(rank === 3) posClass = "ranking-3"; 
            const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar" style="width:35px;height:35px;">` : `<div class="mini-avatar-placeholder" style="width:35px;height:35px;font-size:0.8rem;">${u.name.charAt(0).toUpperCase()}</div>`; 
            const div = document.createElement('div'); div.className = "ranking-row"; if(isMe) div.style.borderColor = "var(--accent-color)"; 
            div.innerHTML = `<div class="ranking-pos ${posClass}">#${rank}</div><div style="margin-right:10px;">${avatarHtml}</div><div style="flex:1;"><div style="font-weight:bold; color:${isMe ? 'var(--accent-color)' : 'white'}">${u.name}</div><div style="font-size:0.65rem; color:#666;">${u.workouts} entrenos</div></div><div class="rank-value-highlight">${displayValue}</div>`; 
            list.appendChild(div); rank++; 
        });
        
        if(useCache) { const advice = document.createElement('div'); advice.className = 'tip-box'; advice.style.fontSize = '0.6rem'; advice.style.marginTop = '10px'; advice.style.opacity = '0.7'; advice.innerHTML = "📊 Datos actualizados de hoy. El ranking se recalculará mañana."; list.appendChild(advice); }
    } catch(e) { console.error("Rank Error:", e); list.innerHTML = `<div style="text-align:center; color:#666;">Error.<br><small>${e.message}</small></div>`; }
};

window.initSwap = (idx) => { swapTargetIndex = idx; const currentEx = activeWorkout.exs[idx]; const muscle = currentEx.mInfo.main; const list = document.getElementById('swap-list'); list.innerHTML = ''; const alternatives = EXERCISES.filter(e => getMuscleInfoByGroup(e.m).main === muscle && e.n !== currentEx.n); if(alternatives.length === 0) list.innerHTML = '<div style="padding:10px;">No hay alternativas directas.</div>'; else alternatives.forEach(alt => { const d = document.createElement('div'); d.style.padding = "10px"; d.style.borderBottom = "1px solid #333"; d.style.cursor = "pointer"; d.innerHTML = `<b>${alt.n}</b>`; d.onclick = () => window.performSwap(alt.n); list.appendChild(d); }); window.openModal('modal-swap'); };
window.performSwap = (newName) => { if(swapTargetIndex === null) return; const data = getExerciseData(newName); const currentSets = activeWorkout.exs[swapTargetIndex].sets.map(s => ({...s, prev:'-', prevKg: '-', prevReps: '-', maxKg: '-', d: false})); activeWorkout.exs[swapTargetIndex].n = newName; activeWorkout.exs[swapTargetIndex].img = data.img; activeWorkout.exs[swapTargetIndex].video = data.v; activeWorkout.exs[swapTargetIndex].sets = currentSets; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-swap'); };

// --- RENDER WORKOUT ACTUALIZADO ---
function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        let cardStyle = "border-left:3px solid var(--accent-color);"; let connector = ""; if (e.superset) { cardStyle += " margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px dashed #444;"; connector = `<div style="text-align:center; background:var(--card-color); color:var(--accent-color); font-size:1.2rem; line-height:0.5;">🔗</div>`; } else if (i > 0 && activeWorkout.exs[i-1].superset) cardStyle += " border-top-left-radius: 0; border-top-right-radius: 0; margin-top:0;";
        const card = document.createElement('div'); card.className = 'card'; card.style.cssText = cardStyle;
        let videoBtnHtml = (userData.showVideos && e.video) ? `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0; padding:2px 8px; border-color:#f00; color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        const swapBtn = `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0 5px 0 0; padding:2px 8px; border-color:#aaa; color:#fff;" onclick="window.initSwap(${i})">🔄</button>`;
        const hasNote = e.note && e.note.length > 0; const noteBtn = `<button class="ex-note-btn ${hasNote ? 'has-note' : ''}" onclick="window.openNoteModal(${i})">📝</button>`;
        let bars = (e.type === 'i') ? `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>100%</span></div><div class="mini-track"><div class="mini-fill fill-primary"></div></div>` : `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>70%</span></div><div class="mini-track"><div class="mini-fill fill-primary" style="width:70%"></div></div>`;
        
        // 1. Cambiado HISTORIAL a PREV
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => { 
            const weightVal = s.w === 0 ? '' : s.w; const isDisabled = s.d ? 'disabled' : ''; const rowOpacity = s.d ? 'opacity:0.5; pointer-events:none;' : ''; const isDropClass = s.isDrop ? 'is-dropset' : ''; const displayNum = s.numDisplay || (j + 1);
            let dropActionBtn = !s.d ? (s.isDrop ? `<button class="btn-small btn-outline" style="padding:2px 6px; font-size:0.7rem; border-color:#f55; color:#f55; margin-left:auto;" onclick="window.removeSpecificSet(${i},${j})">✕</button>` : `<button class="btn-small btn-outline" style="padding:2px; font-size:0.5rem; border-color:var(--warning-color); color:var(--warning-color);" onclick="window.addDropset(${i},${j})">DROP</button>`) : '';
            
            // 2. Quitamos la palabra "Últ:" para ahorrar espacio
            const prevText = s.prev !== '-' ? s.prev : '-';
            const maxText = s.maxKg !== '-' ? `Máx: ${s.maxKg}kg` : '';
            
            // 3. Aplicamos el color rojo (accent-color) y el destello (accent-glow) al máximo
            const histHtml = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2; width:100%; overflow:hidden;">
                <span style="font-size:0.65rem; color:var(--accent-color); font-family:monospace; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; max-width:100%; opacity:0.85;">${prevText}</span>
                <span style="font-size:0.6rem; color:var(--accent-color); font-weight:bold; text-shadow:var(--accent-glow); white-space:nowrap; text-overflow:ellipsis; overflow:hidden; max-width:100%; margin-top:2px;">${maxText}</span>
            </div>`;
            
            const kgPlaceholder = s.prevKg !== '-' ? s.prevKg : 'kg';

            setsHtml += `<div class="set-row ${isDropClass}" style="${rowOpacity}"><div class="set-num" style="${s.isDrop ? 'color:var(--warning-color); font-size:0.7rem;' : ''}">${displayNum}</div>${histHtml}<div><input type="number" value="${s.r}" ${isDisabled} onchange="uS(${i},${j},'r',this.value)" inputmode="decimal" pattern="[0-9]*"></div><div><input type="number" class="kg-input-placeholder" placeholder="${kgPlaceholder}" value="${weightVal}" ${isDisabled} onchange="uS(${i},${j},'w',this.value)" inputmode="decimal" pattern="[0-9]*"></div><div style="display:flex; flex-direction:column; gap:2px; pointer-events: auto; align-items:center;"><button id="btn-${i}-${j}" class="btn-outline ${s.d ? 'btn-done' : ''}" style="margin:0;padding:0;height:32px;width:100%;" onclick="tS(${i},${j})">${s.d ? '✓' : ''}</button>${dropActionBtn}</div></div>`; 
        });
        setsHtml += `<div class="sets-actions"><button class="btn-set-control" style="border-color:var(--success-color); color:var(--success-color); margin-right:auto;" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="removeSet(${i})">- Serie</button><button class="btn-set-control" onclick="addSet(${i})">+ Serie</button></div>`;
        card.innerHTML = `<div class="workout-split"><div class="workout-visual"><img src="${e.img}" onerror="this.src='logo.png'"></div><div class="workout-bars" style="width:100%">${bars}</div></div><h3 style="margin-bottom:10px; border:none; display:flex; align-items:center; justify-content:space-between;"><span>${e.n}</span><div>${noteBtn} ${videoBtnHtml} ${swapBtn}</div></h3>${setsHtml}`;
        c.appendChild(card); if (e.superset) c.innerHTML += connector; 
    });
}
window.removeSpecificSet = (exIdx, setIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.splice(setIdx, 1); saveLocalWorkout(); renderWorkout(); } };

window.addDropset = (exIdx, setIdx) => { 
    const currentSet = activeWorkout.exs[exIdx].sets[setIdx]; 
    currentSet.d = true; 
    const newSet = { r: Math.floor(currentSet.r * 0.8) || 10, w: Math.floor(currentSet.w * 0.7) || 0, d: false, prev: 'DROPSET', prevKg: '-', prevReps: '-', maxKg: '-', isDrop: true, numDisplay: (parseInt(currentSet.numDisplay) || (setIdx + 1)) + ".5" }; 
    activeWorkout.exs[exIdx].sets.splice(setIdx + 1, 0, newSet); 
    saveLocalWorkout(); renderWorkout(); 
};

window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };

window.tS = async (i, j) => { 
    const s = activeWorkout.exs[i].sets[j]; 
    const exerciseName = activeWorkout.exs[i].n; 
    
    if (!s.d) {
        if ((!s.w || s.w === 0 || s.w === "") && s.prevKg && s.prevKg !== '-') {
            s.w = parseFloat(s.prevKg);
        }
    }

    s.d = !s.d; 
    if(s.d) { 
        const weight = parseFloat(s.w) || 0; 
        const reps = parseInt(s.r) || 0; 
        if (weight > 0 && reps > 0) { 
            const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps))); 
            if (!userData.rmRecords) userData.rmRecords = {}; 
            const currentRecord = userData.rmRecords[exerciseName] || 0; 
            if (estimated1RM > currentRecord) { 
                userData.rmRecords[exerciseName] = estimated1RM; 
                updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM }); 
                if(typeof confetti === 'function') { confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#00ff88', '#ffffff'] }); } 
                showToast(`🔥 ¡NUEVO NIVEL! 1RM: <b>${estimated1RM}kg</b>`); 
            } else { 
                const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0; 
                if (weight > currentWeightPR) { 
                    if(!userData.prs) userData.prs = {}; userData.prs[exerciseName] = weight; 
                    const newPrCount = (userData.stats.prCount || 0) + 1; 
                    updateDoc(doc(db, "users", currentUser.uid), { [`prs.${exerciseName}`]: weight, "stats.prCount": newPrCount }); 
                    userData.stats.prCount = newPrCount; showToast(`💪 Peso Máximo Superado: ${weight}kg`); 
                } 
            } 
        } 
        openRest(); 
    } 
    saveLocalWorkout(); renderWorkout(); 
};

window.requestNotifPermission = () => { if ("Notification" in window) { Notification.requestPermission().then(p => { if(p === 'granted') showToast("✅ Notificaciones activadas"); else showToast("❌ Permiso denegado"); }); } else { showToast("⚠️ Tu navegador no soporta notificaciones"); } };
function updateTimerVisuals(timeLeft) { const display = document.getElementById('timer-display'); const ring = document.getElementById('timer-progress-ring'); if(display) { display.innerText = timeLeft; display.style.color = timeLeft <= 5 ? "#fff" : "var(--accent-color)"; display.style.textShadow = timeLeft <= 5 ? "0 0 20px #fff" : "none"; } if(ring) { const circumference = 565; const offset = circumference - (timeLeft / totalRestTime) * circumference; ring.style.strokeDashoffset = offset; ring.style.stroke = "var(--accent-color)"; if (timeLeft <= 0) ring.style.stroke = "#ffffff"; } }
function openRest() { window.openModal('modal-timer'); initAudioEngine(); let duration = parseInt(userData.restTime) || 60; totalRestTime = duration; restEndTime = Date.now() + (duration * 1000); lastBeepSecond = -1; updateTimerVisuals(duration); if(timerInt) clearInterval(timerInt); timerInt = setInterval(() => { const now = Date.now(); const leftMs = restEndTime - now; const leftSec = Math.ceil(leftMs / 1000); if (leftSec >= 0) { updateTimerVisuals(leftSec); } if (leftSec <= 5 && leftSec > 0) { if (leftSec !== lastBeepSecond) { playTickSound(false); lastBeepSecond = leftSec; } } if (leftSec <= 0) { window.closeTimer(); playTickSound(true); if ("Notification" in window && Notification.permission === "granted") { try { new Notification("¡A LA SERIE!", { body: "Descanso finalizado.", icon: "logo.png" }); } catch(e) {} } } }, 250); }
window.closeTimer = () => { clearInterval(timerInt); window.closeModal('modal-timer'); };
window.addRestTime = (s) => { restEndTime += (s * 1000); if(s > 0) totalRestTime += s; const now = Date.now(); const left = Math.ceil((restEndTime - now) / 1000); updateTimerVisuals(left); };
function startTimerMini() { if(durationInt) clearInterval(durationInt); const d = document.getElementById('mini-timer'); const barD = document.getElementById('bar-timer'); if(!activeWorkout || !activeWorkout.startTime) return; durationInt = setInterval(()=>{ const diff = Math.floor((Date.now() - activeWorkout.startTime)/1000); const m = Math.floor(diff/60); const s = diff % 60; const txt = `${m}:${s.toString().padStart(2,'0')}`; if(d) d.innerText = txt; if(barD) barD.innerText = txt; }, 1000); }
window.promptRPE = () => { const radarCtx = document.getElementById('muscleRadarChart'); if (!radarCtx) return; if (radarChartInstance) radarChartInstance.destroy(); const muscleCounts = { "Pecho":0, "Espalda":0, "Pierna":0, "Hombros":0, "Brazos":0, "Abs":0 }; if (activeWorkout && activeWorkout.exs) { activeWorkout.exs.forEach(e => { const m = e.mInfo?.main || "General"; let key = ""; if (["Pecho", "Espalda", "Hombros", "Abs"].includes(m)) key = m; else if (["Cuádriceps", "Isquios", "Glúteos", "Gemelos"].includes(m)) key = "Pierna"; else if (["Bíceps", "Tríceps"].includes(m)) key = "Brazos"; if (key && muscleCounts.hasOwnProperty(key)) { const completedSets = e.sets?.filter(s => s.d).length || 0; muscleCounts[key] += completedSets; } }); } radarChartInstance = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(muscleCounts), datasets: [{ label: 'Series Finalizadas', data: Object.values(muscleCounts), backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', borderWidth: 2, pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointRadius: 3, pointHoverRadius: 5 }] }, options: { scales: { r: { beginAtZero: true, min: 0, ticks: { display: false, stepSize: 1 }, grid: { color: '#333' }, angleLines: { color: '#333' }, pointLabels: { color: '#ffffff', font: { size: 10 } } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false, responsive: true } }); const notesEl = document.getElementById('workout-notes'); if (notesEl) notesEl.value = ''; window.openModal('modal-rpe'); };
function showToast(msg) { const container = document.getElementById('toast-container') || createToastContainer(); const t = document.createElement('div'); t.className = 'toast-msg'; t.innerHTML = msg; container.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); }
function createToastContainer() { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; }
async function compressAndCleanupWorkouts(uid) { try { const q = query(collection(db, "workouts"), where("uid", "==", uid), orderBy("date", "desc")); const snapshot = await getDocs(q); const docs = snapshot.docs; const KEEP_LIMIT = 30; if (docs.length <= KEEP_LIMIT) return; const docsToDelete = docs.slice(KEEP_LIMIT); const historyUpdates = []; const deletePromises = []; docsToDelete.forEach(docSnap => { const data = docSnap.data(); const dateSeconds = data.date?.seconds || Date.now()/1000; if(data.details && Array.isArray(data.details)) { data.details.forEach(ex => { let maxWeight = 0, totalVol = 0, bestRep = 0; if(ex.s && Array.isArray(ex.s)) { ex.s.forEach(set => { const w = parseFloat(set.w) || 0; const r = parseInt(set.r) || 0; if(w > maxWeight) { maxWeight = w; bestRep = r; } totalVol += (w * r); }); } if(maxWeight > 0 || totalVol > 0) { historyUpdates.push({ d: dateSeconds, n: ex.n, w: maxWeight, r: bestRep, v: totalVol }); } }); } deletePromises.push(deleteDoc(doc(db, "workouts", docSnap.id))); }); if (historyUpdates.length > 0) { await updateDoc(doc(db, "users", uid), { compressedHistory: arrayUnion(...historyUpdates) }); } await Promise.all(deletePromises); console.log(`♻️ Limpieza auto: ${deletePromises.length} eliminados.`); } catch (e) { console.error("Error limpieza:", e); } }
window.runGlobalMigration = async () => { if(!confirm("⚠️ ATENCIÓN: Esta acción comprimirá el historial de TODOS los usuarios.\n\n¿Estás seguro de que quieres continuar?")) return; const btn = document.querySelector('#admin-users-card button[onclick="window.runGlobalMigration()"]'); const originalText = btn.innerText; btn.disabled = true; btn.innerText = "⏳ PROCESANDO..."; try { const usersSnap = await getDocs(collection(db, "users")); let count = 0; for (const uDoc of usersSnap.docs) { btn.innerText = `⏳ Usuario ${count + 1}/${usersSnap.size}...`; await compressAndCleanupWorkouts(uDoc.id); count++; } alert("✅ MIGRACIÓN COMPLETADA."); } catch (e) { alert("Error en migración: " + e.message); } finally { btn.innerText = originalText; btn.disabled = false; } };


// --- FINISH WORKOUT (Guarda en DB los nuevos Maximos O(1)) ---
window.finishWorkout = async (rpeVal) => { 
    try { 
        window.closeModal('modal-rpe'); 
        const note = document.getElementById('workout-notes')?.value || ""; 
        let totalSets = 0, totalReps = 0, totalKg = 0; 
        let muscleCounts = {}; 
        let missingWeights = false; 
        
        const finalUid = activeWorkout.ghostUid || currentUser.uid;
        
        let targetStats = userData.stats || {workouts:0, totalKg:0, totalSets:0, totalReps:0, prCount:0};
        let targetPrs = userData.prs || {};
        let targetMaxPerSet = userData.maxWeightsPerSet || {};

        if(activeWorkout.ghostUid) {
             const uSnap = await getDoc(doc(db, "users", finalUid));
             if(uSnap.exists()) {
                 const uData = uSnap.data();
                 targetStats = uData.stats || targetStats;
                 targetPrs = uData.prs || targetPrs;
                 targetMaxPerSet = uData.maxWeightsPerSet || {};
             }
        }

        const maxPerSetUpdates = {};

        const cleanLog = activeWorkout.exs.map(e => { 
            let currentExMaxes = { ...targetMaxPerSet[e.n] } || {};
            let hasNewMax = false;

            const completedSets = e.sets.filter(set => set.d).map((set, idx) => { 
                const r = parseInt(set.r) || 0; 
                const w = parseFloat(set.w) || 0; 
                if (w === 0) missingWeights = true; 
                totalSets++; totalReps += r; totalKg += (r * w); 
                const mName = e.mInfo?.main || "General"; 
                muscleCounts[mName] = (muscleCounts[mName] || 0) + 1; 
                
                // Actualizar Record de Serie en memoria
                if (w > (currentExMaxes[idx] || 0)) {
                    currentExMaxes[idx] = w;
                    hasNewMax = true;
                }

                return { r, w, isDrop: !!set.isDrop, numDisplay: String(set.numDisplay || "") }; 
            }); 
            
            // Si hay Récord de Serie, lo preparamos
            if (hasNewMax) {
                maxPerSetUpdates[`maxWeightsPerSet.${e.n}`] = currentExMaxes;
                if (finalUid === currentUser.uid) {
                    userData.maxWeightsPerSet = userData.maxWeightsPerSet || {};
                    userData.maxWeightsPerSet[e.n] = currentExMaxes;
                }
            }

            return { n: e.n, s: completedSets, superset: !!e.superset, note: e.note || "" }; 
        }).filter(e => e.s.length > 0); 
        
        if (cleanLog.length === 0) { alert("No hay series completadas."); return; } 
        if(missingWeights) { if(!confirm("⚠️ ATENCIÓN:\n\nHay series marcadas como hechas pero con 0 kg.\n\n¿Estás seguro de que quieres terminar el entreno así?")) return; } 
        
        const startTime = activeWorkout.startTime || Date.now(); 
        const durationMs = Date.now() - startTime; 
        const h = Math.floor(durationMs / 3600000); 
        const m = Math.floor((durationMs % 3600000) / 60000); 
        const s = Math.floor((durationMs % 60000) / 1000); 
        const durationStr = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`; 
        
        const workoutNum = (targetStats?.workouts || 0) + 1; 
        const now = new Date(); 
        const currentMonthKey = `${now.getFullYear()}_${now.getMonth()}`; 
        const currentYearKey = `${now.getFullYear()}`; 
        const currentWeekKey = getWeekNumber(now); 
        
        await addDoc(collection(db, "workouts"), { uid: finalUid, date: serverTimestamp(), routine: activeWorkout.name || "Rutina sin nombre", rpe: rpeVal, note: note, details: cleanLog, workoutNumber: workoutNum, sessionVolume: Number(totalKg.toFixed(2)), duration: durationStr, monthKey: currentMonthKey, yearKey: currentYearKey, weekKey: currentWeekKey }); 
        
        const updates = { 
            "stats.workouts": increment(1), 
            "stats.totalSets": increment(totalSets), 
            "stats.totalReps": increment(totalReps), 
            "stats.totalKg": increment(totalKg), 
            "prs": targetPrs || {}, 
            "lastWorkoutDate": serverTimestamp() 
        }; 
        
        // Empaquetar los records de series en la actualizacion de Firestore
        Object.assign(updates, maxPerSetUpdates);
        
        updates[`stats_week_${currentWeekKey}.kg`] = increment(totalKg); updates[`stats_week_${currentWeekKey}.workouts`] = increment(1); updates[`stats_week_${currentWeekKey}.reps`] = increment(totalReps); 
        updates[`stats_month_${currentMonthKey}.kg`] = increment(totalKg); updates[`stats_month_${currentMonthKey}.workouts`] = increment(1); updates[`stats_month_${currentMonthKey}.reps`] = increment(totalReps); updates[`stats_month_${currentMonthKey}.sets`] = increment(totalSets); 
        updates[`stats_year_${currentYearKey}.kg`] = increment(totalKg); updates[`stats_year_${currentYearKey}.workouts`] = increment(1); updates[`stats_year_${currentYearKey}.reps`] = increment(totalReps); 
        
        for (const [muscle, count] of Object.entries(muscleCounts)) { updates[`muscleStats.${muscle}`] = increment(count); } 
        
        await updateDoc(doc(db, "users", finalUid), updates); 
        compressAndCleanupWorkouts(finalUid); 
        
        if(activeWorkout.ghostUid) showToast(`✅ Entreno guardado en perfil del cliente.`);
        else showToast(`🏆 ¡Entreno nº ${workoutNum} completado! Tiempo: ${durationStr}`); 
        
        localStorage.removeItem('fit_active_workout'); 
        activeWorkout = null; 
        document.getElementById('active-workout-bar').classList.add('hidden'); 
        if (durationInt) clearInterval(durationInt); 
        if (wakeLock) { await wakeLock.release(); wakeLock = null; } 
        
        if(finalUid !== currentUser.uid) {
             window.openCoachView(finalUid, selectedUserObj);
        } else {
             window.switchTab('routines-view'); 
        }

    } catch (error) { 
        console.error("Error finish:", error); 
        alert("Error crítico al guardar. Revisa tu conexión."); 
    } 
};


window.openProgress = async () => { const m = document.getElementById('modal-progress'); const s = document.getElementById('progress-select'); s.innerHTML = '<option>Cargando datos...</option>'; window.openModal('modal-progress'); try { const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid))); const recentWorkouts = snap.docs.map(d => d.data()); let compressed = userData.compressedHistory || []; const uniqueExercises = new Set(); recentWorkouts.forEach(w => { if (w.details) w.details.forEach(ex => uniqueExercises.add(ex.n)); }); compressed.forEach(c => uniqueExercises.add(c.n)); if (uniqueExercises.size === 0) { s.innerHTML = '<option>Sin historial</option>'; return; } s.innerHTML = '<option value="">-- Selecciona Ejercicio --</option>'; Array.from(uniqueExercises).sort().forEach(exName => { const opt = document.createElement('option'); opt.value = exName; opt.innerText = exName; s.appendChild(opt); }); window.fullHistoryCache = { recent: recentWorkouts, compressed: compressed }; } catch (e) { s.innerHTML = '<option>Error cargando</option>'; } };
window.renderProgressChart = (exName) => { if (!exName || !window.fullHistoryCache) return; const ctx = document.getElementById('progressChart'); if (progressChart) progressChart.destroy(); const rawPoints = []; window.fullHistoryCache.compressed.forEach(c => { if(c.n === exName) { rawPoints.push({ date: c.d * 1000, vol: c.v, maxW: c.w, rm: c.w / (1.0278 - (0.0278 * c.r)) }); } }); window.fullHistoryCache.recent.forEach(w => { const ex = w.details?.find(d => d.n === exName); if(ex) { let tv = 0, mw = 0, bestRm = 0; ex.s.forEach(set => { const weight = parseFloat(set.w)||0; const reps = parseInt(set.r)||0; tv += weight*reps; if(weight > mw) mw = weight; if(weight > 0 && reps > 0) { const r = weight / (1.0278 - (0.0278 * reps)); if(r > bestRm) bestRm = r; } }); if(tv > 0) { rawPoints.push({ date: w.date.seconds * 1000, vol: tv, maxW: mw, rm: bestRm }); } } }); rawPoints.sort((a,b) => a.date - b.date); const labels = rawPoints.map(p => new Date(p.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })); const volData = rawPoints.map(p => p.vol); const rmData = rawPoints.map(p => Math.round(p.rm)); const prData = rawPoints.map(p => p.maxW); progressChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Volumen (Kg)', data: volData, borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)', yAxisID: 'y', tension: 0.4, fill: true, pointRadius: 3 }, { label: '1RM Est.', data: rmData, borderColor: '#ffaa00', yAxisID: 'y1', tension: 0.3, pointRadius: 4 }, { label: 'Peso Máx', data: prData, borderColor: '#ff3333', borderDash: [5, 5], yAxisID: 'y1', tension: 0.3, pointRadius: 2 } ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { type: 'linear', display: true, position: 'left', grid: { color: '#333' } }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }, x: { ticks: { color: '#888', maxRotation: 45, minRotation: 0 } } } } }); };
window.toggleAdminMode = (mode) => { document.getElementById('tab-users').classList.toggle('active', mode==='users'); document.getElementById('tab-lib').classList.toggle('active', mode==='lib'); document.getElementById('tab-plans').classList.toggle('active', mode==='plans'); document.getElementById('admin-users-card').classList.toggle('hidden', mode!=='users'); document.getElementById('admin-lib-card').classList.toggle('hidden', mode!=='lib'); document.getElementById('admin-plans-card').classList.toggle('hidden', mode!=='plans'); if(mode==='users') window.loadAdminUsers(); if(mode==='lib') window.loadAdminLibrary(); if(mode==='plans') window.loadAdminPlans(); };
window.loadAdminUsers = async (forceRefresh = false) => { const l = document.getElementById('admin-list'); if (adminUsersCache && !forceRefresh) { renderAdminList(adminUsersCache); return; } l.innerHTML = '↻ Cargando...'; try { let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const s = await getDocs(q); adminUsersCache = s.docs.map(d => ({id: d.id, ...d.data()})); renderAdminList(adminUsersCache); } catch (e) { l.innerHTML = 'Error de permisos o conexión.'; console.log(e); } };
function renderAdminList(usersList) { 
    const l = document.getElementById('admin-list'); 
    l.innerHTML = ''; 

    if(userData.role === 'admin') { 
        const globalNoticeBtn = document.createElement('button'); 
        globalNoticeBtn.className = 'btn'; 
        globalNoticeBtn.style.cssText = "width:100%; margin-bottom:15px; background:var(--warning-color); color:black; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px;"; 
        globalNoticeBtn.innerHTML = "📢 CREAR AVISO PARA TODOS"; 
        globalNoticeBtn.onclick = () => window.openNoticeEditor('GLOBAL'); 
        l.appendChild(globalNoticeBtn); 
    } 

    usersList.sort((a, b) => { 
        const dateA = a.lastWorkoutDate ? a.lastWorkoutDate.seconds : 0; 
        const dateB = b.lastWorkoutDate ? b.lastWorkoutDate.seconds : 0; 
        return dateB - dateA; 
    }); 

    usersList.forEach(u => { 
        let activeClass = ""; 
        if (u.lastWorkoutDate) { 
            const last = u.lastWorkoutDate.toDate ? u.lastWorkoutDate.toDate() : new Date(u.lastWorkoutDate.seconds * 1000); 
            const today = new Date(); 
            const isToday = last.getDate() === today.getDate() && last.getMonth() === today.getMonth() && last.getFullYear() === today.getFullYear(); 
            const seenSeconds = u.lastWorkoutSeen ? u.lastWorkoutSeen.seconds : 0; 
            const workoutSeconds = u.lastWorkoutDate.seconds; 
            if (isToday && (workoutSeconds > seenSeconds)) activeClass = "avatar-active-today"; 
        } 

        const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar ${activeClass}">` : `<div class="mini-avatar-placeholder ${activeClass}">${u.name.charAt(0).toUpperCase()}</div>`; 
        
        let rowClass = "admin-user-row"; 
        if(u.id === currentUser.uid) rowClass += " is-me"; 
        if(u.role === 'assistant') rowClass += " is-coach"; 
        
        const btnNotice = `<button class="btn-outline btn-small" style="margin:0; width:40px; border-color:#ffaa00; color:#ffaa00; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation(); window.openNoticeEditor('${u.id}')">📢</button>`; 
        
        const div = document.createElement('div'); 
        div.className = rowClass; 
        
        // --- AQUÍ ESTÁ EL CAMBIO PARA EL ROJO ---
        if(u.id === currentUser.uid) {
            // Sobreescribimos el borde a ROJO y un fondo rojizo suave
            div.style.borderColor = "#ff3333"; 
            div.style.backgroundColor = "rgba(255, 51, 51, 0.1)"; 
        }
        // ----------------------------------------

        div.innerHTML=`${avatarHtml}<div style="overflow:hidden;"><div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:white; display:flex; align-items:center;">${u.name} ${u.role === 'assistant' ? '🛡️' : ''}</div><div style="font-size:0.75rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div></div><div style="display:flex; gap:8px;">${btnNotice}<button class="btn-outline btn-small" style="margin:0; border-color:#444; color:#ccc;" onclick="window.openCoachView('${u.id}', null)">⚙️</button></div>`; 
        l.appendChild(div); 
    }); 
}
window.loadAdminLibrary = async () => { const l = document.getElementById('admin-lib-list'); l.innerHTML = '↻ Cargando...'; try { const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name); const s = await getDocs(collection(db, "routines")); l.innerHTML = ''; const createBtn = document.createElement('button'); createBtn.className = 'btn'; createBtn.style.cssText = "width:100%; margin-bottom:15px; background:var(--accent-color); color:black; font-weight:bold;"; createBtn.innerText = "+ CREAR NUEVA RUTINA"; createBtn.onclick = () => { window.openEditor(); }; l.appendChild(createBtn); s.forEach(d => { const r = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item"; let author = r.uid === currentUser.uid ? "Mía (Admin)" : (userMap[r.uid] || "Admin"); div.innerHTML = `<div style="flex:1;"><b>${r.name}</b><br><span style="font-size:0.7rem; color:#666;">Creado por: ${author}</span></div><div style="display:flex; gap:5px;"><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666; color:white;" onclick="window.cloneRoutine('${d.id}')" title="Clonar Rutina">🖨</button><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666; color:white;" onclick="window.openEditor('${d.id}')" title="Editar">✏️</button><button class="btn-small btn" style="margin:0; width:auto;" onclick="window.initMassAssignRoutine('${d.id}')" title="Enviar a Atletas">📤</button><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666;" onclick="window.viewRoutineFullDetails('${d.id}')" title="Ver Detalle">👁️</button><button class="btn-small btn-danger" style="margin:0; width:auto; border:none;" onclick="delRoutine('${d.id}')" title="Borrar">🗑️</button></div>`; l.appendChild(div); }); } catch (e) { l.innerHTML = 'Error.'; } };
window.viewRoutineFullDetails = async (rid) => { try { const docSnap = await getDoc(doc(db, "routines", rid)); if(!docSnap.exists()) return alert("Rutina no encontrada"); const r = docSnap.data(); let assignedNamesHtml = '<div style="color:#666; font-size:0.8rem;">Ningún atleta asignado.</div>'; if(r.assignedTo && r.assignedTo.length > 0) { let names = []; if(adminUsersCache) { names = r.assignedTo.map(uid => { const found = adminUsersCache.find(u => u.id === uid); return found ? found.name : "Usuario desconocido"; }); } else { names = r.assignedTo.map(() => "Usuario (ID)"); } assignedNamesHtml = `<div style="display:flex; flex-wrap:wrap; gap:5px;">${names.map(n => `<span class="badge green">${n}</span>`).join('')}</div>`; } let html = `<div style="margin-bottom:15px;"><h4 style="color:#fff; margin-bottom:5px;">📋 Ejercicios:</h4><ul style="padding-left:20px; color:#ddd;">`; r.exercises.forEach(ex => { const exName = ex.n || ex; const sets = ex.series || 5; const reps = ex.reps || "20-16-16-16-16"; const superset = ex.s ? ' <span style="color:var(--accent-color); font-weight:bold;">[SS]</span>' : ''; html += `<li style="margin-bottom:8px;"><b>${exName}</b> ${superset}<br><span style="font-size:0.8rem; color:#888;">${sets} series x ${reps}</span></li>`; }); html += `</ul></div>`; html += `<div style="border-top:1px solid #333; padding-top:10px;"><h4 style="color:#fff; margin-bottom:5px;">👥 Asignada a:</h4>${assignedNamesHtml}</div>`; document.getElementById('detail-title').innerText = r.name; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details'); } catch(e) { console.error(e); alert("Error cargando detalles"); } };
window.initMassAssignRoutine = async (rid) => { assignMode = 'routine'; selectedRoutineForMassAssign = rid; const list = document.getElementById('assign-users-list'); window.openModal('modal-assign-plan'); try { const snap = await getDoc(doc(db, "routines", rid)); if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Enviar "${snap.data().name}" a:`; let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const uSnap = await getDocs(q); list.innerHTML = ''; uSnap.forEach(d => { const u = d.data(); if (u.role === 'athlete') { const div = document.createElement('div'); div.className = "selector-item user-select-card"; div.onclick = (e) => { if (e.target.type !== 'checkbox') { const cb = div.querySelector('input'); cb.checked = !cb.checked; } if (div.querySelector('input').checked) { div.style.backgroundColor = 'rgba(255, 51, 51, 0.2)'; div.style.border = '1px solid var(--accent-color)'; div.classList.add('active-selection'); } else { div.style.backgroundColor = 'transparent'; div.style.border = '1px solid #333'; div.classList.remove('active-selection'); } }; div.innerHTML = `<input type="checkbox" class="user-mass-check selector-checkbox" value="${d.id}" id="u-${d.id}" style="pointer-events:none;"><label class="selector-label" style="pointer-events:none;">${u.name}</label>`; list.appendChild(div); } }); } catch(e) { console.error(e); } };
window.loadAdminPlans = async () => { const list = document.getElementById('admin-plans-list'); const selector = document.getElementById('plan-routine-selector'); selector.innerHTML = '<div style="padding:15px; color:#666; text-align:center;">↻ Cargando...</div>'; try { const routinesSnap = await getDocs(collection(db, "routines")); selector.innerHTML = ''; routinesSnap.forEach(d => { const div = document.createElement('div'); div.className = "selector-item"; div.style.display = "flex"; div.style.alignItems = "center"; div.innerHTML = `<div class="custom-check-indicator" style="width: 24px; height: 24px; min-width: 24px; border: 2px solid #555; border-radius: 6px; margin-right: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.1s ease; pointer-events: none; background: transparent; color: white; font-weight: bold; font-size: 14px;"></div><input type="checkbox" class="plan-check" value="${d.id}" style="display:none;"><div class="selector-label" style="pointer-events:none; flex:1;">${d.data().name}</div>`; div.onclick = function() { const input = this.querySelector('input'); const indicator = this.querySelector('.custom-check-indicator'); input.checked = !input.checked; if(input.checked) { indicator.style.backgroundColor = '#ff3333'; indicator.style.borderColor = '#ff3333'; indicator.innerHTML = '✓'; indicator.style.boxShadow = '0 0 10px rgba(255, 51, 51, 0.4)'; this.style.backgroundColor = 'rgba(255, 51, 51, 0.1)'; this.style.borderColor = '#500'; } else { indicator.style.backgroundColor = 'transparent'; indicator.style.borderColor = '#555'; indicator.innerHTML = ''; indicator.style.boxShadow = 'none'; this.style.backgroundColor = '#222'; this.style.borderColor = '#333'; } }; selector.appendChild(div); }); const plansSnap = await getDocs(collection(db, "plans")); list.innerHTML = ''; if(plansSnap.empty) { list.innerHTML = "<div style='text-align:center; padding:20px; color:#666;'>No hay planes creados.</div>"; return; } const uSnap = await getDocs(collection(db, "users")); const userMap = {}; uSnap.forEach(u => userMap[u.id] = u.data().name); plansSnap.forEach(d => { const p = d.data(); const div = document.createElement('div'); div.className = "assigned-routine-item"; let author = p.createdBy === currentUser.uid ? "Mía (Admin)" : (userMap[p.createdBy] || "Admin"); div.innerHTML = `<div style="flex:1;"><b>${p.name}</b><br><span style="font-size:0.7rem; color:#666;">Creado por: ${author} • ${p.routines.length} Rutinas</span></div><div style="display:flex; gap:5px;"><button class="btn-small btn-outline" style="margin:0; width:auto; border-color:#666;" onclick="window.viewPlanContent('${p.name}', '${d.id}')">👁️</button><button class="btn-small btn" style="margin:0; width:auto;" onclick="window.openAssignPlanModal('${d.id}')">📤</button><button class="btn-small btn-danger" style="margin:0; width:auto; border:none;" onclick="window.deletePlan('${d.id}')">🗑️</button></div>`; list.appendChild(div); }); } catch(e) { console.error("Error loading plans:", e); } };
window.viewPlanContent = async (planName, planId) => { const snap = await getDoc(doc(db, "plans", planId)); if(!snap.exists()) return; const p = snap.data(); let html = `<ul style="padding-left:20px; margin-top:10px;">`; if(allRoutinesCache.length === 0) { const rSnap = await getDocs(collection(db, "routines")); rSnap.forEach(r => allRoutinesCache.push({id:r.id, ...r.data()})); } p.routines.forEach(rid => { const rObj = allRoutinesCache.find(x => x.id === rid); html += `<li style="margin-bottom:5px; color:#ddd;">${rObj ? rObj.name : "Rutina no encontrada"}</li>`; }); html += `</ul>`; document.getElementById('detail-title').innerText = planName; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details'); };
window.createPlan = async () => { const name = document.getElementById('new-plan-name').value; const checks = document.querySelectorAll('.plan-check:checked'); if(!name || checks.length === 0) return alert("Pon un nombre y selecciona rutinas"); await addDoc(collection(db, "plans"), { name: name, routines: Array.from(checks).map(c => c.value), createdBy: currentUser.uid }); alert("Plan Creado"); document.getElementById('new-plan-name').value = ''; window.loadAdminPlans(); };
window.deletePlan = async (id) => { if(confirm("¿Borrar plan?")) { await deleteDoc(doc(db, "plans", id)); window.loadAdminPlans(); } };
window.openAssignPlanModal = async (planId) => { assignMode = 'plan'; selectedPlanForMassAssign = planId; const list = document.getElementById('assign-users-list'); window.openModal('modal-assign-plan'); try { const snap = await getDoc(doc(db, "plans", planId)); if (snap.exists()) document.getElementById('assign-plan-title').innerText = `Asignar "${snap.data().name}" a:`; let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const uSnap = await getDocs(q); list.innerHTML = ''; uSnap.forEach(d => { const u = d.data(); if (u.role === 'athlete') { const div = document.createElement('div'); div.className = "selector-item user-select-card"; div.onclick = (e) => { if (e.target.type !== 'checkbox') { const cb = div.querySelector('input'); cb.checked = !cb.checked; } if (div.querySelector('input').checked) { div.style.backgroundColor = 'rgba(255, 51, 51, 0.2)'; div.style.border = '1px solid var(--accent-color)'; div.classList.add('active-selection'); } else { div.style.backgroundColor = 'transparent'; div.style.border = '1px solid #333'; div.classList.remove('active-selection'); } }; div.innerHTML = `<input type="checkbox" class="user-mass-check selector-checkbox" value="${d.id}" id="u-${d.id}" style="pointer-events:none;"><label class="selector-label" style="pointer-events:none;">${u.name}</label>`; list.appendChild(div); } }); } catch(e) { console.error(e); } };
window.distributePlan = async () => { const checks = document.querySelectorAll('.user-mass-check:checked'); if(checks.length === 0) return alert("Selecciona al menos un cliente."); const userIds = Array.from(checks).map(c => c.value); const btn = document.querySelector('#modal-assign-plan .btn'); const originalText = btn.innerText; btn.innerText = "ENVIANDO..."; btn.disabled = true; try { if (assignMode === 'plan' && selectedPlanForMassAssign) { const planSnap = await getDoc(doc(db, "plans", selectedPlanForMassAssign)); const planData = planSnap.data(); const routinesList = planData.routines; const promisesRoutine = routinesList.map(rid => updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(...userIds) })); await Promise.all(promisesRoutine); const promisesUsers = userIds.map(uid => updateDoc(doc(db, "users", uid), { routineOrder: routinesList })); await Promise.all(promisesUsers); alert(`✅ Plan asignado y ordenado correctamente.`); } else if (assignMode === 'routine' && selectedRoutineForMassAssign) { await updateDoc(doc(db, "routines", selectedRoutineForMassAssign), { assignedTo: arrayUnion(...userIds) }); const promisesOrder = userIds.map(uid => updateDoc(doc(db, "users", uid), { routineOrder: arrayUnion(selectedRoutineForMassAssign) })); await Promise.all(promisesOrder); alert(`✅ Rutina enviada correctamente.`); } window.closeModal('modal-assign-plan'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = originalText; btn.disabled = false; } };

window.viewWorkoutDetails = (wId, routineName, detailsStr, noteStr, timeStr = "") => { try { editingHistoryId = wId; currentHistoryDetails = JSON.parse(decodeURIComponent(detailsStr)); const note = decodeURIComponent(noteStr || ""); let timeHtml = timeStr ? `<div style="text-align:center; color:#666; font-size:0.75rem; margin-bottom:10px;">Finalizado: ${timeStr}</div>` : ""; let html = `<br>${timeHtml}<br><div class="detail-note-box">📝 ${note || "Sin notas."}</div><br><div id="history-details-container"><br>${renderHistoryHTML(currentHistoryDetails)}<br></div><br><div style="margin-top:20px; text-align:center;"><br><button id="btn-edit-history" class="btn-outline" style="width:auto; border-color:var(--accent-color); color:var(--accent-color);" onclick="window.enableHistoryEdit()">✏️ EDITAR DATOS</button><br><button id="btn-save-history" class="btn hidden" style="width:auto; margin-top:10px;" onclick="window.saveHistoryChanges()">💾 GUARDAR CAMBIOS</button><br></div><br>`; document.getElementById('detail-title').innerText = routineName; document.getElementById('detail-content').innerHTML = html; window.openModal('modal-details'); } catch (e) { console.error(e); alert("Error cargando detalles."); } };
function renderHistoryHTML(details) { let html = ''; details.forEach((ex, exIdx) => { const name = ex.n || ex; const sets = ex.s || []; const exNoteHtml = ex.note ? `<div style="font-size:0.75rem; color:#aaa; font-style:italic; margin-top:5px; padding:4px; border-left:2px solid #555; background:#111;">📝 ${ex.note}</div>` : ''; html += `<div class="detail-exercise-card"><div class="detail-exercise-title">${name}</div>${exNoteHtml}<div class="detail-sets-grid" id="hist-grid-${exIdx}">`; if (sets.length > 0) { sets.forEach((s, i) => { const num = s.numDisplay || (i + 1); const w = s.w || 0; const r = s.r || 0; const dropStyle = s.isDrop ? 'border: 1px solid var(--warning-color); background: rgba(255, 170, 0, 0.15);' : ''; html += `<div class="detail-set-badge history-set-item" style="${dropStyle}" data-ex="${exIdx}" data-set="${i}"><br><span class="detail-set-num">#${num}</span><br><span class="set-view"><b>${r}</b> <span style="color:#666">x</span> ${w}k</span><br></div>`; }); } else { html += `<div style="font-size:0.7rem; color:#666;">Sin datos.</div>`; } html += `</div></div>`; }); return html; }

window.enableHistoryEdit = () => { 
    // Reemplaza texto por inputs y añade botón para nueva serie
    const grids = document.querySelectorAll('.detail-sets-grid');
    grids.forEach((grid, exIdx) => {
        // Añadir inputs a las existentes
        const items = grid.querySelectorAll('.history-set-item');
        items.forEach(item => {
            const setIdx = item.getAttribute('data-set');
            const setObj = currentHistoryDetails[exIdx].s[setIdx];
            item.innerHTML = `<br><div style="display:flex; gap:5px; align-items:center;"><br><input type="number" class="hist-edit-reps" value="${setObj.r}" style="width:40px; padding:2px; margin:0; text-align:center; background:#000; border:1px solid #444;" inputmode="decimal"><br><span style="color:#666">x</span><br><input type="number" class="hist-edit-weight" value="${setObj.w}" style="width:40px; padding:2px; margin:0; text-align:center; background:#000; border:1px solid #444;" inputmode="decimal"><br></div><br>`;
        });
        // Botón añadir serie
        if(!grid.querySelector('.btn-add-hist-set')) {
             const addBtn = document.createElement('button');
             addBtn.className = 'btn-small btn-outline btn-add-hist-set';
             addBtn.style.cssText = "grid-column: 1 / -1; margin-top:5px; border-style:dashed; color:#888;";
             addBtn.innerText = "+ AÑADIR SERIE";
             addBtn.onclick = () => window.addHistorySet(exIdx);
             grid.appendChild(addBtn);
        }
    });
    document.getElementById('btn-edit-history').classList.add('hidden'); 
    document.getElementById('btn-save-history').classList.remove('hidden'); 
};

// Nueva función para añadir series al historial
window.addHistorySet = (exIdx) => {
    // 1. Guardar estado actual de los inputs antes de redibujar
    syncHistoryInputsState();
    
    // 2. Añadir nueva serie al modelo
    const newSet = { r: 0, w: 0, numDisplay: (currentHistoryDetails[exIdx].s.length + 1).toString() };
    currentHistoryDetails[exIdx].s.push(newSet);
    
    // 3. Redibujar y reactivar edición
    const container = document.getElementById('history-details-container');
    container.innerHTML = `<br>${renderHistoryHTML(currentHistoryDetails)}<br>`;
    window.enableHistoryEdit();
};

function syncHistoryInputsState() {
    const items = document.querySelectorAll('.history-set-item');
    items.forEach(item => {
        const exIdx = item.getAttribute('data-ex');
        const setIdx = item.getAttribute('data-set');
        const rInput = item.querySelector('.hist-edit-reps');
        const wInput = item.querySelector('.hist-edit-weight');
        if(rInput && wInput) {
            currentHistoryDetails[exIdx].s[setIdx].r = parseInt(rInput.value) || 0;
            currentHistoryDetails[exIdx].s[setIdx].w = parseFloat(wInput.value) || 0;
        }
    });
}

window.saveHistoryChanges = async () => { 
    syncHistoryInputsState(); // Asegurar últimos datos
    try { 
        const btn = document.getElementById('btn-save-history'); 
        btn.innerText = "⏳ GUARDANDO..."; 
        await updateDoc(doc(db, "workouts", editingHistoryId), { details: currentHistoryDetails }); 
        alert("✅ Historial actualizado."); 
        window.closeModal('modal-details'); 
        if(document.getElementById('profile-view').classList.contains('active')) window.loadProfile(); 
        if(document.getElementById('coach-detail-view').classList.contains('active')) window.openCoachView(selectedUserCoach, selectedUserObj); 
    } catch(e) { console.error(e); alert("Error al guardar cambios."); } 
};

window.openNoticeEditor = async (uid) => { noticeTargetUid = uid; document.getElementById('notice-title').value = ''; document.getElementById('notice-text').value = ''; document.getElementById('notice-img-file').value = ''; document.getElementById('notice-link').value = ''; const modalTitle = document.getElementById('notice-modal-title'); modalTitle.innerText = uid === 'GLOBAL' ? '📢 CREAR AVISO PARA TODOS' : '📢 AVISO INDIVIDUAL'; try { let existing = null; if(uid === 'GLOBAL') { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) existing = snap.data(); } else { const snap = await getDoc(doc(db, "users", uid)); if(snap.exists() && snap.data().coachNotice) existing = snap.data().coachNotice; } if(existing) { document.getElementById('notice-title').value = existing.title || ''; document.getElementById('notice-text').value = existing.text || ''; document.getElementById('notice-link').value = existing.link || ''; } } catch(e) { console.error(e); } window.openModal('modal-notice-editor'); };
window.saveNotice = async () => { const t = document.getElementById('notice-title').value; const txt = document.getElementById('notice-text').value; const lnk = document.getElementById('notice-link').value; const fileInp = document.getElementById('notice-img-file'); if(!t || !txt) return alert("Faltan datos."); const btn = document.getElementById('btn-save-notice'); btn.innerText = "SUBIENDO..."; btn.disabled = true; try { let imgUrl = ""; if(fileInp.files.length > 0) { const file = fileInp.files[0]; const snapshot = await uploadBytes(ref(storage, `notices/${noticeTargetUid}/${Date.now()}.jpg`), file); imgUrl = await getDownloadURL(snapshot.ref); } else { if(noticeTargetUid === 'GLOBAL') { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) imgUrl = snap.data().img || ""; } else { const snap = await getDoc(doc(db, "users", noticeTargetUid)); if(snap.exists() && snap.data().coachNotice) imgUrl = snap.data().coachNotice.img || ""; } } const noticeData = { id: Date.now().toString(), title: t, text: txt, img: imgUrl, link: lnk, date: new Date().toISOString(), active: true }; if(noticeTargetUid === 'GLOBAL') { await setDoc(doc(db, "settings", "globalNotice"), noticeData); alert("✅ Aviso Global"); } else { await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: noticeData }); alert("✅ Aviso Individual"); } window.closeModal('modal-notice-editor'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "PUBLICAR AVISO"; btn.disabled = false; } };
window.deleteNotice = async () => { if(!confirm("¿Borrar?")) return; try { if(noticeTargetUid === 'GLOBAL') { await deleteDoc(doc(db, "settings", "globalNotice")); } else { await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: null }); } alert("🗑️ Eliminado"); window.closeModal('modal-notice-editor'); } catch(e) { alert("Error"); } };
async function checkNotices() { if(userData.role === 'admin' || userData.role === 'assistant') return; if(userData.coachNotice && userData.coachNotice.active) { showNoticeModal(userData.coachNotice, "MENSAJE DEL COACH", 'INDIVIDUAL'); return; } try { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) { const notice = snap.data(); if(!notice.active) return; const dismissedId = localStorage.getItem('dismissed_global_notice_id'); if(notice.id && notice.id !== dismissedId) { showNoticeModal(notice, "AVISO DE LA COMUNIDAD", 'GLOBAL'); } } } catch(e) {} }
function showNoticeModal(notice, headerTitle, type) { currentNoticeId = notice.id; currentNoticeType = type; document.getElementById('viewer-header').innerText = headerTitle; document.getElementById('viewer-title').innerText = notice.title; document.getElementById('viewer-text').innerText = notice.text; const imgEl = document.getElementById('viewer-img'); if(notice.img) { imgEl.src = notice.img; imgEl.classList.remove('hidden'); imgEl.onclick = () => window.viewFullImage(notice.img); } else { imgEl.classList.add('hidden'); } const linkBtn = document.getElementById('viewer-link-btn'); if(notice.link) { linkBtn.classList.remove('hidden'); linkBtn.onclick = () => window.open(notice.link, '_blank'); } else { linkBtn.classList.add('hidden'); } window.openModal('modal-notice-viewer'); }
window.dismissNotice = async () => { if (currentNoticeType === 'GLOBAL') { if(currentNoticeId) localStorage.setItem('dismissed_global_notice_id', currentNoticeId); } else if (currentNoticeType === 'INDIVIDUAL') { try { await updateDoc(doc(db, "users", currentUser.uid), { "coachNotice.active": false }); if(userData.coachNotice) userData.coachNotice.active = false; } catch(e) {} } window.closeModal('modal-notice-viewer'); };

window.openCoachView = async (uid, u) => { 
    selectedUserCoach=uid; 
    updateDoc(doc(db, "users", uid), { lastWorkoutSeen: serverTimestamp() }).catch(e => console.log("Error marking seen", e)); 
    const freshSnap = await getDoc(doc(db, "users", uid)); 
    const freshU = freshSnap.data(); 
    selectedUserObj = freshU; 
    switchTab('coach-detail-view'); 
    document.getElementById('coach-user-name').innerText=freshU.name + (freshU.role === 'assistant' ? ' (Coach 🛡️)' : ''); 
    document.getElementById('coach-user-email').innerText=freshU.email; 
    document.getElementById('coach-user-meta').innerText = `${freshU.gender === 'female' ? '♀️' : '♂️'} ${freshU.age} años • ${freshU.height} cm`; 
    const telegramHtml = freshU.telegram ? `<div style="font-size:0.8rem; color:#0088cc; margin-top:5px;">Telegram: ${freshU.telegram}</div>` : ''; 
    document.getElementById('coach-user-email').innerHTML += telegramHtml; 
    if(freshU.photo) { document.getElementById('coach-user-img').src = freshU.photo; document.getElementById('coach-user-img').style.display = 'block'; document.getElementById('coach-user-initial').style.display = 'none'; } else { document.getElementById('coach-user-img').style.display = 'none'; document.getElementById('coach-user-initial').style.display = 'block'; document.getElementById('coach-user-initial').innerText = freshU.name.charAt(0).toUpperCase(); } 
    document.getElementById('pending-approval-banner').classList.toggle('hidden', freshU.approved); 
    updateCoachPhotoDisplay('front'); 
    
    const coachPhotoCard = document.getElementById('coach-view-photos'); 
    if (coachPhotoCard) { if (freshU.showPhotos === false) { coachPhotoCard.classList.add('hidden'); } else { coachPhotoCard.classList.remove('hidden'); } } 
    
    const fixCoachChart = (id) => { const c = document.getElementById(id); if(c && c.parentElement) { c.parentElement.style.height = '250px'; c.parentElement.style.marginBottom = '35px'; } }; 
    
    if(freshU.bioHistory && freshU.showBio) { document.getElementById('coach-view-bio').classList.remove('hidden'); fixCoachChart('coachBioChart'); injectChartFilter('coachBioChart', 'window.updateBioChart'); renderFilteredChart('coachBioChart', coachBioChart, freshU.bioHistory, 'muscle', '#00ffff', 90); } else { document.getElementById('coach-view-bio').classList.add('hidden'); } 
    if(freshU.skinfoldHistory && freshU.showSkinfolds) { document.getElementById('coach-view-skinfolds').classList.remove('hidden'); fixCoachChart('coachFatChart'); injectChartFilter('coachFatChart', 'window.updateFatChart'); renderFilteredChart('coachFatChart', coachFatChart, freshU.skinfoldHistory, 'fat', '#ffaa00', 90); } else { document.getElementById('coach-view-skinfolds').classList.add('hidden'); } 
    if(freshU.measureHistory && freshU.showMeasurements) { document.getElementById('coach-view-measures').classList.remove('hidden'); fixCoachChart('coachMeasuresChart'); injectChartFilter('coachMeasuresChart', 'window.updateMeasureChart'); renderFilteredMeasureChart('coachMeasuresChart', coachMeasureChart, freshU.measureHistory, 90); } else { document.getElementById('coach-view-measures').classList.add('hidden'); } 
    
    document.getElementById('coach-toggle-bio').checked = !!freshU.showBio; 
    document.getElementById('coach-toggle-skinfolds').checked = !!freshU.showSkinfolds; 
    document.getElementById('coach-toggle-measures').checked = !!freshU.showMeasurements; 
    document.getElementById('coach-toggle-videos').checked = !!freshU.showVideos; 
    
    const togglePhotos = document.getElementById('coach-toggle-photos'); 
    if (togglePhotos) { togglePhotos.checked = freshU.showPhotos !== false; } 
    
    const existingTg = document.getElementById('coach-telegram-row'); 
    if(existingTg) existingTg.remove(); 
    const videoToggleEl = document.getElementById('coach-toggle-videos'); 
    if(videoToggleEl) { const videoRow = videoToggleEl.closest('div'); const tgRow = document.createElement('div'); tgRow.id = 'coach-telegram-row'; tgRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-top:15px;"; tgRow.innerHTML = `<span>Habilitar Chat Telegram</span><label class="switch"><input type="checkbox" id="coach-toggle-telegram" onchange="window.toggleUserFeature('allowTelegram', this.checked)"><span class="slider"></span></label>`; if(videoRow && videoRow.parentNode) { videoRow.parentNode.insertBefore(tgRow, videoRow.nextSibling); } document.getElementById('coach-toggle-telegram').checked = !!freshU.allowTelegram; } 
    
    const dietSel = document.getElementById('coach-diet-select'); dietSel.innerHTML = '<option value="">-- Sin Dieta --</option>'; AVAILABLE_DIETS.forEach(d => { const opt = new Option(d.name, d.file); if(freshU.dietFile === d.file) opt.selected = true; dietSel.appendChild(opt); }); 
    
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...'; 
    const allRoutinesSnap = await getDocs(collection(db, "routines")); 
    allRoutinesCache = []; 
    const s = document.getElementById('coach-routine-select'); 
    s.innerHTML = '<option value="">Selecciona rutina...</option>'; 
    allRoutinesSnap.forEach(r => { const data = r.data(); allRoutinesCache.push({id: r.id, ...data}); s.add(new Option(data.name, r.id)); }); 
    const pSelect = document.getElementById('coach-plan-select'); pSelect.innerHTML = '<option value="">Selecciona plan...</option>'; const allPlansSnap = await getDocs(collection(db, "plans")); allPlansSnap.forEach(p => pSelect.add(new Option(p.data().name, p.id))); 
    
    const assigned = allRoutinesCache.filter(r => (r.assignedTo || []).includes(uid)); 
    rList.innerHTML = assigned.length ? '' : 'Ninguna rutina.'; 
    assigned.forEach(r => { 
        const div = document.createElement('div'); div.className = "assigned-routine-item"; 
        // BOTÓN MODO ENTRENADOR
        const btnGhost = `<button class="btn-small btn" style="margin:0; width:auto; font-size:0.7rem; background:var(--accent-color); color:#000; margin-right:10px;" onclick="window.startWorkout('${r.id}', '${uid}')">▶️ 🏋🏻‍♂️</button>`;
        div.innerHTML = `<span>${r.name}</span><div style="display:flex;align-items:center;">${btnGhost}<button style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;" onclick="window.unassignRoutine('${r.id}')">❌</button></div>`; 
        rList.appendChild(div); 
    }); 
    
    renderMuscleRadar('coachMuscleChart', freshU.muscleStats || {}); 
    const st = freshU.stats || {}; 
    document.getElementById('coach-stats-text').innerHTML = `<div class="stat-pill"><b>${st.workouts||0}</b><span>ENTRENOS</span></div><div class="stat-pill"><b>${(st.totalKg/1000||0).toFixed(1)}t</b><span>CARGA</span></div><div class="stat-pill"><b>${st.totalReps||0}</b><span>REPS</span></div>`; 
    if(freshU.weightHistory) { fixCoachChart('coachWeightChart'); injectChartFilter('coachWeightChart', 'window.updateWeightChart'); coachChart = renderFilteredChart('coachWeightChart', coachChart, freshU.weightHistory, 'weight', '#ff3333', 90); } 
    
    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...'; 
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid))); 
    hList.innerHTML = wSnap.empty ? 'Sin datos.' : ''; 
    wSnap.docs.map(doc => ({id: doc.id, ...doc.data()})).sort((a,b) => b.date - a.date).slice(0, 10).forEach(d => { 
        let date = '-', infoStr = ''; 
        if(d.date) { const dObj = d.date.seconds ? new Date(d.date.seconds*1000) : d.date.toDate(); date = dObj.toLocaleDateString(); infoStr = d.duration ? `⏱️ ${d.duration}` : dObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); } 
        // BOTÓN BORRAR EN HISTORIAL COACH
        const btnDelete = `<button class="btn-small btn-danger" style="margin:0 5px;" onclick="window.deleteHistoryWorkout('${d.id}')">🗑️</button>`;
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px 110px;"><div>${date}</div><div style="overflow:hidden; text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe === 'Suave' ? '🟢' : (d.rpe === 'Duro' ? '🟠' : '🔴')}</div><div style="text-align:right;"><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.id}', '${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}', '${infoStr}')">Ver</button>${btnDelete}</div></div>`; 
    }); 
};

window.toggleUserFeature = async (field, isActive) => { if(!selectedUserCoach || !selectedUserObj) return; selectedUserObj[field] = isActive; const toggleMap = { 'showBio': 'coach-view-bio', 'showSkinfolds': 'coach-view-skinfolds', 'showMeasurements': 'coach-view-measures' }; if(toggleMap[field]) { const el = document.getElementById(toggleMap[field]); if(el) isActive ? el.classList.remove('hidden') : el.classList.add('hidden'); } if(field === 'showPhotos') { const pCard = document.getElementById('coach-view-photos'); if(pCard) isActive ? pCard.classList.remove('hidden') : pCard.classList.add('hidden'); } try { await updateDoc(doc(db, "users", selectedUserCoach), { [field]: isActive }); console.log(`Updated ${field} to ${isActive}`); } catch (e) { console.error("Error updating toggle:", e); alert("Error al guardar ajuste."); const chk = document.querySelector(`input[onchange*="${field}"]`); if(chk) chk.checked = !isActive; } };
window.assignRoutine = async () => { const sel = document.getElementById('coach-routine-select'); const rid = sel.value; if(!rid || !selectedUserCoach) return alert("Selecciona una rutina"); try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: arrayUnion(rid) }); alert("✅ Rutina enviada."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert(e.message); } };
window.unassignRoutine = async (rid) => { if(!confirm("¿Quitar esta rutina del atleta?")) return; try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: arrayRemove(rid) }); alert("🗑️ Rutina retirada."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert(e.message); } };
window.assignPlan = async () => { const sel = document.getElementById('coach-plan-select'); const pid = sel.value; if(!pid) return; if(!confirm("¿Asignar todo este plan?")) return; try { const snap = await getDoc(doc(db,"plans", pid)); if(!snap.exists()) return; const routines = snap.data().routines || []; const promises = routines.map(rid => updateDoc(doc(db,"routines",rid), { assignedTo: arrayUnion(selectedUserCoach) })); await Promise.all(promises); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: routines }); alert("✅ Plan asignado."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } };
window.approveUser = async () => { if(!selectedUserCoach) return; if(confirm("¿Aprobar acceso a este atleta?")) { await updateDoc(doc(db, "users", selectedUserCoach), { approved: true }); alert("✅ Usuario Aprobado"); window.openCoachView(selectedUserCoach, selectedUserObj); } };
window.deleteUser = async () => { if(!selectedUserCoach) return; const confirmName = prompt(`⚠️ PELIGRO:\nEscribe "BORRAR" para eliminar permanentemente a ${selectedUserObj.name}.\nSe perderán todos sus datos.`); if(confirmName === "BORRAR") { await deleteDoc(doc(db, "users", selectedUserCoach)); alert("Usuario eliminado."); window.loadAdminUsers(true); window.switchTab('admin-view'); } };
window.goToCreateRoutine = () => { window.openEditor(); };
document.getElementById('btn-register').onclick=async()=>{ const secretCode = document.getElementById('reg-code').value; const tgUser = document.getElementById('reg-telegram')?.value || ""; try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value); await setDoc(doc(db,"users",c.user.uid),{ name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode: secretCode, telegram: tgUser, approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false, showPhotos: false }); }catch(e){alert("Error: " + e.message);} };
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
