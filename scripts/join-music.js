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

    // Préférences propres à ce navigateur : volume et son coupé. Volume du MJ par défaut.
    const STORAGE_KEY = "liwil-qol.joinMusic";
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch {}
    const savePrefs = () => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
    };

    const audio = new Audio(config.src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = Number.isFinite(prefs.volume) ? prefs.volume : config.volume;
    window.liwilQolJoinMusic = audio;

    // Haut-parleur : un clic coupe ou rétablit le son ; le survol affiche le curseur de volume au-dessus
    const control = document.createElement("div");
    control.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:1000;";

    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText = "display:flex;align-items:center;justify-content:center;width:48px;height:48px;padding:0;"
        + "background:none;border:none;box-shadow:none;color:#e6e4df;font-size:32px;line-height:1;cursor:pointer;"
        + "filter:drop-shadow(0 0 2px #000) drop-shadow(0 0 2px #000);outline-offset:2px;";
    const icon = document.createElement("i");
    button.append(icon);

    // Panneau du curseur, collé au-dessus du haut-parleur (sans espace, pour que le survol ne se perde pas)
    const panel = document.createElement("div");
    panel.hidden = true;
    panel.style.cssText = "position:absolute;left:0;bottom:100%;padding-bottom:6px;";
    const box = document.createElement("label");
    box.style.cssText = "display:flex;align-items:center;gap:10px;width:220px;padding:10px 12px;"
        + "background:#000;color:#e6e4df;border:2px solid #e6e4df;border-radius:8px;font-size:16px;";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "5";
    slider.ariaLabel = config.labels.volume;
    slider.style.cssText = "flex:1;margin:0;accent-color:#e6e4df;cursor:pointer;";
    const percent = document.createElement("span");
    percent.style.cssText = "min-width:3.5em;text-align:right;";
    box.append(slider, percent);
    panel.append(box);
    control.append(panel, button);

    const isOff = () => audio.paused || audio.muted || audio.volume === 0;
    const refresh = () => {
        const off = isOff();
        icon.className = `fa-solid ${off ? "fa-volume-xmark" : "fa-volume-high"}`;
        button.ariaLabel = off ? config.labels.play : config.labels.mute;
        button.ariaPressed = String(!off);
        const value = Math.round(audio.volume * 100);
        slider.value = String(value);
        percent.textContent = `${value} %`;
    };
    audio.addEventListener("play", refresh);
    audio.addEventListener("pause", refresh);
    audio.addEventListener("volumechange", refresh);

    const turnOn = () => {
        stopWaiting();
        if (audio.volume === 0) audio.volume = config.volume || 0.5;
        audio.muted = false;
        audio.play().catch(() => {});
        prefs.muted = false;
        prefs.volume = audio.volume;
        savePrefs();
    };
    button.addEventListener("click", () => {
        if (isOff()) return turnOn();
        stopWaiting();
        audio.muted = true;
        prefs.muted = true;
        savePrefs();
    });
    slider.addEventListener("input", () => {
        audio.volume = Number(slider.value) / 100;
        prefs.volume = audio.volume;
        savePrefs();
        // Monter le volume alors que le son est coupé le rétablit
        if (audio.volume > 0 && (audio.paused || audio.muted)) turnOn();
    });

    // Curseur visible au survol, pendant qu'on le fait glisser, ou au clavier (Tab)
    let hovered = false;
    let dragging = false;
    const updatePanel = () => {
        const keyboard = button.matches(":focus-visible") || slider.matches(":focus-visible");
        panel.hidden = !(hovered || dragging || keyboard);
    };
    control.addEventListener("pointerenter", () => { hovered = true; updatePanel(); });
    control.addEventListener("pointerleave", () => { hovered = false; updatePanel(); });
    slider.addEventListener("pointerdown", () => { dragging = true; });
    document.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        updatePanel();
    });
    control.addEventListener("focusin", () => setTimeout(updatePanel));
    control.addEventListener("focusout", () => setTimeout(updatePanel));
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape" || panel.hidden) return;
        hovered = false;
        button.blur();
        slider.blur();
        updatePanel();
    });
    refresh();
    document.body.append(control);

    // Son coupé par ce joueur la dernière fois : on attend qu'il relance la musique lui-même
    const events = ["pointerdown", "keydown", "touchstart"];
    function stopWaiting() {
        for (const type of events) document.removeEventListener(type, tryPlay, true);
    }
    function tryPlay(event) {
        // Un clic sur le haut-parleur ou le curseur est traité par eux
        if (event && control.contains(event.target)) return;
        audio.play().then(stopWaiting, () => {});
    }
    if (prefs.muted) return;

    // Démarrage immédiat ; si le navigateur le bloque, nouvel essai à la première interaction
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
            mute: game.i18n.localize("LIWIL_QOL.JoinMusic.Mute"),
            volume: game.i18n.localize("LIWIL_QOL.JoinMusic.Volume")
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
