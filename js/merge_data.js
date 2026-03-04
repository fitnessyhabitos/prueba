/**
 * merge_data.js
 * Genera data junto.js:
 *   PARTE 1: Ejercicios originales de data.js, nombres en MAYÚSCULAS, agrupados por target
 *   PARTE 2: Ejercicios nuevos de "data completo.txt", también agrupados por target
 * Uso: node merge_data.js   (desde la carpeta public/js/)
 */

const fs = require('fs');
const path = require('path');

// ── RUTAS ─────────────────────────────────────────────────────────────
const GIF_DIR = path.join(__dirname, '..', 'gif');
const DATA_JS = path.join(__dirname, 'data.js');
const DATA_TXT = path.join(__dirname, 'data completo.txt');
const OUTPUT = path.join(__dirname, 'data junto.js');

// ── 1. MAPA ID → NOMBRE COMPLETO DEL GIF ──────────────────────────────
console.log('📂 Leyendo carpeta gif...');
const gifFiles = fs.readdirSync(GIF_DIR).filter(f => f.endsWith('.gif'));
const gifMap = {};  // e.g. { "0032": "0032_barra_peso_muerto.gif" }
for (const f of gifFiles) {
    const id = f.split('_')[0];
    gifMap[id] = f;
}
console.log(`   → ${gifFiles.length} GIFs indexados`);

function resolveGif(vField) {
    if (!vField) return '';
    if (vField.includes('_')) return vField;      // Ya tiene nombre completo
    const id = vField.replace('.gif', '').trim();
    const paddedId = id.padStart(4, '0');
    return gifMap[paddedId] || vField;
}

// ── 2. MAPA TARGET → IMAGEN ────────────────────────────────────────────
const TARGET_IMAGES = {
    cuadriceps: 'cuadriceps.png', isquios: 'isquios.png', gluteos: 'gluteos.png',
    abductores: 'abductores.png', aductores: 'aductores.png', gemelos: 'gemelos.png',
    dorsales: 'dorsales.png', espalda_alta: 'espalda_alta.png', espalda_baja: 'espalda_baja.png',
    pecho: 'pecho.png', hombros: 'hombros.png', hombros_frontal: 'hombros.png',
    hombros_posterior: 'hombros.png', biceps: 'biceps.png', triceps: 'triceps.png',
    antebrazo: 'antebrazo.png', abs: 'abs.png', oblicuos: 'abs.png',
    core: 'abs.png', core_inferior: 'abs.png',
    cardio: 'cardio.png', cardiovascular: 'cardio.png', full_body: 'cardio.png', hiit: 'cardio.png',
    levantamientos: 'espalda_baja.png',
};

const CARDIO_TARGETS = new Set(['cardiovascular', 'cardio', 'full_body', 'hiit']);
const CARDIO_KEYWORDS = [
    'correr', 'carrera', 'bicicleta', 'ciclismo', 'remo ergómetro', 'remo ergo',
    'elíptica', 'eliptica', 'caminata', 'caminar', 'comba', 'cuerda saltar',
    'burpee', 'jumping', 'sprint', 'bike', 'rowing machine', 'ergómetro',
    'escaladora', 'step machine', 'stair', 'ski erg', 'battle rope',
    'cuerdas de batalla', 'rapido pies', 'stationary', 'salto', 'jumping jack'
];

function getImg(target, name) {
    const nameLower = name.toLowerCase();
    if (CARDIO_TARGETS.has(target)) return 'cardio.png';
    for (const kw of CARDIO_KEYWORDS) { if (nameLower.includes(kw)) return 'cardio.png'; }
    return TARGET_IMAGES[target] || 'abs.png';
}

