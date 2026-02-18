import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App v16.2 (Hoisting Fix & Stability)...");

// --- 1. Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW Error:', err));
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
const db = getFirestore(app);
const storage = getStorage(app);

try { enableIndexedDbPersistence(db).catch(() => {}); } catch(e) {}

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

let rankFilterTime = 'all';        
let rankFilterGender = 'all';       
let rankFilterCat = 'kg';           
let adminUsersCache = null; 
let editingHistoryId = null; 
let currentHistoryDetails = null; 

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

let exercisesBatchIndex = 0;
let filteredExercisesList = [];
let exercisesObserver = null;
const BATCH_SIZE = 20;

// ===========================================================
// ⚡ CORE HELPER FUNCTIONS (MOVIDAS ARRIBA PARA EVITAR ERRORES)
// ===========================================================

function checkPhotoVisualReminder() {
    const bannerId = 'photo-missing-banner'; const existing = document.getElementById(bannerId); if(existing) existing.remove();
    if(!userData.photo || userData.photo === "") {
        const div = document.createElement('div'); div.id = bannerId; div.style.cssText = "background: #ffaa00; color: #000; padding: 10px; text-align: center; font-weight: bold; font-size: 0.9rem; cursor: pointer; animation: pulse 2s infinite; margin-top:5px;"; div.innerHTML = "📸 ¡Sube tu foto de perfil para aparecer en el Ranking! (Click aquí)"; div.onclick = () => { switchTab('profile-view'); };
        const header = document.getElementById('main-header'); if(header && header.parentNode) header.parentNode.insertBefore(div, header.nextSibling);
    }
}

function checkPhotoReminder() { if(!userData.photoDay) return; const now = new Date(); const day = now.getDay(); const time = now.toTimeString().substr(0,5); if(day == userData.photoDay && time === userData.photoTime) alert("📸 HORA DE TU FOTO DE PROGRESO 📸"); }

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

async function checkNotices() { 
    if(userData.role === 'admin' || userData.role === 'assistant') return; 
    if(userData.coachNotice && userData.coachNotice.active) { showNoticeModal(userData.coachNotice, "MENSAJE DEL COACH", 'INDIVIDUAL'); return; } 
    try { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) { const notice = snap.data(); if(!notice.active) return; const dismissedId = localStorage.getItem('dismissed_global_notice_id'); if(notice.id && notice.id !== dismissedId) { showNoticeModal(notice, "AVISO DE LA COMUNIDAD", 'GLOBAL'); } } } catch(e) {} 
}

function showNoticeModal(notice, headerTitle, type) { 
    currentNoticeId = notice.id; currentNoticeType = type; 
    const h = document.getElementById('viewer-header'); if(h) h.innerText = headerTitle; 
    const t = document.getElementById('viewer-title'); if(t) t.innerText = notice.title; 
    const txt = document.getElementById('viewer-text'); if(txt) txt.innerText = notice.text; 
    const imgEl = document.getElementById('viewer-img'); 
    if(notice.img) { imgEl.src = notice.img; imgEl.classList.remove('hidden'); imgEl.onclick = () => window.viewFullImage(notice.img); } else { imgEl.classList.add('hidden'); } 
    const linkBtn = document.getElementById('viewer-link-btn'); 
    if(notice.link) { linkBtn.classList.remove('hidden'); linkBtn.onclick = () => window.open(notice.link, '_blank'); } else { linkBtn.classList.add('hidden'); } 
    window.openModal('modal-notice-viewer'); 
}

// ===========================================================
// ⚡ AUTH OBSERVER
// ===========================================================
onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    
    if(user) {
        console.log("✅ Usuario detectado:", user.uid);
        currentUser = user;
        
        // Restauración Segura
        const savedW = localStorage.getItem('fit_active_workout');
        if(savedW && savedW !== "undefined" && savedW !== "null") { 
            try { 
                activeWorkout = JSON.parse(savedW);
                console.log("Recuperado entreno local");
                startTimerMini();
            } catch(e) { 
                console.error("Error corrupto en localStorage, limpiando...", e); 
                localStorage.removeItem('fit_active_workout');
                activeWorkout = null;
            }
        } else {
            activeWorkout = null;
        }

        try {
            const snap = await getDoc(doc(db,"users",user.uid));
            if(snap.exists()){
                userData = snap.data();
                console.log("Datos cargados. Ejecutando helpers...");
                
                // AHORA ES SEGURO LLAMAR A ESTAS FUNCIONES
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
                        console.log("--> Redirigiendo a Entreno Activo");
                        renderWorkout();
                        switchTab('workout-view');
                        showToast("⚡ Sesión restaurada");
                    } else {
                        console.log("--> Redirigiendo a Rutinas");
                        switchTab('routines-view');
                    }
                    
                } else { 
                    alert("Cuenta en revisión."); 
                    signOut(auth); 
                }
            } else {
                console.log("No existe documento de usuario.");
                signOut(auth);
            }
        } catch(e) { 
            console.log("Error crítico en carga inicial:", e); 
            if(loadingScreen) loadingScreen.classList.add('hidden'); 
        }
    } else {
        console.log("Usuario no logueado.");
        if(loadingScreen) loadingScreen.classList.add('hidden');
        switchTab('auth-view');
        document.getElementById('main-header').classList.add('hidden');
        if(communityUnsubscribe) communityUnsubscribe();
    }
});

// --- NAVEGACIÓN ---
let scrollPos = 0;
window.openModal = (id) => { scrollPos = window.pageYOffset; document.body.style.top = `-${scrollPos}px`; document.body.classList.add('modal-open'); const m = document.getElementById(id); if(m) m.classList.add('active'); };
window.closeModal = (id) => { const m = document.getElementById(id); if(m) m.classList.remove('active'); document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos); };
const normalizeText = (text) => { if(!text) return ""; return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
window.toggleElement = (id) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); };

window.switchTab = (t) => {
    const bar = document.getElementById('active-workout-bar');
    if(activeWorkout && t !== 'workout-view') {
        if(bar) {
            bar.classList.remove('hidden');
            if(activeWorkout.targetName) {
                 const timerEl = document.getElementById('bar-timer');
                 if(timerEl) timerEl.innerHTML = `<span style='color:#00ffff'>ENTRENANDO A: ${activeWorkout.targetName}</span>`;
            }
        }
    } else {
        if(bar) bar.classList.add('hidden');
    }

    if (t === 'workout-view') {
        if(!activeWorkout) { t = 'routines-view'; } 
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
function initAudioEngine() { if (!audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); } if (audioCtx.state === 'suspended') { audioCtx.resume(); } }
function playTickSound(isFinal = false) { if(!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime; if (isFinal) { osc.type = 'triangle'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 1); osc.start(now); osc.stop(now + 1); if("vibrate" in navigator) navigator.vibrate([300, 100, 300]); } else { osc.frequency.value = 1000; osc.type = 'sine'; osc.start(now); gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1); osc.stop(now + 0.1); } }
document.body.addEventListener('touchstart', initAudioEngine, {once:true});
document.body.addEventListener('click', initAudioEngine, {once:true});

// --- UTILS ---
function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7); return d.getUTCFullYear() + "_W" + weekNo; }

