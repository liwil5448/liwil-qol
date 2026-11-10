/**
 * Liwil QoL — point d'entrée.
 * Tous les réglages sont enregistrés sous l'id du module : Foundry les range dans la catégorie du module.
 */
import { MODULE_ID } from "./constants.js";
import { ChatWhisper } from "./chat-whisper.js";
import { JoinMusic } from "./join-music.js";
import { ChatGroups } from "./chat-groups.js";
import { FolderTextColor } from "./folder-text-color.js";
import { Log } from "./log.js";

/** Fichiers CSS propres aux cartes de chat de certains systèmes (styles/systems/<fichier>.css) */
const SYSTEM_STYLES = {
    "ptu": "ptr",
    "liwil-mon": "ptr",
    "dnd5e": "dnd5e"
};

/** Active ou non le thème sombre du chat */
function applyChatTheme(dark) {
    document.body.classList.toggle("liwil-qol-chat-dark", !!dark);
}

/** Charge le CSS propre au système actif, dans la même couche que les styles des modules */
function loadSystemStyles() {
    const file = SYSTEM_STYLES[game.system.id];
    if (!file) return;
    const style = document.createElement("style");
    style.id = `${MODULE_ID}-system-styles`;
    const href = foundry.utils.getRoute(`modules/${MODULE_ID}/styles/systems/${file}.css`);
    style.textContent = `@import url("${href}") layer(modules);`;
    document.head.append(style);
}

function registerSettings() {
    game.settings.register(MODULE_ID, "sidebarExpanded", {
        name: "LIWIL_QOL.Settings.SidebarExpanded.Name",
        hint: "LIWIL_QOL.Settings.SidebarExpanded.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, "darkChat", {
        name: "LIWIL_QOL.Settings.DarkChat.Name",
        hint: "LIWIL_QOL.Settings.DarkChat.Hint",
        scope: "user",
        config: true,
        type: Boolean,
        default: false,
        onChange: applyChatTheme
    });

    JoinMusic.registerSettings();
    Log.registerSetting();
}

// Doit exister avant la création de l'éditeur ProseMirror du chat
ChatWhisper.listen();
FolderTextColor.listen();

Hooks.once("init", () => {
    registerSettings();
    applyChatTheme(game.settings.get(MODULE_ID, "darkChat"));
    loadSystemStyles();
    ChatGroups.listen();
});

Hooks.once("ready", () => {
    // Appliqué au chargement seulement : le joueur garde la main sur la barre pendant la partie
    ui.sidebar?.toggleExpanded(game.settings.get(MODULE_ID, "sidebarExpanded"));
    JoinMusic.sync();
});

// Couleur et identité du joueur, utilisées pour le cadre des messages par le chat sombre
Hooks.on("renderChatMessageHTML", (message, html) => {
    if (message.author?.color) html.style.setProperty("--lqol-player-color", message.author.color.css);
    ChatGroups.tag(message, html);
});
