// reactions.js
import fetch from "node-fetch";

export async function handleReactions(bot, msg) {
    const chance = 0.20; // 5%

    if (Math.random() > chance) return;         // шанс
    if (!msg || !msg.chat || !msg.message_id) return;

    try {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/setMessageReaction`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: msg.chat.id,
                message_id: msg.message_id,
                reaction: [
                    { emoji: "🔥" }
                ],
                is_big: false
            })
        });
    } catch (err) {
        console.error("Reaction error:", err.message);
    }
}