const TARGET_M = {
    cuadriceps: 'Cuádriceps', isquios: 'Isquios', gluteos: 'Glúteos',
    abductores: 'Abductores', aductores: 'Aductores', gemelos: 'Gemelos',
    dorsales: 'Dorsales', espalda_alta: 'Espalda Alta', espalda_baja: 'Espalda Baja',
    pecho: 'Pecho', hombros: 'Hombros', hombros_frontal: 'Hombros',
    hombros_posterior: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps',
    antebrazo: 'Antebrazo', abs: 'Abs', oblicuos: 'Abs', core: 'Abs',
    core_inferior: 'Abs', cardio: 'Cardio', cardiovascular: 'Cardio',
    full_body: 'Full Body', hiit: 'HIIT',
};
const TARGET_LABELS = {
    cuadriceps: 'CUÁDRICEPS', isquios: 'ISQUIOTIBIALES', gluteos: 'GLÚTEOS',
    abductores: 'ABDUCTORES / ADUCTORES', aductores: 'ABDUCTORES / ADUCTORES',
    gemelos: 'GEMELOS', dorsales: 'DORSALES', espalda_alta: 'ESPALDA ALTA',
    espalda_baja: 'ESPALDA BAJA', pecho: 'PECHO', hombros: 'HOMBROS',
    hombros_frontal: 'HOMBROS (FRONTAL)', hombros_posterior: 'HOMBROS (POSTERIOR)',
    biceps: 'BÍCEPS', triceps: 'TRÍCEPS', antebrazo: 'ANTEBRAZO',
    abs: 'ABDOMINALES', oblicuos: 'OBLICUOS', core: 'CORE', core_inferior: 'CORE INFERIOR',
    cardio: 'CARDIO', cardiovascular: 'CARDIOVASCULAR', full_body: 'FULL BODY', hiit: 'HIIT',
};

const MUSCLE_ORDER = [
    'cuadriceps', 'isquios', 'gluteos', 'abductores', 'aductores', 'gemelos',
    'dorsales', 'espalda_alta', 'espalda_baja',
    'pecho', 'hombros', 'hombros_frontal', 'hombros_posterior',
    'biceps', 'triceps', 'antebrazo',
    'abs', 'oblicuos', 'core', 'core_inferior',
    'cardio', 'cardiovascular', 'full_body', 'hiit'
];
function muscleOrder(target) { const i = MUSCLE_ORDER.indexOf(target); return i === -1 ? 999 : i; }

// ── 3. PARSEAR data.js → extraer ejercicios completos ─────────────────
console.log('📄 Leyendo data.js...');
const dataJsRaw = fs.readFileSync(DATA_JS, 'utf8');

// Evaluamos el módulo original para extraer los objetos correctamente
// Usamos Function para parsear el array JS sin módulos ES
let originalExercises = [];
try {
    // Substituir export const para poder evaluar
    const evalStr = dataJsRaw
        .replace(/export\s+const\s+EXERCISES\s*=\s*\[/, 'globalThis._EX = [')
        .replace(/\];\s*$/, '];');
    Function('"use strict";' + evalStr)();
    originalExercises = globalThis._EX || [];
    delete globalThis._EX;
} catch (e) {
    console.error('Error evaluando data.js:', e.message);
    process.exit(1);
}
console.log(`   → ${originalExercises.length} ejercicios originales cargados`);

// Set de nombres normalizados para deduplicación
const originalNames = new Set(originalExercises.map(e => normalize(e.n)));

// ── 4. PARSEAR data completo.txt ───────────────────────────────────────
console.log('📄 Leyendo data completo.txt...');
let txtRaw = fs.readFileSync(DATA_TXT, 'utf8');
txtRaw = txtRaw.replace(/,,/g, ',');
const lines = txtRaw.split('\n');

const newExercises = [];
let skipped = 0, gifMapped = 0;

for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//') || line.startsWith('export') || line === '];' || line === '[') continue;
    const cleanLine = line.replace(/,\s*$/, '').trim();
    if (!cleanLine.startsWith('{')) continue;

    let obj;
    try {
        let jsonStr = cleanLine
            .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')
            .replace(/:\s*'([^']*)'/g, ': "$1"')
            .replace(/,\s*}/g, '}');
        obj = JSON.parse(jsonStr);
    } catch (e) {
        try { obj = Function('"use strict"; return (' + cleanLine + ')')(); } catch { continue; }
    }
    if (!obj || !obj.n) continue;

    if (isDuplicate(obj.n, originalNames)) { skipped++; continue; }

    const originalV = obj.v || '';
    const resolvedV = resolveGif(originalV);
    if (originalV && resolvedV !== originalV) gifMapped++;

    const name = (obj.n || '').toUpperCase();
    const target = (obj.target || '').toLowerCase().trim();
    const img = getImg(target, name);
    const sec = Array.isArray(obj.sec) ? obj.sec : [];
    const instructions = Array.isArray(obj.instructions) ? obj.instructions : [];

    newExercises.push({
        n: name,
        img,
        m: obj.m || TARGET_M[target] || 'Varios',
        t: obj.t || 'c',
        target,
        sec,
        instructions,
        v: resolvedV,
    });
}

console.log(`   → ${newExercises.length} ejercicios nuevos`);
console.log(`   → ${skipped} duplicados eliminados`);
console.log(`   → ${gifMapped} GIFs resueltos`);

