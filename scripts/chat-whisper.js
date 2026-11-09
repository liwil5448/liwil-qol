/**
 * Bouton de chuchotement dans les contrôles du chat : affiche une liste déroulante des utilisateurs connectés.
 * Clic : chuchoter à cette personne et refermer la liste. Maj + clic : ajouter ou retirer une personne, liste ouverte.
 * Liste sur mesure, car un <select> natif se referme à chaque choix.
 * Le début du message contient la commande /w, qui reste la seule référence des destinataires.
 */

/** Commande de chuchotement en début de message (même syntaxe que ChatLog) */
const WHISPER_PREFIX = /^\/w(?:hisper)?\s+(\[[^\]]+]|\S+)\s*/i;

/** Vue ProseMirror de la saisie du chat : modifier `value` n'a pas d'effet sur un éditeur actif */
let editorView = null;

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
    // En message public, rien ne reste affiché une fois la liste refermée
    dropdown.hidden = menu.hidden && !recipients.length;
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

function createOption(label, name = "", color = null) {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = label;
    option.dataset.name = name;
    if (color) option.style.setProperty("--lqol-player-color", color);
    option.addEventListener("click", event => {
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
    const users = game.users.filter(user => user.active && !user.isSelf).sort((a, b) => a.name.localeCompare(b.name));
    dropdown.querySelector(".liwil-qol-whisper-menu").replaceChildren(
        createOption(game.i18n.localize("LIWIL_QOL.ChatWhisper.None")),
        ...users.map(user => createOption(user.name, user.name, user.color?.css))
    );
    syncDropdown();
}

/** Remplace la commande en début de message, sans toucher au texte déjà saisi */
function applyRecipients(names) {
    if (!editorView) return;
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

    const button = document.createElement("button");
    button.type = "button";
    button.classList.add("ui-control", "icon", "fa-solid", "fa-comment", "liwil-qol-whisper-button");
    button.ariaLabel = game.i18n.localize("LIWIL_QOL.ChatWhisper.Label");
    button.dataset.tooltip = "";
    button.addEventListener("click", toggleMenu);
    messageModes.append(button);
}

export const ChatWhisper = {
    listen() {
        document.addEventListener("plugins", event => {
            if (!event.target.closest?.("#chat-message")) return;
            event.plugins.liwilQolWhisper = new foundry.prosemirror.state.Plugin({
                view(view) {
                    editorView = view;
                    return {
                        update: syncDropdown,
                        destroy() {
                            if (editorView === view) editorView = null;
                        }
                    };
                }
            });
        });

        // Un clic en dehors de la liste la referme
        document.addEventListener("pointerdown", event => {
            if (!event.target.closest?.(".liwil-qol-whisper, .liwil-qol-whisper-button")) setMenuOpen(false);
        });

        Hooks.on("renderChatInput", (_app, elements) => addControls(elements["#chat-controls"], elements["#message-modes"]));
        Hooks.on("userConnected", refreshOptions);
    }
};
