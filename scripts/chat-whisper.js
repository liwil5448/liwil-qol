/**
 * Assistant de chuchotement dans les contrôles du chat.
 * La bulle active ou désactive le mode chuchotement : la barre des destinataires apparaît, liste fermée.
 * Un clic sur la barre ouvre la liste des joueurs. Clic sur un nom : chuchoter à cette personne et refermer
 * la liste. Maj + clic : ajouter ou retirer une personne, liste ouverte.
 * Le mode reste actif après l'envoi, même en message public (« Personne »), pour rechuchoter facilement.
 * Désactiver la bulle retire la commande /w et cache la barre.
 * Liste sur mesure, car un <select> natif se referme à chaque choix.
 * Le début du message contient la commande /w, qui reste la seule référence des destinataires.
 */
import { Log } from "./log.js";

/** Commande de chuchotement en début de message (même syntaxe que ChatLog) */
const WHISPER_PREFIX = /^\/w(?:hisper)?\s+(\[[^\]]+]|\S+)\s*/i;

/** Vue ProseMirror de la saisie du chat : modifier `value` n'a pas d'effet sur un éditeur actif */
let editorView = null;

/** Mode chuchotement : la barre des destinataires reste affichée, même en message public */
let whisperMode = false;

function getDropdown() {
    return document.querySelector(".liwil-qol-whisper");
}

/** Destinataires indiqués par la commande présente dans le message */
function getRecipients() {
    const match = editorView?.state.doc.firstChild?.textContent.match(WHISPER_PREFIX);
    if (!match) return [];
    return match[1].replace(/[[\]]/g, "").split(",").map(name => name.trim()).filter(Boolean);
}

/** Aligne la liste sur la commande présente dans le message (envoi, saisie manuelle…) */
function syncDropdown() {
    const dropdown = getDropdown();
    if (!dropdown) return;
    const recipients = getRecipients();
    const menu = dropdown.querySelector(".liwil-qol-whisper-menu");
    dropdown.querySelector(".liwil-qol-whisper-current").textContent = recipients.join(", ") || game.i18n.localize("LIWIL_QOL.ChatWhisper.None");
    for (const option of menu.children) {
        const name = option.dataset.name;
        option.ariaPressed = String(name ? recipients.includes(name) : !recipients.length);
    }
    // Hors mode chuchotement, la barre n'apparaît que si une commande /w est tapée à la main
    dropdown.hidden = !whisperMode && menu.hidden && !recipients.length;
    const button = document.querySelector(".liwil-qol-whisper-button");
    if (button) button.ariaPressed = String(whisperMode);
}

/** Bulle : active ou désactive le mode chuchotement, sans ouvrir la liste */
function toggleWhisperMode() {
    whisperMode = !whisperMode;
    Log.debug("Chuchotement : mode", whisperMode ? "activé" : "désactivé");
    if (!whisperMode && getRecipients().length) applyRecipients([]);
    setMenuOpen(false);
}

function setMenuOpen(open) {
    const dropdown = getDropdown();
    if (!dropdown) return;
    if (open) refreshOptions();
    dropdown.querySelector(".liwil-qol-whisper-menu").hidden = !open;
    dropdown.querySelector(".liwil-qol-whisper-toggle").ariaExpanded = String(open);
    syncDropdown();
}

function toggleMenu() {
    const dropdown = getDropdown();
    if (!dropdown) return;
    setMenuOpen(dropdown.querySelector(".liwil-qol-whisper-menu").hidden);
}

function createOption(label, name = "", color = null, offline = false) {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = label;
    option.dataset.name = name;
    if (color) option.style.setProperty("--lqol-player-color", color);
    if (offline) {
        option.classList.add("liwil-qol-whisper-offline");
        const status = document.createElement("span");
        status.classList.add("liwil-qol-whisper-status");
        status.textContent = game.i18n.localize("LIWIL_QOL.ChatWhisper.Offline");
        option.append(status);
    }
    option.addEventListener("click", event => {
        Log.debug("Chuchotement : clic sur", name || "Personne", { shift: event.shiftKey, editeur: !!editorView });
        const recipients = getRecipients();
        if (name && event.shiftKey) {
            applyRecipients(recipients.includes(name) ? recipients.filter(r => r !== name) : [...recipients, name]);
            return;
        }
        applyRecipients(name ? [name] : []);
        setMenuOpen(false);
    });
    return option;
}

