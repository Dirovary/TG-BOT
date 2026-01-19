import TelegramBot from "node-telegram-bot-api";
import fetch from "node-fetch";
import "dotenv/config";
import fs from "fs";

import { getWeather } from "./weather.js";
import { handleReactions } from "./reactions.js";
import { generateVoice } from "./voice.js";

// =======================================
//  ИНИЦИАЛИЗАЦИЯ БОТА
// =======================================
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let botId = null;
let startTime = Date.now();
let retryCount = 0;

// =======================================
//  АДМИНЫ
// =======================================
const ADMINS = new Set(
    (process.env.ADMINS || "")
        .split(",")
        .map(id => Number(id.trim()))
        .filter(id => !isNaN(id))
);

// =======================================
//  БАНЫ
// =======================================
const BAN_FILE = "banned.json";
if (!fs.existsSync(BAN_FILE)) fs.writeFileSync(BAN_FILE, JSON.stringify([]));

const loadBans = () => JSON.parse(fs.readFileSync(BAN_FILE, "utf8"));
const saveBans = (list) => fs.writeFileSync(BAN_FILE, JSON.stringify(list, null, 2));

function banUser(id) {
    const list = loadBans();
    if (!list.includes(id)) {
        list.push(id);
        saveBans(list);
    }
}

function unbanUser(id) {
    saveBans(loadBans().filter(x => x !== id));
}

function isBanned(id) {
    return loadBans().includes(id);
}

// Получение ID по username
async function resolveUserId(usernameOrId) {
    if (!isNaN(Number(usernameOrId))) return Number(usernameOrId);

    const username = usernameOrId.replace("@", "").trim();
    try {
        const user = await bot.getChat(username);
        return user.id;
    } catch {
        return null;
    }
}

// =======================================
//  ПАМЯТЬ
// =======================================
const MEMORY_FILE = "memory.json";
const MEMORY_LIFETIME = 500 * 60 * 1000;

if (!fs.existsSync(MEMORY_FILE)) fs.writeFileSync(MEMORY_FILE, JSON.stringify([]));

function loadMemory() {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
}