// Ordenar nuevos por target
newExercises.sort((a, b) => {
    const diff = muscleOrder(a.target) - muscleOrder(b.target);
    if (diff !== 0) return diff;
    return a.n.localeCompare(b.n);
});

// ── 5. GENERAR data junto.js ───────────────────────────────────────────
console.log('✍️  Generando data junto.js...');

function serializeExercise(ex) {
    const instructionStr = ex.instructions && ex.instructions.length
        ? '["' + ex.instructions.map(s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')).join('", "') + '"]'
        : '[]';
    const secStr = ex.sec && ex.sec.length
        ? '["' + ex.sec.join('", "') + '"]'
        : '[]';
    const n = String(ex.n).replace(/"/g, '\\"');
    return `{ n: "${n}", img: "${ex.img}", m: "${ex.m}", t: "${ex.t}", target: "${ex.target}", sec: ${secStr}, instructions: ${instructionStr}, v: "${ex.v}" }`;
}

// ─── PARTE 1: Originales en MAYÚSCULAS, agrupados por target ──────────
// Agrupar por target
const origByTarget = {};
for (const ex of originalExercises) {
    const tgt = (ex.target || 'abs').toLowerCase();
    if (!origByTarget[tgt]) origByTarget[tgt] = [];
    // Nombre en MAYÚSCULAS
    origByTarget[tgt].push({ ...ex, n: ex.n.toUpperCase() });
}

// Ordenar targets por MUSCLE_ORDER
const origTargets = Object.keys(origByTarget).sort((a, b) => muscleOrder(a) - muscleOrder(b));

// Generar bloque original, con separador si abductores/aductores iran juntos
const seenOrigLabels = new Set();
let origBlock = '';
for (const tgt of origTargets) {
    const label = TARGET_LABELS[tgt] || tgt.toUpperCase().replace(/_/g, ' ');
    if (!seenOrigLabels.has(label)) {
        origBlock += `\n// ─── ${label} ───\n`;
        seenOrigLabels.add(label);
    }
    for (const ex of origByTarget[tgt]) {
        origBlock += serializeExercise(ex) + ',\n';
    }
}

// ─── PARTE 2: ExerciseDB agrupados por target ──────────────────────────
let newBlock = '';
let lastTarget = null;
const seenNewLabels = new Set();
for (const ex of newExercises) {
    const label = TARGET_LABELS[ex.target] || ex.target.toUpperCase().replace(/_/g, ' ');
    if (!seenNewLabels.has(label)) {
        newBlock += `\n// ─── ${label} (ExerciseDB) ───\n`;
        seenNewLabels.add(label);
        lastTarget = ex.target;
    }
    newBlock += serializeExercise(ex) + ',\n';
}

const output =
    `// --- BASE DE DATOS DE EJERCICIOS ---
// t: 'c' (Compuesto) | t: 'i' (Aislado)
// target: músculo principal | sec: músculos secundarios
// v: GIF animado
//
// targets válidos: cuadriceps | isquios | gluteos | abductores | aductores | gemelos
//   dorsales | espalda_alta | espalda_baja | pecho | hombros | hombros_frontal
//   hombros_posterior | biceps | triceps | antebrazo | abs | oblicuos | core | core_inferior
//   cardio | cardiovascular

export const EXERCISES = [
${origBlock}
// ═══════════════════════════════════════════════════════════════════════
// ═══  EJERCICIOS EXERCISEDB  ════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
${newBlock}
];
`;

fs.writeFileSync(OUTPUT, output, 'utf8');

const total = originalExercises.length + newExercises.length;
console.log('\n✅ COMPLETADO');
console.log(`   Originales : ${originalExercises.length}`);
console.log(`   Nuevos     : ${newExercises.length}`);
console.log(`   Total      : ${total}`);
console.log(`   Duplicados : ${skipped}`);
console.log(`\n📁 Archivo: ${OUTPUT}`);

// ── HELPERS ───────────────────────────────────────────────────────────
function normalize(str) {
    return str
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isDuplicate(name, originalSet) {
    const norm = normalize(name);
    if (originalSet.has(norm)) return true;
    for (const orig of originalSet) {
        if (norm.length > 8 && orig.startsWith(norm.substring(0, Math.min(15, norm.length - 2)))) return true;
        if (norm.length > 8 && norm.startsWith(orig.substring(0, Math.min(15, orig.length - 2)))) return true;
    }
    return false;
}