// --- PERFIL ---
window.loadProfile = async () => {
    if(!userData) return;
    document.getElementById('profile-name').innerText = userData.name;
    if(userData.photo) document.getElementById('avatar-img').src = userData.photo;
    
    // Charts (abreviado)
    const fixChartContainer = (id) => { const c = document.getElementById(id); if(c && c.parentElement) { c.parentElement.style.height = '250px'; c.parentElement.style.marginBottom = '35px'; } };
    if(userData.weightHistory) { fixChartContainer('weightChart'); injectChartFilter('weightChart', 'window.updateWeightChart'); chartInstance = renderFilteredChart('weightChart', chartInstance, userData.weightHistory, 'weight', '#ff3333', 9999); }
    renderMuscleRadar('userMuscleChart', userData.muscleStats || {});

    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    try {
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date).slice(0, 10);
        histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
        workouts.forEach(d => {
            const dateStr = d.date ? new Date(d.date.seconds*1000).toLocaleDateString() : '-';
            const detailsStr = d.details ? encodeURIComponent(JSON.stringify(d.details)) : ""; 
            const noteStr = d.note ? encodeURIComponent(d.note) : "";
            
            const btnVer = d.details ? `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.id}', '${d.routine}', '${detailsStr}', '${noteStr}', '')">🔍</button>` : '';
            const btnDel = `<button class="btn-small btn-danger" style="margin:0 5px; padding:2px 6px;" onclick="window.deleteHistoryWorkout('${d.id}', false)">🗑️</button>`;
            
            histDiv.innerHTML += `<div class="history-row"><div style="color:var(--accent-color); font-weight:bold;">${dateStr}</div><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:5px;">${d.routine}</div><div></div><div style="text-align:right;">${btnVer}${btnDel}</div></div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error."; }
};

window.deleteHistoryWorkout = async (id, isCoachContext) => {
    if(!confirm("⚠️ ¿BORRAR ESTE ENTRENO?\n\nLa próxima vez se usarán los datos del entreno anterior válido.")) return;
    try {
        await deleteDoc(doc(db, "workouts", id));
        alert("✅ Entreno eliminado.");
        if(isCoachContext) window.openCoachView(selectedUserCoach, selectedUserObj);
        else window.loadProfile();
    } catch(e) { alert("Error: " + e.message); }
};

// --- WORKOUT ENGINE (PROXY) ---
function saveLocalWorkout() { 
    if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); 
}

window.startWorkout = async (rid, targetUid = null, targetName = null) => {
    if(activeWorkout) { if(!confirm("⚠️ Ya tienes un entreno en curso. ¿Iniciar este nuevo?")) return; }
    
    const finalUid = targetUid || currentUser.uid;
    const isProxy = !!targetUid;

    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {} }
    
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        let lastWorkoutData = null; 
        const q = query(collection(db, "workouts"), where("uid", "==", finalUid)); 
        const wSnap = await getDocs(q); 
        const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); 
        if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;
        
        const now = Date.now(); initAudioEngine();
        
        activeWorkout = { 
            name: r.name, 
            startTime: now, 
            targetUid: finalUid, 
            targetName: targetName, 
            exs: r.exercises.map(exObj => { 
                const isString = typeof exObj === 'string'; 
                const name = isString ? exObj : exObj.n; 
                const isSuperset = isString ? false : (exObj.s || false); 
                const customSeriesNum = isString ? 5 : (parseInt(exObj.series) || 5); 
                const customRepsPattern = isString ? "20-16-16-16-16" : (exObj.reps || "20-16-16-16-16"); 
                const repsArray = customRepsPattern.split('-'); 
                const data = getExerciseData(name); 
                let sets = Array(customSeriesNum).fill().map((_, i) => ({ r: repsArray[i] ? parseInt(repsArray[i]) : parseInt(repsArray[repsArray.length - 1]), w: 0, d: false, prev: '-', numDisplay: (i + 1).toString() })); 
                if(lastWorkoutData) { 
                    const prevEx = lastWorkoutData.find(ld => ld.n === name); 
                    if(prevEx && prevEx.s) { 
                        sets = sets.map((s, i) => { 
                            if(prevEx.s[i]) { 
                                const dLabel = prevEx.s[i].isDrop ? ' (D)' : ''; 
                                s.prev = `${prevEx.s[i].r}x${prevEx.s[i].w}kg${dLabel}`; 
                            } 
                            return s; 
                        }); 
                    } 
                } 
                return { n:name, img:data.img, mInfo: data.mInfo, type: data.type, video: data.v, sets: sets, superset: isSuperset, note: "" }; 
            }) 
        };
        
        saveLocalWorkout(); 
        renderWorkout(); 
        switchTab('workout-view'); 
        startTimerMini();
        
        if(isProxy) showToast(`💪 Entrenando a: ${targetName}`);

    } catch(e) { console.error(e); alert("Error iniciando: " + e.message); }
};

window.cancelWorkout = () => { 
    if(confirm("⚠ ¿CANCELAR ENTRENO?")) { 
        activeWorkout = null; 
        localStorage.removeItem('fit_active_workout'); 
        if(durationInt) clearInterval(durationInt); 
        document.getElementById('active-workout-bar').classList.add('hidden');
        if(document.getElementById('coach-detail-view').classList.contains('active') || selectedUserCoach) {
             window.switchTab('coach-detail-view');
        } else {
             window.switchTab('routines-view'); 
        }
    } 
};

window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        const note = document.getElementById('workout-notes')?.value || "";
        const targetUid = activeWorkout.targetUid || currentUser.uid;
        
        let totalSets = 0, totalReps = 0, totalKg = 0; let muscleCounts = {};
        const cleanLog = activeWorkout.exs.map(e => {
            const completedSets = e.sets.filter(set => set.d).map(set => {
                const r = parseInt(set.r) || 0; const w = parseFloat(set.w) || 0; 
                totalSets++; totalReps += r; totalKg += (r * w);
                const mName = e.mInfo?.main || "General"; muscleCounts[mName] = (muscleCounts[mName] || 0) + 1;
                return { r, w, isDrop: !!set.isDrop, numDisplay: String(set.numDisplay || "") };
            });
            return { n: e.n, s: completedSets, superset: !!e.superset, note: e.note || "" };
        }).filter(e => e.s.length > 0);

        if (cleanLog.length === 0) { alert("No hay series completadas."); return; }

        const durationMs = Date.now() - (activeWorkout.startTime || Date.now());
        const h = Math.floor(durationMs / 3600000); const m = Math.floor((durationMs % 3600000) / 60000); const s = Math.floor((durationMs % 60000) / 1000);
        const durationStr = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

        const userRef = doc(db, "users", targetUid);
        const userSnap = await getDoc(userRef);
        const targetUserData = userSnap.data();
        
        const workoutNum = (targetUserData.stats?.workouts || 0) + 1;
        const now = new Date(); const currentMonthKey = `${now.getFullYear()}_${now.getMonth()}`; const currentYearKey = `${now.getFullYear()}`; const currentWeekKey = getWeekNumber(now); 
        
        await addDoc(collection(db, "workouts"), { 
            uid: targetUid, 
            date: serverTimestamp(), 
            routine: activeWorkout.name, 
            rpe: rpeVal, 
            note: note, 
            details: cleanLog, 
            workoutNumber: workoutNum, 
            sessionVolume: Number(totalKg.toFixed(2)), 
            duration: durationStr, 
            monthKey: currentMonthKey, yearKey: currentYearKey, weekKey: currentWeekKey 
        });

        const updates = { "stats.workouts": increment(1), "stats.totalSets": increment(totalSets), "stats.totalReps": increment(totalReps), "stats.totalKg": increment(totalKg), "prs": targetUserData.prs || {}, "lastWorkoutDate": serverTimestamp() };
        updates[`stats_week_${currentWeekKey}.kg`] = increment(totalKg); updates[`stats_week_${currentWeekKey}.workouts`] = increment(1);
        for (const [muscle, count] of Object.entries(muscleCounts)) { updates[`muscleStats.${muscle}`] = increment(count); }
        
        await updateDoc(userRef, updates);
        
        showToast(`🏆 Entreno guardado para ${activeWorkout.targetName || 'Ti'}`);
        localStorage.removeItem('fit_active_workout'); 
        activeWorkout = null; 
        document.getElementById('active-workout-bar').classList.add('hidden');
        if (durationInt) clearInterval(durationInt); 
        if (wakeLock) { await wakeLock.release(); wakeLock = null; } 
        
        if (targetUid !== currentUser.uid) window.openCoachView(targetUid, selectedUserObj);
        else window.switchTab('routines-view');

    } catch (error) { console.error("Error finish:", error); alert("Error crítico al guardar."); }
};

// --- RENDERIZADO ---
async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        let myRoutines = [];
        s.forEach(d=>{ const r = d.data(); if(r.assignedTo && r.assignedTo.includes(currentUser.uid)){ myRoutines.push({id: d.id, ...r}); } });
        const orderPreference = userData.routineOrder || [];
        myRoutines.sort((a, b) => { let indexA = orderPreference.indexOf(a.id); let indexB = orderPreference.indexOf(b.id); if (indexA === -1) indexA = 9999; if (indexB === -1) indexB = 9999; return indexA - indexB; });
        if(myRoutines.length === 0) { l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>'; return; }
        myRoutines.forEach(r => {
            const div = document.createElement('div'); div.className = 'card'; const canEdit = r.uid === currentUser.uid;
            div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${canEdit ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${r.id}')">✏️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${r.id}')">ENTRENAR</button>`;
            l.appendChild(div);
        });
    });
}