function refreshOptions() {
    const dropdown = getDropdown();
    if (!dropdown) return;
    // Joueurs connectés d'abord, puis les déconnectés (ils liront le chuchotement à leur connexion)
    const users = game.users.filter(user => !user.isSelf)
        .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    dropdown.querySelector(".liwil-qol-whisper-menu").replaceChildren(
        createOption(game.i18n.localize("LIWIL_QOL.ChatWhisper.None")),
        ...users.map(user => createOption(user.name, user.name, user.color?.css, !user.active))
    );
    syncDropdown();
}

/** Remplace la commande en début de message, sans toucher au texte déjà saisi */
function applyRecipients(names) {
    if (!editorView) {
        Log.warn("Chuchotement : éditeur du chat introuvable, la commande /w n'a pas pu être insérée.");
        return;
    }
    const { state } = editorView;
    const match = state.doc.firstChild?.textContent.match(WHISPER_PREFIX);
    const start = 1; // Début du premier paragraphe
    const end = start + (match?.[0].length ?? 0);
    const tr = names.length ? state.tr.insertText(`/w [${names.join(", ")}] `, start, end) : state.tr.delete(start, end);
    tr.setSelection(foundry.prosemirror.state.TextSelection.atEnd(tr.doc));
    editorView.dispatch(tr);
    editorView.focus();
}

function addControls(chatControls, messageModes) {
    if (!chatControls || !messageModes || getDropdown()) return;

    const dropdown = document.createElement("div");
    dropdown.classList.add("liwil-qol-whisper");
    dropdown.hidden = true;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.classList.add("liwil-qol-whisper-toggle");
    toggle.ariaExpanded = "false";
    const current = document.createElement("span");
    current.classList.add("liwil-qol-whisper-current");
    const caret = document.createElement("i");
    caret.classList.add("fa-solid", "fa-caret-down");
    toggle.append(current, caret);
    toggle.addEventListener("click", toggleMenu);

    const menu = document.createElement("div");
    menu.classList.add("liwil-qol-whisper-menu");
    menu.hidden = true;

    dropdown.append(toggle, menu);
    chatControls.append(dropdown);
    // Garder le focus dans la saisie : sa perte change la hauteur de la saisie (barre repliée)
    // et peut déplacer la liste entre l'appui et le relâchement du clic
    dropdown.addEventListener("mousedown", event => event.preventDefault());

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("ui-control", "icon", "fa-solid", "fa-comment", "liwil-qol-whisper-button");
    button.ariaLabel = game.i18n.localize("LIWIL_QOL.ChatWhisper.Label");
    button.ariaPressed = "false";
    button.dataset.tooltip = "";
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", toggleWhisperMode);
    messageModes.append(button);
    Log.debug("Chuchotement : contrôles ajoutés au chat");
}

export const ChatWhisper = {
    listen() {
        // Phase de capture : passe avant les écouteurs des autres modules, qui pourraient arrêter l'événement
        document.addEventListener("plugins", event => {
            if (!event.target.closest?.("#chat-message")) return;
            event.plugins.liwilQolWhisper = new foundry.prosemirror.state.Plugin({
                view(view) {
                    editorView = view;
                    Log.debug("Chuchotement : éditeur du chat trouvé");
                    return {
                        update: syncDropdown,
                        destroy() {
                            if (editorView === view) editorView = null;
                            Log.debug("Chuchotement : éditeur du chat fermé");
                        }
                    };
                }
            });
        }, true);

        // Un clic en dehors de la liste la referme
        document.addEventListener("pointerdown", event => {
            if (event.target.closest?.(".liwil-qol-whisper, .liwil-qol-whisper-button")) return;
            const menu = getDropdown()?.querySelector(".liwil-qol-whisper-menu");
            if (menu && !menu.hidden) Log.debug("Chuchotement : liste fermée par un clic en dehors, sur", event.target);
            setMenuOpen(false);
        });

        Hooks.on("renderChatInput", (_app, elements) => addControls(elements["#chat-controls"], elements["#message-modes"]));
        Hooks.on("userConnected", refreshOptions);
    }
};