function saveMemory(data) {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

function remember(text, userId) {
    const mem = loadMemory();
    mem.push({ text, userId, time: Date.now() });
    saveMemory(mem);
}

function getRecentMemory() {
    const now = Date.now();
    return loadMemory().filter(m => now - m.time <= MEMORY_LIFETIME);
}

function cleanMemory() {
    const now = Date.now();
    saveMemory(loadMemory().filter(m => now - m.time <= MEMORY_LIFETIME));
}

setInterval(cleanMemory, 30000);

// =======================================
//  СТАРТ БОТА
// =======================================
bot.getMe().then(info => {
    botId = info.id;
    console.log("Bot started! ID:", botId);
});

// =======================================
//  GEMINI 2.5 FLASH API
// =======================================
async function geminiRequest(systemPrompt, messages) {
    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" +
        `?key=${process.env.GEMINI_API_KEY}`;

    const contents = [];

    if (systemPrompt) {
        contents.push({
            role: "user",
            parts: [{ text: systemPrompt }]
        });
    }

    for (const m of messages) {
        contents.push({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        });
    }

    while (true) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents })
            });

            const data = await response.json();

            if (response.ok) return data;

            retryCount++;
            console.log("⚠ Gemini error — retry 10s", data);
            await new Promise(r => setTimeout(r, 10000));

        } catch (err) {
            retryCount++;
            console.log("⚠ Network error — retry 5s");
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ==========================================================
//    ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ
// ==========================================================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const rawText = msg.text || "";
    const lower = rawText.toLowerCase();

    // Бан
    if (isBanned(userId)) return;

    // Реакции
    handleReactions(bot, msg);

    // ===========
    // АДМИН КОНСОЛЬ
    // ===========
    if (lower === "консоль") {
        if (!ADMINS.has(userId)) {
            await bot.sendMessage(chatId, "⛔ У тебя нет доступа.");
            return;
        }

        const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;

        await bot.sendMessage(
            chatId,
            `🖥 *Админ консоль*\n\n` +
            `⏱ Аптайм: ${h}ч ${m}м ${s}с\n` +
            `🔄 Повторов: ${retryCount}\n` +
            `🧠 Память: ${loadMemory().length}\n` +
            `🤖 Bot ID: ${botId}\n` +
            `📦 MODEL: gemini-2.5-flash`,
            { parse_mode: "Markdown" }
        );
        return;
    }

    // ===========
    // БАНЫ
    // ===========
    if (lower.startsWith("/ban ")) {
        if (!ADMINS.has(userId)) {
            await bot.sendMessage(chatId, "⛔ Нет доступа.");
            return;
        }

        const arg = rawText.split(" ")[1];
        const targetId = msg.reply_to_message?.from?.id || await resolveUserId(arg);

        if (!targetId) {
            await bot.sendMessage(chatId, "⚠ Не удалось получить ID.");
            return;
        }

        banUser(targetId);
        await bot.sendMessage(chatId, `🚫 Забанен: ${targetId}`);
        return;
    }

    if (lower.startsWith("/unban ")) {
        if (!ADMINS.has(userId)) {
            await bot.sendMessage(chatId, "⛔ Нет доступа.");
            return;
        }

        const arg = rawText.split(" ")[1];
        const targetId = await resolveUserId(arg);

        if (!targetId) {
            await bot.sendMessage(chatId, "⚠ Не удалось получить ID.");
            return;
        }

        unbanUser(targetId);
        await bot.sendMessage(chatId, `✅ Разбанен: ${targetId}`);
        return;
    }

    // ===========
    // ПОГОДА
    // ===========
    if (lower.startsWith("погода ")) {
        const city = rawText.substring(7).trim();
        const weatherMsg = await getWeather(city);
        await bot.sendMessage(chatId, weatherMsg, { parse_mode: "Markdown" });
        return;
    }

    // ===========
    // ПАМЯТЬ
    // ===========
    remember(rawText, userId);

    // =======================================
    //  ОТПРАВКА АДМИНАМ
    // =======================================
    for (const adminId of ADMINS) {
        if (adminId === userId) continue;

        if (msg.photo && msg.photo.length > 0) {
            const largestPhoto = msg.photo[msg.photo.length - 1].file_id;

            await bot.sendPhoto(adminId, largestPhoto, {
                caption:
                    `📷 *Фото от пользователя*\n` +
                    `👤 ID: ${userId}\n` +
                    (rawText ? `💬 Текст: ${rawText}` : ""),
                parse_mode: "Markdown"
            });
            continue;
        }

        if (rawText) {
            await bot.sendMessage(
                adminId,
                `📩 *Новое сообщение*\n` +
                `👤 ID: ${userId}\n` +
                `💬: ${rawText}`,
                { parse_mode: "Markdown" }
            );
        }
    }

    // ===========
    // ТРИГГЕРЫ
    // ===========
    const isReplyToBot = msg.reply_to_message?.from?.id === botId;
    const triggers = ["скаперс", "скаперсик", "ваня"];
    const triggered = triggers.some(w => lower.includes(w));

    if (!triggered && !isReplyToBot) return;

    const recent = getRecentMemory().map(m => ({
        role: m.userId === userId ? "user" : "assistant",
        content: m.text
    }));

    recent.push({ role: "user", content: rawText });

    // ===========
    // GEMINI
    // ===========
    try {
        const data = await geminiRequest(
            process.env.SYSTEM_PROMPT,
            recent
        );

        const reply =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            "Ошибка ответа модели.";

        await bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });

    } catch (err) {
        console.error("GEMINI ERROR:", err);
        await bot.sendMessage(chatId, "Ошибка при запросе к модели.");
    }
});

// ==========================================================
//  ОТДЕЛЬНЫЙ HANDLER ДЛЯ /voice
// ==========================================================
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (!text.startsWith("/voice")) return;

    const message = text.replace("/voice", "").trim();

    if (!message) {
        await bot.sendMessage(chatId, "Напиши текст после команды /voice");
        return;
    }

    try {
        const voicePath = await generateVoice(message);
        await bot.sendVoice(chatId, voicePath);
    } catch (err) {
        console.error("VOICE ERROR:", err);
        await bot.sendMessage(chatId, "Ошибка генерации голосового сообщения.");
    }
});

