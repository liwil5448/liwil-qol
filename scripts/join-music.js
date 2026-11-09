/**
 * Musique de fond sur la page de connexion (/join).
 *
 * Foundry ne charge aucun script de module sur /join : seule la description du monde y est affichée.
 * À l'enregistrement, le serveur nettoie cette description : toute <iframe srcdoc> y est isolée
 * (sandbox="allow-scripts allow-forms"), sans aucun accès à la page. Le lecteur vit donc entièrement
 * dans l'iframe : musique, haut-parleur et curseur de volume. L'iframe est placée en bas à gauche
 * de l'écran, sur fond transparent, par son attribut style (conservé par le nettoyage).
 *
 *   <div id="liwil-qol-join-music" data-lqol-sig="…"><iframe style="position:fixed;…" srcdoc="…"></iframe></div>
 *
 * Le fragment est réécrit par le MJ actif au chargement et à chaque changement de réglage, seulement
 * si sa signature (data-lqol-sig) a changé. Musique vide : le fragment est retiré de la description.
 */
import { MODULE_ID } from "./constants.js";
import { Log } from "./log.js";

const FRAGMENT_ID = "liwil-qol-join-music";
const FRAGMENT_PATTERN = new RegExp(`\\s*<div id="${FRAGMENT_ID}"[\\s\\S]*?</div>`, "g");

/** Version du lecteur : la changer force la réécriture du fragment */
const PLAYER_VERSION = 2;

/** Taille de l'iframe : haut-parleur + curseur à sa droite */
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 60;

/** Icônes SVG : l'iframe isolée n'a pas accès aux polices d'icônes de Foundry */
const ICONS = {
    on: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/>'
        + '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    off: '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor"/>'
        + '<path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

/** Code exécuté dans l'iframe : lecteur complet */
function playerScript(config) {
    // Préférences : l'iframe isolée n'a en général pas accès au stockage du navigateur, d'où les try/catch
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

    const control = document.getElementById("control");
    const button = document.getElementById("speaker");
    const panel = document.getElementById("panel");
    const slider = document.getElementById("slider");
    const percent = document.getElementById("percent");
    slider.ariaLabel = config.labels.volume;

    const isOff = () => audio.paused || audio.muted || audio.volume === 0;
    const refresh = () => {
        const off = isOff();
        button.innerHTML = off ? config.icons.off : config.icons.on;
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
        if (audio.volume === 0) audio.volume = config.volume || 0.5;
        audio.muted = false;
        audio.play().catch(() => {});
        prefs.muted = false;
        prefs.volume = audio.volume;
        savePrefs();
    };
    let longPressed = false;
    button.addEventListener("click", () => {
        // Le relâchement d'un appui long ne doit pas couper ou rétablir le son
        if (longPressed) {
            longPressed = false;
            return;
        }
        if (isOff()) return turnOn();
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

    // Curseur visible au survol de la souris, pendant qu'on le fait glisser, au clavier (Tab),
    // ou après un appui long sur écran tactile (il reste alors affiché jusqu'à un nouvel appui sur le haut-parleur)
    let hovered = false;
    let dragging = false;
    let pinned = false;
    let pressTimer = null;
    const updatePanel = () => {
        const keyboard = button.matches(":focus-visible") || slider.matches(":focus-visible");
        panel.hidden = !(hovered || dragging || keyboard || pinned);
    };
    control.addEventListener("pointerenter", event => {
        if (event.pointerType === "touch") return;
        hovered = true;
        updatePanel();
    });
    control.addEventListener("pointerleave", event => {
        if (event.pointerType === "touch") return;
        hovered = false;
        updatePanel();
    });
    // Quand la souris quitte l'iframe directement vers la page, l'iframe isolée ne reçoit pas toujours
    // d'événement de sortie : sans mouvement de souris pendant quelques secondes, le survol prend fin
    let idleTimer = null;
    control.addEventListener("pointermove", event => {
        if (event.pointerType === "touch") return;
        hovered = true;
        updatePanel();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            hovered = false;
            updatePanel();
        }, 4000);
    });
    document.addEventListener("mouseout", event => {
        if (event.relatedTarget) return;
        hovered = false;
        updatePanel();
    });
    const cancelPress = () => {
        clearTimeout(pressTimer);
        pressTimer = null;
    };
    button.addEventListener("pointerdown", event => {
        const wasPinned = pinned;
        longPressed = false;
        cancelPress();
        if (event.pointerType === "mouse") return;
        pressTimer = setTimeout(() => {
            pressTimer = null;
            longPressed = true;
            pinned = !wasPinned;
            updatePanel();
        }, 500);
    });
    button.addEventListener("pointerup", cancelPress);
    button.addEventListener("pointercancel", cancelPress);
    button.addEventListener("contextmenu", event => event.preventDefault());
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
        hovered = pinned = false;
        button.blur();
        slider.blur();
        updatePanel();
    });
    refresh();

    // Démarrage immédiat (autorisé par l'application Foundry). Dans un navigateur qui le bloque,
    // le haut-parleur reste barré : un clic dessus lance la musique.
    if (!prefs.muted) audio.play().catch(() => {});
}

