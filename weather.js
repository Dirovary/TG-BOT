// weather.js — модуль команды "погода"

import fetch from "node-fetch";

/**
 * Получить погоду по названию города
 * @param {string} city
 * @returns {Promise<string>} текст ответа для Telegram
 */
export async function getWeather(city) {
    if (!city) return "ℹ Укажи город. Пример: погода Москва";

    try {
        // 1) Геокодинг
        const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`
        );
        const geo = await geoRes.json();

        if (!geo.results || geo.results.length === 0) {
            return `❌ Город *${city}* не найден.`;
        }

        const { latitude, longitude, name, country } = geo.results[0];

        // 2) Погода
        const wRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&timezone=auto`
        );
        const weather = await wRes.json();

        if (!weather.current_weather) {
            return "❌ Не удалось получить погодные данные.";
        }

        const w = weather.current_weather;

        return (
            `🌤 *Погода — ${name}, ${country}*\n\n` +
            `🌡 Температура: *${w.temperature}°C*\n` +
            `💨 Ветер: *${w.windspeed} км/ч*\n` +
            `🧭 Направление: *${w.winddirection}°*\n` +
            `⏱ Время: *${w.time.replace("T", " ")}*`
        );

    } catch (err) {
        console.error("Ошибка weather.js:", err);
        return "❗ Ошибка при получении погоды.";
    }
}
