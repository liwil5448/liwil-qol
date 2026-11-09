/**
 * Regroupe visuellement les messages qui se suivent (cadre du chat sombre).
 * Deux messages consécutifs forment un même groupe s'ils ont :
 *   - le même auteur et le même locuteur (même token, même acteur, ou l'utilisateur lui-même sans token) ;
 *   - moins de 10 minutes d'écart.
 * Chaque message reçoit au rendu sa clé de groupe (data-lqol-group) et son heure (data-lqol-time),
 * puis chaque liste de messages est relue à chaque ajout, suppression ou remplacement :
 *   .lqol-joined-prev : le message précédent est du même groupe
 *   .lqol-joined-next : le message suivant est du même groupe
 * Le CSS dessine un cadre épais autour du groupe et un liseré fin entre ses messages.
 */

/** Écart maximal entre deux messages d'un même groupe */
const MAX_GAP = 10 * 60 * 1000;

function joined(a, b) {
    if (!a || !b) return false;
    const key = a.dataset.lqolGroup;
    if (!key || key !== b.dataset.lqolGroup) return false;
    return Math.abs(Number(a.dataset.lqolTime) - Number(b.dataset.lqolTime)) <= MAX_GAP;
}

function regroup(log) {
    const messages = [...log.children].filter(element => element.classList.contains("chat-message"));
    messages.forEach((message, index) => {
        message.classList.toggle("lqol-joined-prev", joined(message, messages[index - 1]));
        message.classList.toggle("lqol-joined-next", joined(message, messages[index + 1]));
    });
}

/** Locuteur : token, sinon acteur, sinon l'utilisateur lui-même */
function speakerKey(speaker = {}) {
    if (speaker.token) return `token:${speaker.scene ?? ""}.${speaker.token}`;
    if (speaker.actor) return `actor:${speaker.actor}`;
    return "user";
}

export const ChatGroups = {
    /** Clé de groupe et heure du message, posées au rendu (renderChatMessageHTML) */
    tag(message, html) {
        if (!message.author?.id) return;
        html.dataset.lqolGroup = `${message.author.id}|${speakerKey(message.speaker)}`;
        html.dataset.lqolTime = String(message.timestamp ?? 0);
    },

    listen() {
        const observer = new MutationObserver(mutations => {
            const logs = new Set();
            for (const mutation of mutations) {
                if (mutation.target.classList?.contains("chat-log")) logs.add(mutation.target);
            }
            logs.forEach(regroup);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        document.querySelectorAll(".chat-log").forEach(regroup);
    }
};