/** Page HTML de l'iframe */
function frameDocument(config) {
    const color = "#e6e4df";
    const style = `
        :root { color-scheme: normal; }
        html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
        body { display: flex; align-items: center; padding-left: 4px; font: 16px sans-serif; color: ${color}; }
        #control { display: flex; align-items: center; gap: 6px; }
        #speaker { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; padding: 0;
            background: none; border: none; color: ${color}; cursor: pointer; outline-offset: 2px;
            filter: drop-shadow(0 0 2px #000) drop-shadow(0 0 2px #000);
            user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
        #panel { display: flex; align-items: center; gap: 10px; width: 230px; padding: 8px 10px;
            background: #000; border: 2px solid ${color}; border-radius: 8px; box-sizing: border-box; }
        #panel[hidden] { display: none; }
        #slider { flex: 1; margin: 0; accent-color: ${color}; cursor: pointer; }
        #percent { flex: none; min-width: 3.6em; text-align: right; white-space: nowrap; }`;
    const script = `(${playerScript})(${toScriptJSON(config)});`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${style}</style></head><body>`
        + `<div id="control"><button type="button" id="speaker"></button>`
        + `<label id="panel" hidden><input type="range" id="slider" min="0" max="100" step="5"><span id="percent"></span></label></div>`
        + `<script>${script}</script></body></html>`;
}

/** JSON sûr à placer dans un <script> */
function toScriptJSON(value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttribute(text) {
    return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Petite empreinte (djb2) pour savoir si le fragment enregistré est à jour */
function signature(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    return hash.toString(36);
}

function buildFragment(src, volume) {
    const config = {
        src,
        volume,
        icons: ICONS,
        labels: {
            play: game.i18n.localize("LIWIL_QOL.JoinMusic.Play"),
            mute: game.i18n.localize("LIWIL_QOL.JoinMusic.Mute"),
            volume: game.i18n.localize("LIWIL_QOL.JoinMusic.Volume")
        }
    };
    const srcdoc = frameDocument(config);
    const frameStyle = `position:fixed;left:12px;bottom:12px;z-index:1000;width:${FRAME_WIDTH}px;height:${FRAME_HEIGHT}px;`
        + "border:0;background:transparent;color-scheme:normal;";
    const sig = signature(`${PLAYER_VERSION}|${srcdoc}`);
    return `<div id="${FRAGMENT_ID}" data-lqol-sig="${sig}"><iframe title="${escapeAttribute(config.labels.volume)}" `
        + `style="${frameStyle}" srcdoc="${escapeAttribute(srcdoc)}"></iframe></div>`;
}

let syncing = Promise.resolve();

async function writeDescription() {
    if (!game.ready || !game.users.activeGM?.isSelf) return;
    const src = game.settings.get(MODULE_ID, "joinMusic")?.trim() ?? "";
    const volume = Math.clamp(Number(game.settings.get(MODULE_ID, "joinMusicVolume")) || 0, 0, 1);
    const current = game.world.description ?? "";
    const fragment = src ? buildFragment(src, volume) : "";

    // Le serveur réécrit le fragment en le nettoyant : on compare la signature, pas le texte
    const saved = current.match(FRAGMENT_PATTERN)?.[0] ?? "";
    const savedSig = saved.match(/data-lqol-sig="([^"]*)"/)?.[1] ?? null;
    const wantedSig = fragment.match(/data-lqol-sig="([^"]*)"/)?.[1] ?? null;
    const count = current.match(FRAGMENT_PATTERN)?.length ?? 0;
    if (savedSig === wantedSig && count <= 1) {
        Log.debug("Musique de connexion : description déjà à jour");
        return;
    }

    const base = current.replace(FRAGMENT_PATTERN, "").trimEnd();
    const next = [base, fragment].filter(Boolean).join("\n");
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
        Log.error("Écriture de la musique de connexion impossible", error);
        ui.notifications.error("LIWIL_QOL.JoinMusic.Error", { localize: true });
        return;
    }
    game.world.updateSource({ description: response.description });
    Log.debug("Musique de connexion : description mise à jour", src || "(retirée)");

    const stored = (response.description ?? "").match(FRAGMENT_PATTERN)?.[0] ?? "";
    if (src && !/<iframe[^>]*srcdoc/.test(stored)) {
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
