    // =====================================================
    //  БАН / РАЗБАН
    // =====================================================

    async function resolveUserId(usernameOrId) {
        // Если это чистое число — сразу возвращаем как ID
        if (!isNaN(Number(usernameOrId))) {
            return Number(usernameOrId);
        }

        // убираем @ если есть
        const username = usernameOrId.replace("@", "");

        try {
            const user = await bot.getChat(username);
            return user.id;
        } catch (e) {
            return null;
        }
    }

    if (lower.startsWith("/ban ")) {
        if (!ADMINS.has(userId))
            return bot.sendMessage(chatId, "⛔ Нет доступа.");

        const arg = rawText.split(" ")[1];
        if (!arg) return bot.sendMessage(chatId, "⚠ Укажи @username или ID.");

        const targetId = await resolveUserId(arg);

        if (!targetId)
            return bot.sendMessage(chatId, "⚠ Не удалось получить ID пользователя.");

        banUser(targetId);
        return bot.sendMessage(chatId, `🚫 Заблокирован: ${targetId}`);
    }

    if (lower.startsWith("/unban ")) {
        if (!ADMINS.has(userId))
            return bot.sendMessage(chatId, "⛔ Нет доступа.");

        const arg = rawText.split(" ")[1];
        if (!arg) return bot.sendMessage(chatId, "⚠ Укажи @username или ID.");

        const targetId = await resolveUserId(arg);

        if (!targetId)
            return bot.sendMessage(chatId, "⚠ Не удалось получить ID пользователя.");

        unbanUser(targetId);
        return bot.sendMessage(chatId, `✅ Разблокирован: ${targetId}`);
    }
