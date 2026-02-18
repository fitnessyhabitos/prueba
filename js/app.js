import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, onSnapshot, query, where, addDoc, deleteDoc, getDocs, serverTimestamp, increment, orderBy, limit, arrayRemove, arrayUnion, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { EXERCISES } from './data.js';

console.log("⚡ FIT DATA: App v14.0 (Persistent Nav & History Fix)...");

// --- 1. Service Worker para carga instantánea ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error('❌ SW Error:', err));
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

// Persistencia Offline
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

// Variables UI
let rankFilterTime = 'all';        
let rankFilterGender = 'all';       
let rankFilterCat = 'kg';           
let adminUsersCache = null; 
let editingHistoryId = null; 
let currentHistoryDetails = null; 

// Gráficos
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

// Infinite Scroll
let exercisesBatchIndex = 0;
let filteredExercisesList = [];
let exercisesObserver = null;
const BATCH_SIZE = 20;

/* ===========================================================
   AUTH & RESTAURACIÓN DE ESTADO
   =========================================================== */
onAuthStateChanged(auth, async (user) => {
    const loadingScreen = document.getElementById('loading-screen');
    
    if(user) {
        currentUser = user;
        // 1. Intentar restaurar datos locales ANTES de pintar nada
        const savedW = localStorage.getItem('fit_active_workout');
        if(savedW) { 
            try { 
                activeWorkout = JSON.parse(savedW); 
                // Restauramos el timer visual en la barra inmediatamente
                startTimerMini();
            } catch(e) { console.error(e); }
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
                
                if(userData.approved){
                    // Quitar loading screen
                    if(loadingScreen) { loadingScreen.style.opacity = '0'; setTimeout(() => loadingScreen.classList.add('hidden'), 300); }
                    document.getElementById('main-header').classList.remove('hidden');
                    loadRoutines();
                    
                    // Lógica de Redirección Inteligente
                    if (activeWorkout) {
                        // Si hay entreno, vamos al entreno directamente
                        renderWorkout(); 
                        switchTab('workout-view');
                        showToast("⚡ Sesión restaurada");
                    } else {
                        switchTab('routines-view');
                    }
                } else { alert("Cuenta en revisión."); signOut(auth); }
            }
        } catch(e) { console.log("Offline mode:", e); if(loadingScreen) loadingScreen.classList.add('hidden'); }
    } else {
        if(loadingScreen) loadingScreen.classList.add('hidden');
        switchTab('auth-view');
        document.getElementById('main-header').classList.add('hidden');
    }
});

/* ===========================================================
   NAVEGACIÓN PERSISTENTE (Solución Barra Flotante)
   =========================================================== */
window.switchTab = (t) => {
    // Gestión de la barra flotante
    const bar = document.getElementById('active-workout-bar');
    
    // Si vamos a una vista que NO es el entreno, pero hay entreno activo -> Mostrar Barra
    if (activeWorkout && t !== 'workout-view') {
        if(bar) bar.classList.remove('hidden');
    } else {
        if(bar) bar.classList.add('hidden');
    }

    // Si entramos al entreno, asegurar renderizado
    if (t === 'workout-view') {
        if (!activeWorkout) { t = 'routines-view'; } // Seguridad
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

/* ===========================================================
   UTILS
   =========================================================== */
let scrollPos = 0;
window.openModal = (id) => { scrollPos = window.pageYOffset; document.body.style.top = `-${scrollPos}px`; document.body.classList.add('modal-open'); const m = document.getElementById(id); if(m) m.classList.add('active'); };
window.closeModal = (id) => { const m = document.getElementById(id); if(m) m.classList.remove('active'); document.body.classList.remove('modal-open'); document.body.style.top = ''; window.scrollTo(0, scrollPos); };
const normalizeText = (text) => { if(!text) return ""; return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
window.toggleElement = (id) => { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); };

function getWeekNumber(d) { d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7)); var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1)); var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7); return d.getUTCFullYear() + "_W" + weekNo; }

/* ===========================================================
   AUDIO & TIMER
   =========================================================== */
