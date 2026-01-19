// voice.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import gTTS from "gtts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUT_DIR = path.join(__dirname, "voices");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

export async function generateVoice(text) {
    return new Promise((resolve, reject) => {
        try {
            const filename = `voice_${Date.now()}.mp3`;
            const filePath = path.join(OUT_DIR, filename);

            const tts = new gTTS(text, "ru");

            tts.save(filePath, (err) => {
                if (err) {
                    console.error("VOICE ERROR:", err);
                    resolve(null);
                } else {
                    resolve(filePath);
                }
            });

        } catch (e) {
            console.error("VOICE ERROR:", e);
            resolve(null);
        }
    });
}
