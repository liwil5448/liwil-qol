/**
 * Regroupe visuellement les messages qui se suivent d'un même joueur (cadre du chat sombre).
 * Chaque message reçoit son auteur (data-lqol-author) au rendu, puis chaque liste de messages
 * est relue à chaque ajout, suppression ou remplacement :
 *   .lqol-joined-prev : le message précédent vient du même joueur
 *   .lqol-joined-next : le message suivant vient du même joueur
 * Le CSS dessine un cadre épais autour du groupe et un liseré fin entre ses messages.
 */

function regroup(log) {
    const messages = [...log.children].filter(element => element.classList.contains("chat-message"));
    messages.forEach((message, index) => {
        const author = message.dataset.lqolAuthor;
        const same = other => !!author && other?.dataset.lqolAuthor === author;
        message.classList.toggle("lqol-joined-prev", same(messages[index - 1]));
        message.classList.toggle("lqol-joined-next", same(messages[index + 1]));
    });
}

export const ChatGroups = {
    /** Auteur du message, posé au rendu (renderChatMessageHTML) */
    tag(message, html) {
        if (message.author?.id) html.dataset.lqolAuthor = message.author.id;
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