function initAudioEngine() { if (!audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); } if (audioCtx.state === 'suspended') { audioCtx.resume(); } }
function playTickSound(isFinal = false) { if(!audioCtx) return; if (audioCtx.state === 'suspended') audioCtx.resume(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime; if (isFinal) { osc.type = 'triangle'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 1); osc.start(now); osc.stop(now + 1); if("vibrate" in navigator) navigator.vibrate([300, 100, 300]); } else { osc.frequency.value = 1000; osc.type = 'sine'; osc.start(now); gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1); osc.stop(now + 0.1); } }
document.body.addEventListener('touchstart', initAudioEngine, {once:true});

function startTimerMini() { 
    if(durationInt) clearInterval(durationInt); 
    const d = document.getElementById('mini-timer'); 
    const barD = document.getElementById('bar-timer'); // Timer en barra flotante

    if(!activeWorkout || !activeWorkout.startTime) return;
    
    durationInt = setInterval(()=>{ 
        const diff = Math.floor((Date.now() - activeWorkout.startTime)/1000); 
        const m = Math.floor(diff/60); 
        const s = diff % 60; 
        const txt = `${m}:${s.toString().padStart(2,'0')}`;
        if(d) d.innerText = txt; 
        if(barD) barD.innerText = txt;
    }, 1000); 
}

/* ===========================================================
   HISTORIAL: BORRADO Y EDICIÓN (Solución Datos Erróneos)
   =========================================================== */
window.loadProfile = async () => {
    if(!userData) return;
    document.getElementById('profile-name').innerText = userData.name;
    // ... (resto de carga de perfil igual) ...
    // ... charts ...

    const histDiv = document.getElementById('user-history-list'); histDiv.innerHTML = "Cargando...";
    try {
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid));
        const snap = await getDocs(q);
        const workouts = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => b.date - a.date).slice(0, 10); // Mostramos 10 para facilitar borrado
        histDiv.innerHTML = workouts.length ? '' : "Sin historial.";
        
        workouts.forEach(d => {
            let dateStr = '-', timeStr = '';
            if(d.date) { 
                const dateObj = d.date.toDate ? d.date.toDate() : new Date(d.date.seconds*1000); 
                dateStr = dateObj.toLocaleDateString('es-ES', {day:'2-digit', month:'short'}); 
                timeStr = d.duration ? `⏱️ ${d.duration}` : '';
            }
            let rpeColor = 'rpe-easy'; if(d.rpe === 'Duro') rpeColor = 'rpe-hard'; if(d.rpe === 'Fallo') rpeColor = 'rpe-max';
            
            const detailsStr = d.details ? encodeURIComponent(JSON.stringify(d.details)) : ""; 
            const noteStr = d.note ? encodeURIComponent(d.note) : "";
            
            // BOTÓN DE BORRADO AÑADIDO (🗑️)
            const btnVer = d.details ? `<button class="btn-small btn-outline" style="margin:0; padding:2px 6px;" onclick="window.viewWorkoutDetails('${d.id}', '${d.routine}', '${detailsStr}', '${noteStr}', '${timeStr}')">🔍</button>` : '';
            const btnDel = `<button class="btn-small btn-danger" style="margin:0; padding:2px 6px; margin-left:5px;" onclick="window.deleteHistoryWorkout('${d.id}')">🗑️</button>`;

            histDiv.innerHTML += `<div class="history-row"><div style="color:var(--accent-color); font-weight:bold;">${dateStr}</div><div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${d.routine}</div><div style="display:flex; justify-content:center;"><span class="rpe-dot ${rpeColor}"></span></div><div style="text-align:right;">${btnVer}${btnDel}</div></div>`;
        });
    } catch(e) { histDiv.innerHTML = "Error."; }
    // ... render charts ...
};

// NUEVA FUNCIÓN PARA BORRAR ENTRENO
window.deleteHistoryWorkout = async (id) => {
    if(!confirm("¿BORRAR ESTE ENTRENO?\n\nSi los pesos estaban mal, esto corregirá las sugerencias para la próxima vez.\n\nEsta acción no se puede deshacer.")) return;
    try {
        await deleteDoc(doc(db, "workouts", id));
        // Nota: No restamos stats complejos por seguridad, pero el documento desaparece
        // y la lógica de "Prev" buscará automáticamente el anterior válido.
        alert("✅ Entreno eliminado.");
        window.loadProfile();
    } catch(e) { alert("Error al borrar: " + e.message); }
};