window.openCoachView = async (uid, u) => {
    selectedUserCoach=uid; 
    updateDoc(doc(db, "users", uid), { lastWorkoutSeen: serverTimestamp() }).catch(e => console.log("Error marking seen", e));
    const freshSnap = await getDoc(doc(db, "users", uid)); const freshU = freshSnap.data(); selectedUserObj = freshU;
    switchTab('coach-detail-view'); 
    document.getElementById('coach-user-name').innerText=freshU.name + (freshU.role === 'assistant' ? ' (Coach 🛡️)' : ''); 
    document.getElementById('coach-user-email').innerText=freshU.email;
    document.getElementById('coach-user-meta').innerText = `${freshU.gender === 'female' ? '♀️' : '♂️'} ${freshU.age} años • ${freshU.height} cm`;
    
    if(freshU.photo) document.getElementById('coach-user-img').src = freshU.photo; 
    else { document.getElementById('coach-user-img').style.display = 'none'; document.getElementById('coach-user-initial').innerText = freshU.name.charAt(0).toUpperCase(); }
    
    const rList = document.getElementById('coach-assigned-list'); rList.innerHTML = 'Cargando...';
    const allRoutinesSnap = await getDocs(collection(db, "routines")); allRoutinesCache = [];
    const s = document.getElementById('coach-routine-select'); s.innerHTML = '<option value="">Selecciona rutina...</option>';
    allRoutinesSnap.forEach(r => { const data = r.data(); allRoutinesCache.push({id: r.id, ...data}); s.add(new Option(data.name, r.id)); });
    
    const assigned = allRoutinesCache.filter(r => (r.assignedTo || []).includes(uid)); rList.innerHTML = assigned.length ? '' : 'Ninguna rutina.';
    assigned.forEach(r => { 
        const div = document.createElement('div'); div.className = "assigned-routine-item"; 
        div.innerHTML = `<span>${r.name}</span><div style="display:flex; gap:10px;"><button class="btn-small btn" style="margin:0; width:auto; background:var(--accent-color); color:black; font-weight:bold;" onclick="window.startWorkout('${r.id}', '${uid}', '${freshU.name}')">💪 ENTRENAR</button><button style="background:none;border:none;color:#f55;font-weight:bold;cursor:pointer;" onclick="window.unassignRoutine('${r.id}')">❌</button></div>`; 
        rList.appendChild(div); 
    });

    const hList = document.getElementById('coach-history-list'); hList.innerHTML = 'Cargando...';
    const wSnap = await getDocs(query(collection(db,"workouts"), where("uid","==",uid))); hList.innerHTML = wSnap.empty ? 'Sin datos.' : '';
    wSnap.docs.map(doc => ({id: doc.id, ...doc.data()})).sort((a,b) => b.date - a.date).slice(0, 10).forEach(d => {
        let date = '-', infoStr = '';
        if(d.date) { const dObj = d.date.seconds ? new Date(d.date.seconds*1000) : d.date.toDate(); date = dObj.toLocaleDateString(); infoStr = d.duration || ''; }
        const btnDel = `<button class="btn-small btn-danger" style="margin:0 0 0 5px; padding:2px 6px;" onclick="window.deleteHistoryWorkout('${d.id}', true)">🗑️</button>`;
        hList.innerHTML += `<div class="history-row" style="grid-template-columns: 60px 1fr 30px auto;"><div>${date}</div><div style="overflow:hidden; text-overflow:ellipsis;">${d.routine}</div><div>${d.rpe === 'Suave' ? '🟢' : '🔴'}</div><div style="text-align:right;"><button class="btn-small btn-outline" onclick="viewWorkoutDetails('${d.id}', '${d.routine}', '${encodeURIComponent(JSON.stringify(d.details))}', '${encodeURIComponent(d.note||"")}', '${infoStr}')">Ver</button>${btnDel}</div></div>`;
    });

    const fixCoachChart = (id) => { const c = document.getElementById(id); if(c && c.parentElement) { c.parentElement.style.height = '250px'; c.parentElement.style.marginBottom = '35px'; } };
    if(freshU.bioHistory && freshU.showBio) { document.getElementById('coach-view-bio').classList.remove('hidden'); fixCoachChart('coachBioChart'); injectChartFilter('coachBioChart', 'window.updateBioChart'); renderFilteredChart('coachBioChart', coachBioChart, freshU.bioHistory, 'muscle', '#00ffff', 90); } else { document.getElementById('coach-view-bio').classList.add('hidden'); }
    if(freshU.skinfoldHistory && freshU.showSkinfolds) { document.getElementById('coach-view-skinfolds').classList.remove('hidden'); fixCoachChart('coachFatChart'); injectChartFilter('coachFatChart', 'window.updateFatChart'); renderFilteredChart('coachFatChart', coachFatChart, freshU.skinfoldHistory, 'fat', '#ffaa00', 90); } else { document.getElementById('coach-view-skinfolds').classList.add('hidden'); }
    if(freshU.measureHistory && freshU.showMeasurements) { document.getElementById('coach-view-measures').classList.remove('hidden'); fixCoachChart('coachMeasuresChart'); injectChartFilter('coachMeasuresChart', 'window.updateMeasureChart'); renderFilteredMeasureChart('coachMeasuresChart', coachMeasureChart, freshU.measureHistory, 90); } else { document.getElementById('coach-view-measures').classList.add('hidden'); }
    renderMuscleRadar('coachMuscleChart', freshU.muscleStats || {});
    if(freshU.weightHistory) { fixCoachChart('coachWeightChart'); injectChartFilter('coachWeightChart', 'window.updateWeightChart'); coachChart = renderFilteredChart('coachWeightChart', coachChart, freshU.weightHistory, 'weight', '#ff3333', 90); }
    updateCoachPhotoDisplay('front');
    
    const existingTg = document.getElementById('coach-telegram-row'); if(existingTg) existingTg.remove(); 
    const videoToggleEl = document.getElementById('coach-toggle-videos'); 
    if(videoToggleEl) { const videoRow = videoToggleEl.closest('div'); const tgRow = document.createElement('div'); tgRow.id = 'coach-telegram-row'; tgRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-top:15px;"; tgRow.innerHTML = `<span>Habilitar Chat Telegram</span><label class="switch"><input type="checkbox" id="coach-toggle-telegram" onchange="window.toggleUserFeature('allowTelegram', this.checked)"><span class="slider"></span></label>`; if(videoRow && videoRow.parentNode) { videoRow.parentNode.insertBefore(tgRow, videoRow.nextSibling); } document.getElementById('coach-toggle-telegram').checked = !!freshU.allowTelegram; }
};

// --- RENDER WORKOUT ---
function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; 
    let title = activeWorkout.name;
    if (activeWorkout.targetName) title += ` (${activeWorkout.targetName})`;
    document.getElementById('workout-title').innerText = title;
    
    if(activeWorkout.targetUid && activeWorkout.targetUid !== currentUser.uid) document.getElementById('workout-title').style.color = '#00ffff';
    else document.getElementById('workout-title').style.color = 'var(--accent-color)';

    activeWorkout.exs.forEach((e, i) => {
        let cardStyle = activeWorkout.targetUid ? "border-left:3px solid #00ffff;" : "border-left:3px solid var(--accent-color);"; 
        let connector = ""; if (e.superset) { cardStyle += " margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px dashed #444;"; connector = `<div style="text-align:center; background:var(--card-color); color:var(--accent-color); font-size:1.2rem; line-height:0.5;">🔗</div>`; } else if (i > 0 && activeWorkout.exs[i-1].superset) cardStyle += " border-top-left-radius: 0; border-top-right-radius: 0; margin-top:0;";
        const card = document.createElement('div'); card.className = 'card'; card.style.cssText = cardStyle;
        let videoBtnHtml = (userData.showVideos && e.video) ? `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0; padding:2px 8px; border-color:#f00; color:#f55;" onclick="window.openVideo('${e.video}')">🎥</button>` : '';
        const swapBtn = `<button class="btn-small btn-outline" style="float:right; width:auto; margin:0 5px 0 0; padding:2px 8px; border-color:#aaa; color:#fff;" onclick="window.initSwap(${i})">🔄</button>`;
        const hasNote = e.note && e.note.length > 0; const noteBtn = `<button class="ex-note-btn ${hasNote ? 'has-note' : ''}" onclick="window.openNoteModal(${i})">📝</button>`;
        let bars = (e.type === 'i') ? `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>100%</span></div><div class="mini-track"><div class="mini-fill fill-primary"></div></div>` : `<div class="mini-bar-label"><span>${e.mInfo.main}</span><span>70%</span></div><div class="mini-track"><div class="mini-fill fill-primary" style="width:70%"></div></div>`;
        let setsHtml = `<div class="set-header"><div>#</div><div>PREV</div><div>REPS</div><div>KG</div><div></div></div>`;
        e.sets.forEach((s, j) => { 
            const weightVal = s.w === 0 ? '' : s.w; const isDisabled = s.d ? 'disabled' : ''; const rowOpacity = s.d ? 'opacity:0.5; pointer-events:none;' : ''; const isDropClass = s.isDrop ? 'is-dropset' : ''; const displayNum = s.numDisplay || (j + 1);
            let dropActionBtn = !s.d ? (s.isDrop ? `<button class="btn-small btn-outline" style="padding:2px 6px; font-size:0.7rem; border-color:#f55; color:#f55; margin-left:auto;" onclick="window.removeSpecificSet(${i},${j})">✕</button>` : `<button class="btn-small btn-outline" style="padding:2px; font-size:0.5rem; border-color:var(--warning-color); color:var(--warning-color);" onclick="window.addDropset(${i},${j})">DROP</button>`) : '';
            setsHtml += `<div class="set-row ${isDropClass}" style="${rowOpacity}"><div class="set-num" style="${s.isDrop ? 'color:var(--warning-color); font-size:0.7rem;' : ''}">${displayNum}</div><div class="prev-data">${s.prev}</div><div><input type="number" value="${s.r}" ${isDisabled} onchange="uS(${i},${j},'r',this.value)"></div><div><input type="number" placeholder="kg" value="${weightVal}" ${isDisabled} onchange="uS(${i},${j},'w',this.value)"></div><div style="display:flex; flex-direction:column; gap:2px; pointer-events: auto; align-items:center;"><button id="btn-${i}-${j}" class="btn-outline ${s.d ? 'btn-done' : ''}" style="margin:0;padding:0;height:32px;width:100%;" onclick="tS(${i},${j})">${s.d ? '✓' : ''}</button>${dropActionBtn}</div></div>`; 
        });
        setsHtml += `<div class="sets-actions"><button class="btn-set-control" style="border-color:var(--success-color); color:var(--success-color); margin-right:auto;" onclick="window.toggleAllSets(${i})">✓ TODO</button><button class="btn-set-control" onclick="removeSet(${i})">- Serie</button><button class="btn-set-control" onclick="addSet(${i})">+ Serie</button></div>`;
        card.innerHTML = `<div class="workout-split"><div class="workout-visual"><img src="${e.img}" onerror="this.src='logo.png'"></div><div class="workout-bars" style="width:100%">${bars}</div></div><h3 style="margin-bottom:10px; border:none; display:flex; align-items:center; justify-content:space-between;"><span>${e.n}</span><div>${noteBtn} ${videoBtnHtml} ${swapBtn}</div></h3>${setsHtml}`;
        c.appendChild(card); if (e.superset) c.innerHTML += connector; 
    });
}

