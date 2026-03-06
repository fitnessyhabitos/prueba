// =============================================================
//  FitData Pro – Telegram Bot Notification Helper
//  Bot: @Fitdatapro_bot
//  Token: 8453282511:AAH8pSrfKQyZHtL6117O6xDoPj8aG7_ioWg
//  Admin: @fityhab
// =============================================================

import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";

const TELEGRAM_TOKEN = "8453282511:AAH8pSrfKQyZHtL6117O6xDoPj8aG7_ioWg";
const API_BASE = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// Resolved once per session and cached here
let _adminChatId = null;

// ---------------------------------------------------------------
// Internal: fetch the admin's Telegram chat_id
// Strategy:
//   1. Check Firestore settings/telegramAdmin for a stored chat_id
//   2. If not found, poll getUpdates (only works after admin sends /start)
//      and save the result to Firestore for future sessions
// ---------------------------------------------------------------
async function getAdminChatId() {
    if (_adminChatId) return _adminChatId;

    try {
        const db = getFirestore(getApp());
        const snap = await getDoc(doc(db, "settings", "telegramAdmin"));
        if (snap.exists() && snap.data().chatId) {
            _adminChatId = snap.data().chatId;
            return _adminChatId;
        }

        // Not stored yet – try getUpdates to find admin's chat id
        const res = await fetch(`${API_BASE}/getUpdates?limit=100&allowed_updates=message`, { method: "GET" });
        const json = await res.json();
        if (json.ok && json.result && json.result.length > 0) {
            // Take the first update from any user
            const chatId = json.result[json.result.length - 1].message?.chat?.id;
            if (chatId) {
                _adminChatId = String(chatId);
                // Persist for future sessions
                await setDoc(doc(db, "settings", "telegramAdmin"), { chatId: _adminChatId }, { merge: true });
                return _adminChatId;
            }
        }
    } catch (e) {
        console.warn("[Telegram] Could not resolve admin chat id:", e);
    }
    return null;
}

// ---------------------------------------------------------------
// Core sender – fire-and-forget. HTML parse mode supported.
// ---------------------------------------------------------------
export async function sendTelegramNotification(message) {
    try {
        const chatId = await getAdminChatId();
        if (!chatId) {
            console.warn("[Telegram] Admin chat id not resolved. Skipping notification.");
            return;
        }
        await fetch(`${API_BASE}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
                disable_web_page_preview: true
            })
        });
    } catch (e) {
        console.warn("[Telegram] Notification failed:", e);
    }
}

// ---------------------------------------------------------------
// Notification formatters – one per tracked event
// ---------------------------------------------------------------

/** 🏋️ Workout completed */
export function notifyWorkoutDone(userName, routineName, { totalSets, totalReps, totalKg, duration, workoutNum, rpe }) {
    const msg =
        `🏋️ <b>ENTRENO COMPLETADO</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `📋 Rutina: <i>${routineName}</i>\n` +
        `🔢 Nº entreno: ${workoutNum}\n` +
        `⏱️ Duración: ${duration}\n` +
        `📊 Series: ${totalSets} · Reps: ${totalReps} · Volumen: ${Number(totalKg).toFixed(1)} kg\n` +
        `💢 RPE: ${rpe || '-'}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** ⚖️ New weight entry */
export function notifyWeightEntry(userName, weight) {
    const msg =
        `⚖️ <b>PESO REGISTRADO</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `📉 Peso: <b>${weight} kg</b>\n` +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 📐 Body measurements saved */
export function notifyMeasurements(userName, data) {
    const lines = [];
    if (data.chest)    lines.push(`Pecho: ${data.chest} cm`);
    if (data.waist)    lines.push(`Cintura: ${data.waist} cm`);
    if (data.hip)      lines.push(`Cadera: ${data.hip} cm`);
    if (data.arm)      lines.push(`Brazo: ${data.arm} cm`);
    if (data.thigh)    lines.push(`Muslo: ${data.thigh} cm`);
    if (data.calf)     lines.push(`Gemelo: ${data.calf} cm`);
    if (data.shoulder) lines.push(`Hombros: ${data.shoulder} cm`);
    const msg =
        `📐 <b>MEDIDAS CORPORALES</b>\n` +
        `👤 <b>${userName}</b>\n` +
        lines.map(l => `  • ${l}`).join('\n') + '\n' +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 🔬 Skinfold / body fat calculated */
export function notifySkinfolds(userName, fat, skinfolds) {
    const sum = Object.values(skinfolds).reduce((a, b) => a + (b || 0), 0);
    const msg =
        `🔬 <b>PLIEGUES CUTÁNEOS</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `📌 Suma pliegues: ${sum.toFixed(1)} mm\n` +
        `🧪 Grasa corporal: <b>${fat}%</b>\n` +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 🧬 Bioimpedance entry (muscle/fat from device) */
export function notifyBioEntry(userName, muscle, fat) {
    const msg =
        `🧬 <b>BIOIMPEDANCIA</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `💪 Músculo: <b>${muscle} kg</b>\n` +
        `🧪 Grasa: <b>${fat} kg</b>\n` +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 📋 New routine created */
export function notifyRoutineCreated(userName, routineName, exerciseCount) {
    const msg =
        `📋 <b>RUTINA CREADA</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `🏷️ Nombre: <i>${routineName}</i>\n` +
        `🔢 Ejercicios: ${exerciseCount}\n` +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 📸 Progress photo uploaded */
export function notifyPhotoUpload(userName) {
    const msg =
        `📸 <b>FOTO SUBIDA</b>\n` +
        `👤 <b>${userName}</b>\n` +
        `✅ Ha subido una nueva foto de progreso.\n` +
        `🗓️ ${new Date().toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}

/** 💳 Payment / subscription added */
export function notifyPayment(clientName, months, amount, newExpiry) {
    const msg =
        `💳 <b>PAGO REGISTRADO</b>\n` +
        `👤 Cliente: <b>${clientName}</b>\n` +
        `📅 Meses añadidos: <b>${months}</b>\n` +
        `💵 Importe: <b>${parseFloat(amount).toFixed(2)} €</b>\n` +
        `📆 Nueva caducidad: ${new Date(newExpiry).toLocaleDateString('es-ES')}`;
    return sendTelegramNotification(msg).catch(() => {});
}