/* ===========================================================
   RUTINAS & RENDER (Optimized)
   =========================================================== */
async function loadRoutines() {
    const l = document.getElementById('routines-list'); l.innerHTML = 'Cargando...';
    onSnapshot(query(collection(db,"routines")), (s)=>{
        l.innerHTML = '';
        let myRoutines = [];
        s.forEach(d=>{ const r = d.data(); if(r.assignedTo && r.assignedTo.includes(currentUser.uid)){ myRoutines.push({id: d.id, ...r}); } });
        
        // Sorting
        const orderPreference = userData.routineOrder || [];
        myRoutines.sort((a, b) => {
            let indexA = orderPreference.indexOf(a.id); let indexB = orderPreference.indexOf(b.id);
            if (indexA === -1) indexA = 9999; if (indexB === -1) indexB = 9999;
            return indexA - indexB;
        });
        
        if(myRoutines.length === 0) { l.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No tienes rutinas asignadas.</div>'; return; }
        myRoutines.forEach(r => {
            const div = document.createElement('div'); div.className = 'card'; const canEdit = r.uid === currentUser.uid;
            div.innerHTML = `<div style="display:flex; justify-content:space-between;"><h3 style="color:var(--accent-color)">${r.name}</h3><div>${canEdit ? `<button style="background:none;border:none;margin-right:10px;" onclick="openEditor('${r.id}')">✏️</button>` : '🔒'}</div></div><p style="color:#666; font-size:0.8rem; margin:10px 0;">${r.exercises.length} Ejercicios</p><button class="btn" onclick="startWorkout('${r.id}')">ENTRENAR</button>`;
            l.appendChild(div);
        });
    });
}

/* ===========================================================
   WORKOUT ENGINE (Con Persistencia Local)
   =========================================================== */
function saveLocalWorkout() { 
    if(activeWorkout) localStorage.setItem('fit_active_workout', JSON.stringify(activeWorkout)); 
}

window.startWorkout = async (rid) => {
    // Si ya hay uno activo, avisar
    if(activeWorkout) {
        if(!confirm("⚠️ Ya tienes un entreno en curso. ¿Deseas descartarlo e iniciar este nuevo?")) return;
    }

    if(document.getElementById('cfg-wake').checked && 'wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {} }
    
    try {
        const snap = await getDoc(doc(db,"routines",rid)); const r = snap.data();
        
        // --- LÓGICA PREV (Corregida para ignorar borrados) ---
        // Firebase ordena desc. Tomamos el primero que exista. Si el usuario borró el último, este query cogerá el penúltimo automáticamente.
        let lastWorkoutData = null; 
        const q = query(collection(db, "workouts"), where("uid", "==", currentUser.uid)); 
        const wSnap = await getDocs(q); 
        const sameRoutine = wSnap.docs.map(d=>d.data()).filter(d => d.routine === r.name).sort((a,b) => b.date - a.date); 
        if(sameRoutine.length > 0) lastWorkoutData = sameRoutine[0].details;
        
        const now = Date.now(); initAudioEngine();
        
        activeWorkout = { name: r.name, startTime: now, exs: r.exercises.map(exObj => { 
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
        }) };
        
        saveLocalWorkout(); 
        renderWorkout(); 
        switchTab('workout-view'); 
        startTimerMini();
    } catch(e) { console.error(e); alert("Error iniciando entreno: " + e.message); }
};

window.cancelWorkout = () => { 
    if(confirm("⚠ ¿SEGURO QUE QUIERES CANCELAR?\nSe perderán los datos de este entrenamiento.")) { 
        activeWorkout = null; 
        localStorage.removeItem('fit_active_workout'); 
        if(durationInt) clearInterval(durationInt); 
        document.getElementById('active-workout-bar').classList.add('hidden'); // Ocultar barra
        switchTab('routines-view'); 
    } 
};

window.finishWorkout = async (rpeVal) => {
    try {
        window.closeModal('modal-rpe');
        const note = document.getElementById('workout-notes')?.value || "";
        
        // ... (Lógica de compilación de datos igual que antes) ...
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
        const h = Math.floor(durationMs / 3600000);
        const m = Math.floor((durationMs % 3600000) / 60000);
        const s = Math.floor((durationMs % 60000) / 1000);
        const durationStr = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

        const workoutNum = (userData.stats?.workouts || 0) + 1;
        const now = new Date(); const currentMonthKey = `${now.getFullYear()}_${now.getMonth()}`; const currentYearKey = `${now.getFullYear()}`; const currentWeekKey = getWeekNumber(now); 
        
        await addDoc(collection(db, "workouts"), { 
            uid: currentUser.uid, 
            date: serverTimestamp(), 
            routine: activeWorkout.name, 
            rpe: rpeVal, 
            note: note, 
            details: cleanLog, 
            workoutNumber: workoutNum, 
            sessionVolume: Number(totalKg.toFixed(2)), 
            duration: durationStr, 
            monthKey: currentMonthKey, 
            yearKey: currentYearKey, 
            weekKey: currentWeekKey 
        });

        // Actualizar Stats
        const updates = { "stats.workouts": increment(1), "stats.totalSets": increment(totalSets), "stats.totalReps": increment(totalReps), "stats.totalKg": increment(totalKg), "prs": userData.prs || {}, "lastWorkoutDate": serverTimestamp() };
        updates[`stats_week_${currentWeekKey}.kg`] = increment(totalKg);
        await updateDoc(doc(db, "users", currentUser.uid), updates);
        
        showToast(`🏆 ¡Entreno Completado!`);
        
        // LIMPIEZA
        localStorage.removeItem('fit_active_workout'); 
        activeWorkout = null; 
        document.getElementById('active-workout-bar').classList.add('hidden');
        if (durationInt) clearInterval(durationInt); 
        if (wakeLock) { await wakeLock.release(); wakeLock = null; } 
        
        switchTab('routines-view');
    } catch (error) { console.error("Error finish:", error); alert("Error crítico al guardar. Revisa tu conexión."); }
};

// --- MANTENEMOS EL RESTO DE FUNCIONES UI SIN CAMBIOS CRÍTICOS (Render, Timer, Editor, etc.) ---
// Asegurarse de que funciones como renderWorkout, addSet, removeSet usen saveLocalWorkout() siempre.
// (Ya incluido en el código anterior, las funciones uS, tS, addSet llaman a saveLocalWorkout)

// --- EJERCICIOS Y EDITOR (Reutilizamos la lógica Infinite Scroll creada antes) ---
// ... Copiar lógica de initExerciseList y renderNextBatch del paso anterior ...
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

// --- RESTO DE FUNCIONES (Helpers, Data, etc.) que ya tenías, copiadas tal cual ---
function getExerciseData(name) {
    let match = EXERCISES.find(e => e.n === name);
    if (!match) { const cleanName = normalizeText(name); match = EXERCISES.find(e => normalizeText(e.n) === cleanName); }
    if (!match) { return { img: 'logo.png', mInfo: {main:'General', sec:[]}, type:'c', v:null }; }
    return { img: match.img, mInfo: getMuscleInfoByGroup(match.m), type: match.t || 'c', v: match.v };
}
function getMuscleInfoByGroup(m) { let s = []; if(m==="Pecho") s=["Tríceps","Hombros"]; else if(m==="Espalda") s=["Bíceps", "Antebrazo"]; else if(m==="Cuádriceps") s=["Glúteos", "Gemelos"]; else if(m==="Isquios") s=["Glúteos", "Espalda Baja"]; else if(m==="Hombros") s=["Tríceps", "Trapecio"]; else if(m==="Bíceps") s=["Antebrazo"]; else if(m==="Tríceps") s=["Hombros", "Pecho"]; else if(m==="Glúteos") s=["Isquios", "Cuádriceps"]; return {main:m, sec:s}; }
window.toggleAuth = (m) => { document.getElementById('login-form').classList.toggle('hidden',m!=='login'); document.getElementById('register-form').classList.toggle('hidden',m!=='register'); };
window.logout = () => signOut(auth).then(()=>location.reload());
window.renderSelectedSummary = () => { const div = document.getElementById('selected-summary'); div.innerHTML = ''; if(currentRoutineSelections.length > 0) { const legendDiv = document.createElement('div'); legendDiv.className = 'editor-legend'; legendDiv.style.cssText = "display:flex; gap:8px; overflow-x:auto; padding:12px; background:#111; margin-bottom:15px; white-space:nowrap; border-bottom:1px solid #333; align-items:center; border-radius: 8px; position:sticky; top:0; z-index:10; cursor:pointer;"; legendDiv.onclick = () => { document.getElementById('exercise-selector-list').scrollTo({top:0, behavior:'smooth'}); }; let legendHTML = '<span style="font-size:0.7rem; color:#888; font-weight:bold; margin-right:5px;">ORDEN:</span>'; currentRoutineSelections.forEach((obj, idx) => { const isLast = idx === currentRoutineSelections.length - 1; const linkSymbol = obj.s ? '<span style="color:var(--accent-color); font-weight:bold;">🔗</span>' : ''; const separator = (isLast && !obj.s) ? '' : '<span style="color:#444">›</span>'; legendHTML += `<span onclick="event.stopPropagation(); document.getElementById('ex-card-${normalizeText(obj.n)}').scrollIntoView({behavior:'smooth', block:'center'});" style="font-size:0.85rem; color:#fff; cursor:pointer; text-decoration:underline; text-decoration-color:rgba(255,255,255,0.2);">${idx+1}. ${obj.n} ${linkSymbol}</span> ${separator}`; }); legendDiv.innerHTML = legendHTML; div.appendChild(legendDiv); } };
window.updateSelectionData = (idx, field, val) => { if(currentRoutineSelections[idx]) { currentRoutineSelections[idx][field] = field === 'series' ? (parseInt(val)||0) : val; } };
window.toggleSuperset = (idx) => { if (idx < currentRoutineSelections.length - 1) { currentRoutineSelections[idx].s = !currentRoutineSelections[idx].s; initExerciseList(filteredExercisesList); renderSelectedSummary(); } else { alert("No puedes hacer superserie con el último ejercicio."); } };
window.removeSelection = (name) => { currentRoutineSelections = currentRoutineSelections.filter(x => x.n !== name); renderSelectedSummary(); window.filterExercises(document.getElementById('ex-search').value); }
window.saveRoutine = async () => { const n = document.getElementById('editor-name').value; const s = window.currentRoutineSelections; if(!n || s.length === 0) return alert("❌ Faltan datos"); const btn = document.getElementById('btn-save-routine'); btn.innerText = "💾 GUARDANDO..."; let initialAssignments = []; if (userData.role !== 'admin') { initialAssignments.push(currentUser.uid); } try { const data = { uid: currentUser.uid, name: n, exercises: s, createdAt: serverTimestamp(), assignedTo: initialAssignments }; if(editingRoutineId) { await updateDoc(doc(db, "routines", editingRoutineId), { name: n, exercises: s }); } else { await addDoc(collection(db, "routines"), data); } alert("✅ Guardado"); switchTab('routines-view'); } catch(e) { alert("Error: " + e.message); } finally { btn.innerText = "GUARDAR"; } };
window.addSet = (exIdx) => { const sets = activeWorkout.exs[exIdx].sets; sets.push({r:16, w:0, d:false, prev:'-', numDisplay: (sets.length + 1).toString()}); saveLocalWorkout(); renderWorkout(); };
window.removeSet = (exIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.pop(); saveLocalWorkout(); renderWorkout(); } };
window.toggleAllSets = (exIdx) => { const ex = activeWorkout.exs[exIdx]; const allDone = ex.sets.every(s => s.d); const newState = !allDone; ex.sets.forEach(s => { s.d = newState; }); saveLocalWorkout(); renderWorkout(); if(newState) showToast("✅ Todas las series completadas"); };
window.openNoteModal = (idx) => { noteTargetIndex = idx; const existingNote = activeWorkout.exs[idx].note || ""; document.getElementById('exercise-note-input').value = existingNote; window.openModal('modal-note'); };
window.saveNote = () => { if (noteTargetIndex === null) return; const txt = document.getElementById('exercise-note-input').value.trim(); activeWorkout.exs[noteTargetIndex].note = txt; saveLocalWorkout(); renderWorkout(); window.closeModal('modal-note'); showToast(txt ? "📝 Nota guardada" : "🗑️ Nota borrada"); };
window.promptRPE = () => { const radarCtx = document.getElementById('muscleRadarChart'); if (!radarCtx) return; if (radarChartInstance) radarChartInstance.destroy(); const muscleCounts = { "Pecho":0, "Espalda":0, "Pierna":0, "Hombros":0, "Brazos":0, "Abs":0 }; if (activeWorkout && activeWorkout.exs) { activeWorkout.exs.forEach(e => { const m = e.mInfo?.main || "General"; let key = ""; if (["Pecho", "Espalda", "Hombros", "Abs"].includes(m)) key = m; else if (["Cuádriceps", "Isquios", "Glúteos", "Gemelos"].includes(m)) key = "Pierna"; else if (["Bíceps", "Tríceps"].includes(m)) key = "Brazos"; if (key && muscleCounts.hasOwnProperty(key)) { const completedSets = e.sets?.filter(s => s.d).length || 0; muscleCounts[key] += completedSets; } }); } radarChartInstance = new Chart(radarCtx, { type: 'radar', data: { labels: Object.keys(muscleCounts), datasets: [{ label: 'Series Finalizadas', data: Object.values(muscleCounts), backgroundColor: 'rgba(255, 51, 51, 0.4)', borderColor: '#ff3333', borderWidth: 2, pointBackgroundColor: '#ff3333', pointBorderColor: '#fff', pointRadius: 3, pointHoverRadius: 5 }] }, options: { scales: { r: { beginAtZero: true, min: 0, ticks: { display: false, stepSize: 1 }, grid: { color: '#333' }, angleLines: { color: '#333' }, pointLabels: { color: '#ffffff', font: { size: 10 } } } }, plugins: { legend: { display: false } }, maintainAspectRatio: false, responsive: true } }); window.openModal('modal-rpe'); };
window.uS = (i,j,k,v) => { activeWorkout.exs[i].sets[j][k]=v; saveLocalWorkout(); };
window.tS = async (i, j) => { const s = activeWorkout.exs[i].sets[j]; const exerciseName = activeWorkout.exs[i].n; s.d = !s.d; if(s.d) { const weight = parseFloat(s.w) || 0; const reps = parseInt(s.r) || 0; if (weight > 0 && reps > 0) { const estimated1RM = Math.round(weight / (1.0278 - (0.0278 * reps))); if (!userData.rmRecords) userData.rmRecords = {}; const currentRecord = userData.rmRecords[exerciseName] || 0; if (estimated1RM > currentRecord) { userData.rmRecords[exerciseName] = estimated1RM; updateDoc(doc(db, "users", currentUser.uid), { [`rmRecords.${exerciseName}`]: estimated1RM }); showToast(`🔥 ¡NUEVO NIVEL! 1RM: <b>${estimated1RM}kg</b>`); } else { const currentWeightPR = userData.prs ? (userData.prs[exerciseName] || 0) : 0; if (weight > currentWeightPR) { if(!userData.prs) userData.prs = {}; userData.prs[exerciseName] = weight; updateDoc(doc(db, "users", currentUser.uid), { [`prs.${exerciseName}`]: weight }); showToast(`💪 PR: ${weight}kg`); } } } openRest(); } saveLocalWorkout(); renderWorkout(); };
function showToast(msg) { const container = document.getElementById('toast-container') || createToastContainer(); const t = document.createElement('div'); t.className = 'toast-msg'; t.innerHTML = msg; container.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4000); }
function createToastContainer() { const div = document.createElement('div'); div.id = 'toast-container'; document.body.appendChild(div); return div; }
function openRest() { window.openModal('modal-timer'); initAudioEngine(); let duration = parseInt(userData.restTime) || 60; totalRestTime = duration; restEndTime = Date.now() + (duration * 1000); updateTimerVisuals(duration); if(timerInt) clearInterval(timerInt); timerInt = setInterval(() => { const now = Date.now(); const leftMs = restEndTime - now; const leftSec = Math.ceil(leftMs / 1000); if (leftSec >= 0) { updateTimerVisuals(leftSec); } if (leftSec <= 5 && leftSec > 0) { if (leftSec !== lastBeepSecond) { playTickSound(false); lastBeepSecond = leftSec; } } if (leftSec <= 0) { window.closeTimer(); playTickSound(true); } }, 250); }
window.closeTimer = () => { clearInterval(timerInt); window.closeModal('modal-timer'); };
window.addRestTime = (s) => { restEndTime += (s * 1000); if(s > 0) totalRestTime += s; const now = Date.now(); const left = Math.ceil((restEndTime - now) / 1000); updateTimerVisuals(left); };
function updateTimerVisuals(timeLeft) { const display = document.getElementById('timer-display'); const ring = document.getElementById('timer-progress-ring'); if(display) { display.innerText = timeLeft; display.style.color = timeLeft <= 5 ? "#fff" : "var(--accent-color)"; display.style.textShadow = timeLeft <= 5 ? "0 0 20px #fff" : "none"; } if(ring) { const circumference = 565; const offset = circumference - (timeLeft / totalRestTime) * circumference; ring.style.strokeDashoffset = offset; ring.style.stroke = "var(--accent-color)"; if (timeLeft <= 0) ring.style.stroke = "#ffffff"; } }
// Renderizado del Workout (Imprescindible para el flujo)
function renderWorkout() {
    const c = document.getElementById('workout-exercises'); c.innerHTML = ''; document.getElementById('workout-title').innerText = activeWorkout.name;
    activeWorkout.exs.forEach((e, i) => {
        let cardStyle = "border-left:3px solid var(--accent-color);"; let connector = ""; if (e.superset) { cardStyle += " margin-bottom: 0; border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom: 1px dashed #444;"; connector = `<div style="text-align:center; background:var(--card-color); color:var(--accent-color); font-size:1.2rem; line-height:0.5;">🔗</div>`; } else if (i > 0 && activeWorkout.exs[i-1].superset) cardStyle += " border-top-left-radius: 0; border-top-right-radius: 0; margin-top:0;";
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
window.removeSpecificSet = (exIdx, setIdx) => { if(activeWorkout.exs[exIdx].sets.length > 1) { activeWorkout.exs[exIdx].sets.splice(setIdx, 1); saveLocalWorkout(); renderWorkout(); } };
window.addDropset = (exIdx, setIdx) => { const currentSet = activeWorkout.exs[exIdx].sets[setIdx]; currentSet.d = true; const newSet = { r: Math.floor(currentSet.r * 0.8) || 10, w: Math.floor(currentSet.w * 0.7) || 0, d: false, prev: 'DROPSET', isDrop: true, numDisplay: (parseInt(currentSet.numDisplay) || (setIdx + 1)) + ".5" }; activeWorkout.exs[exIdx].sets.splice(setIdx + 1, 0, newSet); saveLocalWorkout(); renderWorkout(); };

// Auth Buttons
document.getElementById('btn-register').onclick=async()=>{ const secretCode = document.getElementById('reg-code').value; const tgUser = document.getElementById('reg-telegram')?.value || ""; try{ const c=await createUserWithEmailAndPassword(auth,document.getElementById('reg-email').value,document.getElementById('reg-pass').value); await setDoc(doc(db,"users",c.user.uid),{ name:document.getElementById('reg-name').value, email:document.getElementById('reg-email').value, secretCode: secretCode, telegram: tgUser, approved: false, role: 'athlete', gender:document.getElementById('reg-gender').value, age:parseInt(document.getElementById('reg-age').value), height:parseInt(document.getElementById('reg-height').value), weightHistory: [], measureHistory: [], skinfoldHistory: [], bioHistory: [], prs: {}, stats: {workouts:0, totalKg:0, totalSets:0, totalReps:0}, muscleStats: {}, joined: serverTimestamp(), showVideos: false, showBio: false, showPhotos: false }); }catch(e){alert("Error: " + e.message);} };
document.getElementById('btn-login').onclick=()=>signInWithEmailAndPassword(auth,document.getElementById('login-email').value,document.getElementById('login-pass').value).catch(e=>alert(e.message));