// --- EDITOR LOGIC ---
function initExerciseList(list) {
    const c = document.getElementById('exercise-selector-list'); c.innerHTML = ''; 
    const sortedList = [...list].sort((a, b) => { 
        const aSelected = currentRoutineSelections.some(x => x.n === a.n); const bSelected = currentRoutineSelections.some(x => x.n === b.n); 
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
window.renderSelectedSummary = () => { const div = document.getElementById('selected-summary'); div.innerHTML = ''; if(currentRoutineSelections.length > 0) { const legendDiv = document.createElement('div'); legendDiv.className = 'editor-legend'; legendDiv.style.cssText = "display:flex; gap:8px; overflow-x:auto; padding:12px; background:#111; margin-bottom:15px; white-space:nowrap; border-bottom:1px solid #333; align-items:center; border-radius: 8px; position:sticky; top:0; z-index:10; cursor:pointer;"; legendDiv.onclick = () => { document.getElementById('exercise-selector-list').scrollTo({top:0, behavior:'smooth'}); }; let legendHTML = '<span style="font-size:0.7rem; color:#888; font-weight:bold; margin-right:5px;">ORDEN:</span>'; currentRoutineSelections.forEach((obj, idx) => { const isLast = idx === currentRoutineSelections.length - 1; const linkSymbol = obj.s ? '<span style="color:var(--accent-color); font-weight:bold;">🔗</span>' : ''; const separator = (isLast && !obj.s) ? '' : '<span style="color:#444">›</span>'; legendHTML += `<span onclick="event.stopPropagation(); document.getElementById('ex-card-${normalizeText(obj.n)}').scrollIntoView({behavior:'smooth', block:'center'});" style="font-size:0.85rem; color:#fff; cursor:pointer; text-decoration:underline; text-decoration-color:rgba(255,255,255,0.2);">${idx+1}. ${obj.n} ${linkSymbol}</span> ${separator}`; }); legendDiv.innerHTML = legendHTML; div.appendChild(legendDiv); } };
window.updateSelectionData = (idx, field, val) => { if(currentRoutineSelections[idx]) { currentRoutineSelections[idx][field] = field === 'series' ? (parseInt(val)||0) : val; } };
window.toggleSuperset = (idx) => { if (idx < currentRoutineSelections.length - 1) { currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s; initExerciseList(filteredExercisesList); renderSelectedSummary(); } else { alert("No puedes hacer superserie con el último ejercicio."); } };
window.removeSelection = (name) => { currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); renderSelectedSummary(); window.filterExercises(document.getElementById('ex-search').value); }
window.saveRoutine = async () => { const n = document.getElementById('editor-name').value; const s = window.currentRoutineSelections; if(!n || s.length === 0) return alert("❌ Faltan datos"); const btn = document.getElementById('btn-save-routine'); btn.innerText = "💾 GUARDANDO..."; let initialAssignments = []; if (userData.role !== 'admin') { initialAssignments.push(currentUser.uid); } try { const data = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: initialAssignments }; if(editingRoutineId) { await updateDoc(doc(db, "routines", editingRoutineId), { name: n, exercises: s }); } else { await addDoc(collection(db, "routines"), data); } alert("✅ Guardado"); switchTab('routines-view'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "GUARDAR"; } };
window.cloneRoutine = async (id) => { if(!confirm("¿Deseas clonar esta rutina para editarla?")) return; try { const docRef = doc(db, "routines", id); const docSnap = await getDoc(docRef); if (!docSnap.exists()) return alert("Error: No existe."); const originalData = docSnap.data(); const newName = prompt("Nombre copia:", `${originalData.name} (Copia)`); if (!newName) return; const copyData = { ...originalData, name: newName, uid: currentUser.uid, createdAt: serverTimestamp(), assignedTo: [] }; await addDoc(collection(db, "routines"), copyData); alert(`✅ Clonada. Ahora puedes editar "${newName}".`); window.loadAdminLibrary(); } catch (e) { alert("Error: " + e.message); } };
window.delRoutine = async (id) => { if(confirm("¿Borrar rutina permanentemente?")) await deleteDoc(doc(db,"routines",id)); window.loadAdminLibrary(); };
window.addSet = (exIdx) => { const sets = activeWorkout.exs[exIdx].sets; sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const allDone = ex.sets.every(s => s.d); const newState = !allDone; ex.sets.forEach(s => { s.d = newState; }); saveLocalWorkout(); renderWorkout(); if(newState) showToast("✅ Todas las series completadas"); };
window.openNoteModal = (idx) => { noteTargetIndex = idx; const existingNote = activeWorkout.exs[idx].note || ""; document.getElementById('exercise-note-input').value = existingNote; window.openModal('modal-note'); };
window.saveNote = () => { if (noteTargetIndex === null) return; const txt = document.getElementById('exercise-note-input').value.trim(); activeWorkout.exs[noteTargetIndex].note = txt; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-note'); showToast(txt ? "📝 Nota guardada" : "🗑️ Nota borrada"); };
window.promptRPE = () => { const radarCtx = document.getElementById('muscleRadarChart'); if (!radarCtx) return; if (radarChartInstance) radarChartInstance.destroy(); const muscleCounts = { "Pecho":0, "Espalda":0, "Pierna":0, "Hombros":0, "Brazos":0, "Abs":0 }; if (activeWorkout && activeWorkout.exs) { activeWorkout.exs.forEach(e => { const m = e.mInfo?.main || "General"; let key = ""; if (["Pecho", "Espalda", "Hombros", "Abs"].includes(m)) key = m; else if (["Cuádriceps", "Isquios", "Glúteos", "Gemelos"].includes(m)) key = "Pierna"; else if (["Bíceps", "Tríceps"].includes(m)) key = "Brazos"; if (key && muscleCounts.hasOwnProperty(key)) { const completedSets = e.sets?.filter(s => s.d).length || 0; muscleCounts[key] += completedSets; } }); } radarChartInstance = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(muscleCounts), datasets: [{ label: 'Series Finalizadas', data: Object.values(muscleCounts), backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', borderWidth: 2, pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointRadius: 3, pointHoverRadius: 5 }] }, options: { scales: { r: { beginAtZero: true, min: 0, ticks: { display: false, stepSize: 1 }, grid: { color: '#333' }, angleLines: { color: '#333' }, pointLabels: { color: '#ffffff', font: { size: 10 } } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false, responsive: true } }); const notesEl = document.getElementById('workout-notes'); if (notesEl) notesEl.value = ''; window.openModal('modal-rpe'); };
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };
window.tS = async (i, j) => { const s = activeWorkout.exs[i].sets[j]; const exerciseName = activeWorkout.exs[i].n; s.d = !s.d; if(s.d) { const weight = parseFloat(s.w) || 0; const reps = parseInt(s.r) || 0; if (weight > 0 && reps > 0) { const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps))); if (!userData.rmRecords) userData.rmRecords = {}; const currentRecord = userData.rmRecords[exerciseName] || 0; if (estimated1RM > currentRecord) { userData.rmRecords[exerciseName] = estimated1RM; updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM }); showToast(`🔥 ¡NUEVO NIVEL! 1RM: <b>${estimated1RM}kg</b>`); } else { const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0; if (weight > currentWeightPR) { if(!userData.prs) userData.prs = {}; userData.prs[exerciseName] = weight; updateDoc(doc(db, "users", currentUser.uid), { [`prs.${exerciseName}`]: weight }); showToast(`💪 PR: ${weight}kg`); } } } openRest(); } saveLocalWorkout(); renderWorkout(); };
window.requestNotifPermission = () => { if ("Notification" in window) { Notification.requestPermission().then(p => { if(p === 'granted') showToast("✅ Notificaciones activadas"); else showToast("❌ Permiso denegado"); }); } else { showToast("⚠️ Tu navegador no soporta notificaciones"); } };
function updateTimerVisuals(timeLeft) { const display = document.getElementById('timer-display'); const ring = document.getElementById('timer-progress-ring'); if(display) { display.innerText = timeLeft; display.style.color = timeLeft <= 5 ? "#fff" : "var(--accent-color)"; display.style.textShadow = timeLeft <= 5 ? "0 0 20px #fff" : "none"; } if(ring) { const circumference = 565; const offset = circumference - (timeLeft / totalRestTime) * circumference; ring.style.strokeDashoffset = offset; ring.style.stroke = "var(--accent-color)"; if (timeLeft <= 0) ring.style.stroke = "#ffffff"; } }
function openRest() { window.openModal('modal-timer'); initAudioEngine(); let duration = parseInt(userData.restTime) || 60; totalRestTime = duration; restEndTime = Date.now() + (duration * 1000); lastBeepSecond = -1; updateTimerVisuals(duration); if(timerInt) clearInterval(timerInt); timerInt = setInterval(() => { const now = Date.now(); const leftMs = restEndTime - now; const leftSec = Math.ceil(leftMs / 1000); if (leftSec >= 0) { updateTimerVisuals(leftSec); } if (leftSec <= 5 && leftSec > 0) { if (leftSec !== lastBeepSecond) { playTickSound(false); lastBeepSecond = leftSec; } } if (leftSec <= 0) { window.closeTimer(); playTickSound(true); if ("Notification" in window && Notification.permission === "granted") { try { new Notification("¡A LA SERIE!", { body: "Descanso finalizado.", icon: "logo.png" }); } catch(e) {} } } }, 250); }
window.closeTimer = () => { clearInterval(timerInt); window.closeModal('modal-timer'); };
window.addRestTime = (s) => { restEndTime += (s * 1000); if(s > 0) totalRestTime += s; const now = Date.now(); const left = Math.ceil((restEndTime - now) / 1000); updateTimerVisuals(left); };
function startTimerMini() { if(durationInt) clearInterval(durationInt); const d = document.getElementById('mini-timer'); const barD = document.getElementById('bar-timer'); if(!activeWorkout || !activeWorkout.startTime) return; durationInt = setInterval(()=>{ const diff = Math.floor((Date.now() - activeWorkout.startTime)/1000); const m = Math.floor(diff/60); const s = diff % 60; const txt = `${m}:${s.toString().padStart(2,'0')}`; if(d) d.innerText = txt; if(barD) barD.innerText = txt; }, 1000); }
function showToast(msg) { const container = document.getElementById('toast-container') || createToastContainer(); const t = document.createElement('div'); t.className = 'toast-msg'; t.innerHTML = msg; container.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); }
function createToastContainer() { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; }
window.openProgress = async () => { const m = document.getElementById('modal-progress'); const s = document.getElementById('progress-select'); s.innerHTML = '<option>Cargando datos...</option>'; window.openModal('modal-progress'); try { const snap = await getDocs(query(collection(db, "workouts"), where("uid", "==", currentUser.uid))); const recentWorkouts = snap.docs.map(d => d.data()); let compressed = userData.compressedHistory || []; const uniqueExercises = new Set(); recentWorkouts.forEach(w => { if (w.details) w.details.forEach(ex => uniqueExercises.add(ex.n)); }); compressed.forEach(c => uniqueExercises.add(c.n)); if (uniqueExercises.size === 0) { s.innerHTML = '<option>Sin historial</option>'; return; } s.innerHTML = '<option value="">-- Selecciona Ejercicio --</option>'; Array.from(uniqueExercises).sort().forEach(exName => { const opt = document.createElement('option'); opt.value = exName; opt.innerText = exName; s.appendChild(opt); }); window.fullHistoryCache = { recent: recentWorkouts, compressed: compressed }; } catch (e) { s.innerHTML = '<option>Error cargando</option>'; } };
window.renderProgressChart = (exName) => { if (!exName || !window.fullHistoryCache) return; const ctx = document.getElementById('progressChart'); if (progressChart) progressChart.destroy(); const rawPoints = []; window.fullHistoryCache.compressed.forEach(c => { if(c.n === exName) { rawPoints.push({ date: c.d * 1000, vol: c.v, maxW: c.w, rm: c.w / (1.0278 - (0.0278 * c.r)) }); } }); window.fullHistoryCache.recent.forEach(w => { const ex = w.details?.find(d => d.n === exName); if(ex) { let tv = 0, mw = 0, bestRm = 0; ex.s.forEach(set => { const weight = parseFloat(set.w)||0; const reps = parseInt(set.r)||0; tv += weight*reps; if(weight > mw) mw = weight; if(weight > 0 && reps > 0) { const r = weight / (1.0278 - (0.0278 * reps)); if(r > bestRm) bestRm = r; } }); if(tv > 0) { rawPoints.push({ date: w.date.seconds * 1000, vol: tv, maxW: mw, rm: bestRm }); } } }); rawPoints.sort((a,b) => a.date - b.date); const labels = rawPoints.map(p => new Date(p.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })); const volData = rawPoints.map(p => p.vol); const rmData = rawPoints.map(p => Math.round(p.rm)); const prData = rawPoints.map(p => p.maxW); progressChart = new Chart(ctx, { type: 'line', data: { labels: labels, datasets: [ { label: 'Volumen (Kg)', data: volData, borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)', yAxisID: 'y', tension: 0.4, fill: true, pointRadius: 3 }, { label: '1RM Est.', data: rmData, borderColor: '#ffaa00', yAxisID: 'y1', tension: 0.3, pointRadius: 4 }, { label: 'Peso Máx', data: prData, borderColor: '#ff3333', borderDash: [5, 5], yAxisID: 'y1', tension: 0.3, pointRadius: 2 } ] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { type: 'linear', display: true, position: 'left', grid: { color: '#333' } }, y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }, x: { ticks: { color: '#888', maxRotation: 45, minRotation: 0 } } } } }); };
window.toggleAdminMode = (mode) => { document.getElementById('tab-users').classList.toggle('active', mode==='users'); document.getElementById('tab-lib').classList.toggle('active', mode==='lib'); document.getElementById('tab-plans').classList.toggle('active', mode==='plans'); document.getElementById('admin-users-card').classList.toggle('hidden', mode!=='users'); document.getElementById('admin-lib-card').classList.toggle('hidden', mode!=='lib'); document.getElementById('admin-plans-card').classList.toggle('hidden', mode!=='plans'); if(mode==='users') window.loadAdminUsers(); if(mode==='lib') window.loadAdminLibrary(); if(mode==='plans') window.loadAdminPlans(); };
window.loadAdminUsers = async (forceRefresh = false) => { const l = document.getElementById('admin-list'); if (adminUsersCache && !forceRefresh) { renderAdminList(adminUsersCache); return; } l.innerHTML = '↻ Cargando...'; try { let q = userData.role === 'assistant' ? query(collection(db, "users"), where("assignedCoach", "==", currentUser.uid)) : collection(db, "users"); const s = await getDocs(q); adminUsersCache = s.docs.map(d => ({id: d.id, ...d.data()})); renderAdminList(adminUsersCache); } catch (e) { l.innerHTML = 'Error de permisos o conexión.'; console.log(e); } };
function renderAdminList(usersList) { const l = document.getElementById('admin-list'); l.innerHTML = ''; if(userData.role === 'admin') { const globalNoticeBtn = document.createElement('button'); globalNoticeBtn.className = 'btn'; globalNoticeBtn.style.cssText = "width:100%; margin-bottom:15px; background:var(--warning-color); color:black; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:8px;"; globalNoticeBtn.innerHTML = "📢 CREAR AVISO PARA TODOS"; globalNoticeBtn.onclick = () => window.openNoticeEditor('GLOBAL'); l.appendChild(globalNoticeBtn); } usersList.sort((a, b) => { const dateA = a.lastWorkoutDate ? a.lastWorkoutDate.seconds : 0; const dateB = b.lastWorkoutDate ? b.lastWorkoutDate.seconds : 0; return dateB - dateA; }); usersList.forEach(u => { let activeClass = ""; if (u.lastWorkoutDate) { const last = u.lastWorkoutDate.toDate ? u.lastWorkoutDate.toDate() : new Date(u.lastWorkoutDate.seconds * 1000); const today = new Date(); const isToday = last.getDate() === today.getDate() && last.getMonth() === today.getMonth() && last.getFullYear() === today.getFullYear(); const seenSeconds = u.lastWorkoutSeen ? u.lastWorkoutSeen.seconds : 0; const workoutSeconds = u.lastWorkoutDate.seconds; if (isToday && (workoutSeconds > seenSeconds)) activeClass = "avatar-active-today"; } const avatarHtml = u.photo ? `<img src="${u.photo}" class="mini-avatar ${activeClass}">` : `<div class="mini-avatar-placeholder ${activeClass}">${u.name.charAt(0).toUpperCase()}</div>`; let rowClass = "admin-user-row"; if(u.id === currentUser.uid) rowClass += " is-me"; if(u.role === 'assistant') rowClass += " is-coach"; const btnNotice = `<button class="btn-outline btn-small" style="margin:0; width:40px; border-color:#ffaa00; color:#ffaa00; display:flex; align-items:center; justify-content:center;" onclick="event.stopPropagation(); window.openNoticeEditor('${u.id}')">📢</button>`; const div = document.createElement('div'); div.className = rowClass; div.innerHTML=`${avatarHtml}<div style="overflow:hidden;"><div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:white; display:flex; align-items:center;">${u.name} ${u.role === 'assistant' ? '🛡️' : ''}</div><div style="font-size:0.75rem; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div></div><div style="display:flex; gap:8px;">${btnNotice}<button class="btn-outline btn-small" style="margin:0; border-color:#444; color:#ccc;" onclick="window.openCoachView('${u.id}', null)">⚙️</button></div>`; l.appendChild(div); }); }
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
function renderHistoryHTML(details) { let html = ''; details.forEach((ex, exIdx) => { const name = ex.n || ex; const sets = ex.s || []; const exNoteHtml = ex.note ? `<div style="font-size:0.75rem; color:#aaa; font-style:italic; margin-top:5px; padding:4px; border-left:2px solid #555; background:#111;">📝 ${ex.note}</div>` : ''; html += `<div class="detail-exercise-card"><div class="detail-exercise-title">${name}</div>${exNoteHtml}<div class="detail-sets-grid">`; if (sets.length > 0) { sets.forEach((s, i) => { const num = s.numDisplay || (i + 1); const w = s.w || 0; const r = s.r || 0; const dropStyle = s.isDrop ? 'border: 1px solid var(--warning-color); background: rgba(255, 170, 0, 0.15);' : ''; html += `<div class="detail-set-badge history-set-item" style="${dropStyle}" data-ex="${exIdx}" data-set="${i}"><br><span class="detail-set-num">#${num}</span><br><span class="set-view"><b>${r}</b> <span style="color:#666">x</span> ${w}k</span><br></div>`; }); } else { html += `<div style="font-size:0.7rem; color:#666;">Sin datos.</div>`; } html += `</div></div>`; }); return html; }
window.enableHistoryEdit = () => { const items = document.querySelectorAll('.history-set-item'); items.forEach(item => { const exIdx = item.getAttribute('data-ex'); const setIdx = item.getAttribute('data-set'); const setObj = currentHistoryDetails[exIdx].s[setIdx]; item.innerHTML = `<br><div style="display:flex; gap:5px; align-items:center;"><br><input type="number" class="hist-edit-reps" value="${setObj.r}" style="width:40px; padding:2px; margin:0; text-align:center; background:#000; border:1px solid #444;"><br><span style="color:#666">x</span><br><input type="number" class="hist-edit-weight" value="${setObj.w}" style="width:40px; padding:2px; margin:0; text-align:center; background:#000; border:1px solid #444;"><br></div><br>`; }); document.getElementById('btn-edit-history').classList.add('hidden'); document.getElementById('btn-save-history').classList.remove('hidden'); };
window.saveHistoryChanges = async () => { const items = document.querySelectorAll('.history-set-item'); let index = 0; currentHistoryDetails.forEach((ex) => { ex.s.forEach((set) => { const el = items[index]; if(el) { const rInput = el.querySelector('.hist-edit-reps'); const wInput = el.querySelector('.hist-edit-weight'); if(rInput && wInput) { set.r = parseInt(rInput.value) || 0; set.w = parseFloat(wInput.value) || 0; } } index++; }); }); try { const btn = document.getElementById('btn-save-history'); btn.innerText = "⏳ GUARDANDO..."; await updateDoc(doc(db, "workouts", editingHistoryId), { details: currentHistoryDetails }); alert("✅ Historial actualizado."); window.closeModal('modal-details'); if(document.getElementById('profile-view').classList.contains('active')) window.loadProfile(); if(document.getElementById('coach-detail-view').classList.contains('active')) window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { console.error(e); alert("Error al guardar cambios."); } };
window.openNoticeEditor = async (uid) => { noticeTargetUid = uid; document.getElementById('notice-title').value = ''; document.getElementById('notice-text').value = ''; document.getElementById('notice-img-file').value = ''; document.getElementById('notice-link').value = ''; const modalTitle = document.getElementById('notice-modal-title'); modalTitle.innerText = uid === 'GLOBAL' ? '📢 CREAR AVISO PARA TODOS' : '📢 AVISO INDIVIDUAL'; try { let existing = null; if(uid === 'GLOBAL') { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) existing = snap.data(); } else { const snap = await getDoc(doc(db, "users", uid)); if(snap.exists() && snap.data().coachNotice) existing = snap.data().coachNotice; } if(existing) { document.getElementById('notice-title').value = existing.title || ''; document.getElementById('notice-text').value = existing.text || ''; document.getElementById('notice-link').value = existing.link || ''; } } catch(e) { console.error(e); } window.openModal('modal-notice-editor'); };
window.saveNotice = async () => { const t = document.getElementById('notice-title').value; const txt = document.getElementById('notice-text').value; const lnk = document.getElementById('notice-link').value; const fileInp = document.getElementById('notice-img-file'); if(!t || !txt) return alert("Faltan datos."); const btn = document.getElementById('btn-save-notice'); btn.innerText = "SUBIENDO..."; btn.disabled = true; try { let imgUrl = ""; if(fileInp.files.length > 0) { const file = fileInp.files[0]; const snapshot = await uploadBytes(ref(storage, `notices/${noticeTargetUid}/${Date.now()}.jpg`), file); imgUrl = await getDownloadURL(snapshot.ref); } else { if(noticeTargetUid === 'GLOBAL') { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) imgUrl = snap.data().img || ""; } else { const snap = await getDoc(doc(db, "users", noticeTargetUid)); if(snap.exists() && snap.data().coachNotice) imgUrl = snap.data().coachNotice.img || ""; } } const noticeData = { id: Date.now().toString(), title: t, text: txt, img: imgUrl, link: lnk, date: new Date().toISOString(), active: true }; if(noticeTargetUid === 'GLOBAL') { await setDoc(doc(db, "settings", "globalNotice"), noticeData); alert("✅ Aviso Global"); } else { await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: noticeData }); alert("✅ Aviso Individual"); } window.closeModal('modal-notice-editor'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "PUBLICAR AVISO"; btn.disabled = false; } };
window.deleteNotice = async () => { if(!confirm("¿Borrar?")) return; try { if(noticeTargetUid === 'GLOBAL') { await deleteDoc(doc(db, "settings", "globalNotice")); } else { await updateDoc(doc(db, "users", noticeTargetUid), { coachNotice: null }); } alert("🗑️ Eliminado"); window.closeModal('modal-notice-editor'); } catch(e) { alert("Error"); } };
async function checkNotices() { if(userData.role === 'admin' || userData.role === 'assistant') return; if(userData.coachNotice && userData.coachNotice.active) { showNoticeModal(userData.coachNotice, "MENSAJE DEL COACH", 'INDIVIDUAL'); return; } try { const snap = await getDoc(doc(db, "settings", "globalNotice")); if(snap.exists()) { const notice = snap.data(); if(!notice.active) return; const dismissedId = localStorage.getItem('dismissed_global_notice_id'); if(notice.id && notice.id !== dismissedId) { showNoticeModal(notice, "AVISO DE LA COMUNIDAD", 'GLOBAL'); } } } catch(e) {} }
function showNoticeModal(notice, headerTitle, type) { currentNoticeId = notice.id; currentNoticeType = type; document.getElementById('viewer-header').innerText = headerTitle; document.getElementById('viewer-title').innerText = notice.title; document.getElementById('viewer-text').innerText = notice.text; const imgEl = document.getElementById('viewer-img'); if(notice.img) { imgEl.src = notice.img; imgEl.classList.remove('hidden'); imgEl.onclick = () => window.viewFullImage(notice.img); } else { imgEl.classList.add('hidden'); } const linkBtn = document.getElementById('viewer-link-btn'); if(notice.link) { linkBtn.classList.remove('hidden'); linkBtn.onclick = () => window.open(notice.link, '_blank'); } else { linkBtn.classList.add('hidden'); } window.openModal('modal-notice-viewer'); }
window.dismissNotice = async () => { if (currentNoticeType === 'GLOBAL') { if(currentNoticeId) localStorage.setItem('dismissed_global_notice_id', currentNoticeId); } else if (currentNoticeType === 'INDIVIDUAL') { try { await updateDoc(doc(db, "users", currentUser.uid), { "coachNotice.active": false }); if(userData.coachNotice) userData.coachNotice.active = false; } catch(e) {} } window.closeModal('modal-notice-viewer'); };
window.toggleUserFeature = async (field, isActive) => { if(!selectedUserCoach || !selectedUserObj) return; selectedUserObj[field] = isActive; const toggleMap = { 'showBio': 'coach-view-bio', 'showSkinfolds': 'coach-view-skinfolds', 'showMeasurements': 'coach-view-measures' }; if(toggleMap[field]) { const el = document.getElementById(toggleMap[field]); if(el) isActive ? el.classList.remove('hidden') : el.classList.add('hidden'); } if(field === 'showPhotos') { const pCard = document.getElementById('coach-view-photos'); if(pCard) isActive ? pCard.classList.remove('hidden') : pCard.classList.add('hidden'); } try { await updateDoc(doc(db, "users", selectedUserCoach), { [field]: isActive }); console.log(`Updated ${field} to ${isActive}`); } catch (e) { console.error("Error updating toggle:", e); alert("Error al guardar ajuste."); const chk = document.querySelector(`input[onchange*="${field}"]`); if(chk) chk.checked = !isActive; } };
window.assignRoutine = async () => { const sel = document.getElementById('coach-routine-select'); const rid = sel.value; if(!rid || !selectedUserCoach) return alert("Selecciona una rutina"); try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayUnion(selectedUserCoach) }); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: arrayUnion(rid) }); alert("✅ Rutina enviada."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert(e.message); } };
window.unassignRoutine = async (rid) => { if(!confirm("¿Quitar esta rutina del atleta?")) return; try { await updateDoc(doc(db, "routines", rid), { assignedTo: arrayRemove(selectedUserCoach) }); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: arrayRemove(rid) }); alert("🗑️ Rutina retirada."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert(e.message); } };
window.assignPlan = async () => { const sel = document.getElementById('coach-plan-select'); const pid = sel.value; if(!pid) return; if(!confirm("¿Asignar todo este plan?")) return; try { const snap = await getDoc(doc(db,"plans", pid)); if(!snap.exists()) return; const routines = snap.data().routines || []; const promises = routines.map(rid => updateDoc(doc(db,"routines",rid), { assignedTo: arrayUnion(selectedUserCoach) })); await Promise.all(promises); await updateDoc(doc(db, "users", selectedUserCoach), { routineOrder: routines }); alert("✅ Plan asignado."); window.openCoachView(selectedUserCoach, selectedUserObj); } catch(e) { alert("Error: " + e.message); } };
window.approveUser = async () => { if(!selectedUserCoach) return; if(confirm("¿Aprobar acceso a este atleta?")) { await updateDoc(doc(db, "users", selectedUserCoach), { approved: true }); alert("✅ Usuario Aprobado"); window.openCoachView(selectedUserCoach, selectedUserObj); } };
window.deleteUser = async () => { if(!selectedUserCoach) return; const confirmName = prompt(`⚠️ PELIGRO:\nEscribe "BORRAR" para eliminar permanentemente a ${selectedUserObj.name}.\nSe perderán todos sus datos.`); if(confirmName === "BORRAR") { await deleteDoc(doc(db, "users", selectedUserCoach)); alert("Usuario eliminado."); window.loadAdminUsers(true); window.switchTab('admin-view'); } };
window.goToCreateRoutine = () => { window.openEditor(); };
document.getElementById('btn-register').onclick=async()=>{ const secretCode = document.getElementById('reg-code').value; const tgUser = document.getElementById('reg-telegram')?.value || ""; try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value); await setDoc(doc(db,"users",c.user.uid),{ name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode: secretCode, telegram: tgUser, approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false, showPhotos: false }); }catch(e){alert("Error: " + e.message);} };
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
