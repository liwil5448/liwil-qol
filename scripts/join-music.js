/**
 * Musique de fond sur la page de connexion (/join).
 *
 * Foundry ne charge aucun script de module sur /join : seule la description du monde y est affichée,
 * insérée telle quelle. Le module y écrit donc un fragment caché, repérable par son id :
 *   <div id="liwil-qol-join-music" hidden><iframe srcdoc="<script>…</script>"></iframe></div>
 * Le script de l'iframe (même origine que la page) ajoute à la page un lecteur audio en boucle,
 * qui démarre dès que le navigateur l'autorise (au plus tard à la première interaction),
 * avec un bouton pour couper le son.
 *
 * Le fragment est réécrit par le MJ actif au chargement et à chaque changement de réglage.
 * Musique vide : le fragment est retiré de la description.
 */
import { MODULE_ID } from "./constants.js";

const FRAGMENT_ID = "liwil-qol-join-music";
const FRAGMENT_PATTERN = new RegExp(`\\s*<div id="${FRAGMENT_ID}"[\\s\\S]*?</div>`, "g");

/** Code exécuté dans la page /join elle-même */
function pageScript(config) {
    if (window.liwilQolJoinMusic) return;
    const audio = new Audio(config.src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = config.volume;
    window.liwilQolJoinMusic = audio;

    // Bouton pour couper ou remettre le son
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:1000;width:44px;height:44px;"
        + "display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;"
        + "background:#000;color:#e6e4df;border:2px solid #e6e4df;border-radius:50%;cursor:pointer;";
    const icon = document.createElement("i");
    button.append(icon);
    const refresh = () => {
        const off = audio.paused || audio.muted;
        icon.className = `fa-solid ${off ? "fa-volume-xmark" : "fa-volume-high"}`;
        button.ariaLabel = button.title = off ? config.labels.play : config.labels.mute;
    };
    audio.addEventListener("play", refresh);
    audio.addEventListener("pause", refresh);
    audio.addEventListener("volumechange", refresh);
    button.addEventListener("click", event => {
        event.stopPropagation();
        if (audio.paused) {
            audio.muted = false;
            audio.play().catch(() => {});
        }
        else audio.muted = !audio.muted;
        stopWaiting();
    });
    refresh();
    document.body.append(button);

    // Le navigateur bloque souvent la lecture tant que l'utilisateur n'a pas interagi avec la page
    const events = ["pointerdown", "keydown", "touchstart"];
    const tryPlay = () => audio.play().then(stopWaiting, () => {});
    function stopWaiting() {
        for (const type of events) document.removeEventListener(type, tryPlay, true);
    }
    for (const type of events) document.addEventListener(type, tryPlay, true);
    tryPlay();
}

/** Code de l'iframe : injecte pageScript dans la page /join, et seulement là */
function frameScript(code) {
    try {
        const page = window.parent;
        if (page === window || !/\/join\/?$/.test(page.location.pathname) || page.liwilQolJoinMusic) return;
        const script = page.document.createElement("script");
        script.textContent = code;
        page.document.head.append(script);
    }
    catch {
        // iframe isolée (sandbox) : pas d'accès à la page
    }
}

/** JSON sûr à placer dans un <script> */
function toScriptJSON(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttribute(text) {
    return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildFragment(src, volume) {
    const config = {
        src,
        volume,
        labels: {
            play: game.i18n.localize("LIWIL_QOL.JoinMusic.Play"),
            mute: game.i18n.localize("LIWIL_QOL.JoinMusic.Mute")
        }
    };
    const pageCode = `(${pageScript})(${toScriptJSON(config)});`;
    const frameCode = `(${frameScript})(${toScriptJSON(pageCode)});`;
    const srcdoc = `<script>${frameCode}</script>`;
    return `<div id="${FRAGMENT_ID}" hidden><iframe title="music" srcdoc="${escapeAttribute(srcdoc)}"></iframe></div>`;
}

let syncing = Promise.resolve();

async function writeDescription() {
    if (!game.ready || !game.users.activeGM?.isSelf) return;
    const src = game.settings.get(MODULE_ID, "joinMusic")?.trim() ?? "";
    const volume = Math.clamp(Number(game.settings.get(MODULE_ID, "joinMusicVolume")) || 0, 0, 1);
    const current = game.world.description ?? "";
    const base = current.replace(FRAGMENT_PATTERN, "").trimEnd();
    const next = src ? [base, buildFragment(src, volume)].filter(Boolean).join("\n") : base;
    if (next === current) return;

    let response;
    try {
        response = await foundry.utils.fetchJsonWithTimeout(foundry.utils.getRoute("setup"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "editWorld", id: game.world.id, description: next })
        });
        if (response.error) throw new Error(response.error);
    }
    catch (error) {
        console.error(`${MODULE_ID} | Écriture de la musique de connexion impossible`, error);
        ui.notifications.error("LIWIL_QOL.JoinMusic.Error", { localize: true });
        return;
    }
    game.world.updateSource({ description: response.description });

    // Un nettoyage côté serveur isolerait l'iframe (sandbox) et empêcherait la musique
    const saved = (response.description ?? "").match(FRAGMENT_PATTERN)?.[0] ?? "";
    if (src && (!/<iframe[^>]*srcdoc/.test(saved) || /sandbox=/.test(saved))) {
        ui.notifications.warn("LIWIL_QOL.JoinMusic.Blocked", { localize: true });
    }
}

export const JoinMusic = {
    registerSettings() {
        const onChange = () => JoinMusic.sync();
        game.settings.register(MODULE_ID, "joinMusic", {
            name: "LIWIL_QOL.Settings.JoinMusic.Name",
            hint: "LIWIL_QOL.Settings.JoinMusic.Hint",
            scope: "world",
            config: true,
            type: String,
            filePicker: "audio",
            default: "",
            onChange
        });
        game.settings.register(MODULE_ID, "joinMusicVolume", {
            name: "LIWIL_QOL.Settings.JoinMusicVolume.Name",
            hint: "LIWIL_QOL.Settings.JoinMusicVolume.Hint",
            scope: "world",
            config: true,
            type: Number,
            range: { min: 0, max: 1, step: 0.05 },
            default: 0.5,
            onChange
        });
    },

    /** Met la description du monde en accord avec les réglages (MJ actif seulement) */
    sync() {
        syncing = syncing.then(writeDescription, writeDescription);
        return syncing;
    }
};
