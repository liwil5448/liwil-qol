/**
 * Musique de fond sur la page de connexion (/join) : un fichier audio, ou une playlist de Foundry
 * (fichiers locaux et vidéos YouTube du module Jokerbox).
 *
 * Foundry ne charge aucun script de module sur /join : seule la description du monde y est affichée.
 * À l'enregistrement, le serveur nettoie cette description : toute <iframe srcdoc> y est isolée
 * (sandbox="allow-scripts allow-forms"), sans aucun accès à la page. Le lecteur vit donc entièrement
 * dans l'iframe : musique, haut-parleur et curseur de volume. L'iframe est placée en bas à gauche
 * de l'écran, sur fond transparent, par son attribut style (conservé par le nettoyage).
 *
 * YouTube ne fonctionne pas dans une iframe isolée. Mais youtube.com fait partie des domaines de
 * confiance de Foundry : une iframe www.youtube.com/embed n'est pas isolée. Le fragment en contient
 * donc une, invisible, que le lecteur pilote par messages (API « widget » de YouTube : chargement,
 * lecture, pause, volume, et retour de l'état pour enchaîner les pistes).
 *
 *   <div id="liwil-qol-join-music" data-lqol-sig="…">
 *     <iframe style="position:fixed;…" srcdoc="…"></iframe>            lecteur et haut-parleur
 *     <iframe style="…invisible…" src="https://www.youtube.com/embed/…"></iframe>   si pistes YouTube
 *   </div>
 *
 * Le fragment est réécrit par le MJ actif au chargement, à chaque changement de réglage et à chaque
 * modification de la playlist choisie, seulement si sa signature (data-lqol-sig) a changé.
 * Aucune musique : le fragment est retiré de la description.
 */
import { MODULE_ID } from "./constants.js";
import { Log } from "./log.js";

const FRAGMENT_ID = "liwil-qol-join-music";
const FRAGMENT_PATTERN = new RegExp(`\\s*<div id="${FRAGMENT_ID}"[\\s\\S]*?</div>`, "g");

/** Version du lecteur : la changer force la réécriture du fragment */
const PLAYER_VERSION = 3;

/** Taille de l'iframe : haut-parleur + curseur à sa droite */
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 60;

/** Choix de playlist du réglage, remplis une fois les playlists du monde chargées */
const PLAYLIST_CHOICES = { "": "LIWIL_QOL.Settings.JoinMusicPlaylist.None" };

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

    const tracks = config.tracks;
    let master = Number.isFinite(prefs.volume) ? prefs.volume : config.volume;
    let muted = false;
    let wanted = !prefs.muted;      // la musique doit-elle jouer ?
    let blocked = false;            // lecture refusée par le navigateur (pas encore de clic)
    let current = null;             // piste en cours
    let position = 0;
    let failures = 0;
    let order = tracks.map((_track, index) => index);
    const shuffle = () => {
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
    };
    if (config.shuffle) shuffle();

    // ---------- Fichiers ----------
    const audio = new Audio();
    audio.preload = "auto";
    let loadedTrack = null;
    audio.loop = tracks.length === 1;

    // ---------- YouTube : iframe voisine pilotée par messages ----------
    const yt = { ready: false, state: -1, watchdog: null, refused: false };
    const ytSend = (func, args = []) => {
        const message = JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" });
        for (let i = 0; i < parent.frames.length; i++) {
            try { parent.frames[i].postMessage(message, "https://www.youtube.com"); } catch {}
        }
    };
    let ytHello = null;
    if (tracks.some(track => track.type === "youtube")) {
        ytHello = setInterval(() => {
            const message = JSON.stringify({ event: "listening", id: 1, channel: "widget" });
            for (let i = 0; i < parent.frames.length; i++) {
                try { parent.frames[i].postMessage(message, "https://www.youtube.com"); } catch {}
            }
        }, 250);
        addEventListener("message", event => {
            if (event.origin !== "https://www.youtube.com") return;
            let data;
            try { data = JSON.parse(event.data); } catch { return; }
            if (!yt.ready && ["onReady", "initialDelivery", "infoDelivery"].includes(data.event)) {
                yt.ready = true;
                clearInterval(ytHello);
                if (wanted && current?.type === "youtube") startCurrent();
            }
            const state = data.info?.playerState;
            if (state === undefined || state === yt.state) return;
            yt.state = state;
            if (current?.type !== "youtube") return;
            if (state === 1) {
                clearTimeout(yt.watchdog);
                failures = 0;
                blocked = false;
            }
            if (state === 0) next();
            refresh();
        });
    }

    const volumeOf = track => Math.max(0, Math.min(1, master * (track?.volume ?? 1)));
    const isPlaying = () => current?.type === "youtube" ? yt.state === 1 : !audio.paused;
    const isOff = () => !isPlaying() || muted || master === 0;

    function applyVolume() {
        if (!current) return;
        if (current.type === "file") {
            audio.volume = volumeOf(current);
            audio.muted = muted;
        }
        else {
            ytSend("setVolume", [Math.round(volumeOf(current) * 100)]);
            ytSend(muted ? "mute" : "unMute");
        }
        refresh();
    }

    function stopCurrent() {
        clearTimeout(yt.watchdog);
        audio.pause();
        if (current?.type === "youtube") ytSend("pauseVideo");
    }

    /** Lance la piste courante */
    function startCurrent() {
        if (!current || !wanted) return refresh();
        if (current.type === "file") {
            if (loadedTrack !== current) {
                audio.src = current.src;
                loadedTrack = current;
            }
            applyVolume();
            audio.play().then(() => {
                failures = 0;
                blocked = false;
                refresh();
            }, error => {
                // Lecture refusée tant que l'utilisateur n'a pas cliqué : on attend le clic sur le haut-parleur
                if (error?.name === "NotAllowedError") {
                    blocked = true;
                    refresh();
                }
                else next(true);
            });
        }
        else {
            if (!yt.ready || yt.refused) {
                if (yt.refused) next(true);
                return refresh();
            }
            ytSend("loadVideoById", [{ videoId: current.id }]);
            applyVolume();
            // Sans démarrage, YouTube a refusé (navigateur sans clic dans le lecteur YouTube) : piste suivante
            clearTimeout(yt.watchdog);
            yt.watchdog = setTimeout(() => {
                if (yt.state === 1) return;
                yt.refused = true;
                next(true);
            }, 8000);
        }
    }

    function play(index) {
        stopCurrent();
        position = index;
        current = tracks[order[position]];
        startCurrent();
    }

    /** Piste suivante (en boucle). failed : la piste n'a pas pu être lue */
    function next(failed = false) {
        if (failed && ++failures >= tracks.length) {
            // Aucune piste lisible : on s'arrête, le haut-parleur reste barré
            wanted = false;
            stopCurrent();
            return refresh();
        }
        let index = position + 1;
        if (index >= order.length) {
            index = 0;
            if (config.shuffle && order.length > 1) shuffle();
        }
        if (tracks.length === 1 && current?.type === "file") return;    // un seul fichier : audio.loop s'en charge
        play(index);
    }

    audio.addEventListener("ended", () => next());
    audio.addEventListener("error", () => { if (current?.type === "file" && wanted) next(true); });

    // ---------- Interface ----------
    const control = document.getElementById("control");
    const button = document.getElementById("speaker");
    const panel = document.getElementById("panel");
    const slider = document.getElementById("slider");
    const percent = document.getElementById("percent");
    slider.ariaLabel = config.labels.volume;

    function refresh() {
        const off = isOff();
        button.innerHTML = off ? config.icons.off : config.icons.on;
        button.ariaLabel = off ? config.labels.play : config.labels.mute;
        button.ariaPressed = String(!off);
        const value = Math.round(master * 100);
        slider.value = String(value);
        percent.textContent = `${value} %`;
    }
    audio.addEventListener("play", refresh);
    audio.addEventListener("pause", refresh);

    const turnOn = () => {
        if (master === 0) master = config.volume || 0.5;
        muted = false;
        wanted = true;
        failures = 0;
        yt.refused = false;     // le clic donne une nouvelle chance aux pistes YouTube
        prefs.muted = false;
        prefs.volume = master;
        savePrefs();
        if (!current) play(position);
        else if (isPlaying()) applyVolume();
        else if (current.type === "file") startCurrent();
        else if (yt.ready) {
            applyVolume();
            ytSend("playVideo");
        }
        else startCurrent();
    };
    let longPressed = false;
    button.addEventListener("click", () => {
        // Le relâchement d'un appui long ne doit pas couper ou rétablir le son
        if (longPressed) {
            longPressed = false;
            return;
        }
        if (isOff()) return turnOn();
        muted = true;
        prefs.muted = true;
        savePrefs();
        applyVolume();
    });
    slider.addEventListener("input", () => {
        master = Number(slider.value) / 100;
        prefs.volume = master;
        savePrefs();
        applyVolume();
        // Monter le volume alors que le son est coupé le rétablit
        if (master > 0 && isOff()) turnOn();
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
    if (wanted && tracks.length) play(0);
}

/** Page HTML de l'iframe du lecteur */
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

/** Pistes à jouer : la playlist choisie, sinon le fichier du réglage */
function getTracks() {
    const playlistId = game.settings.get(MODULE_ID, "joinMusicPlaylist");
    const playlist = playlistId ? game.playlists?.get(playlistId) : null;
    if (playlist) {
        const tracks = [];
        for (const id of playlist.playbackOrder) {
            const sound = playlist.sounds.get(id);
            if (!sound) continue;
            const volume = Number.isFinite(sound.volume) ? sound.volume : 1;
            const videoId = sound.getFlag?.("jokerbox", "videoId") ?? sound.flags?.jokerbox?.videoId;
            if (videoId) tracks.push({ type: "youtube", id: String(videoId), volume });
            else if (sound.path) tracks.push({ type: "file", src: sound.path, volume });
        }
        return { tracks, shuffle: playlist.mode === CONST.PLAYLIST_MODES.SHUFFLE, name: playlist.name };
    }
    const src = game.settings.get(MODULE_ID, "joinMusic")?.trim() ?? "";
    return { tracks: src ? [{ type: "file", src, volume: 1 }] : [], shuffle: false, name: src };
}

function buildFragment({ tracks, shuffle }, volume) {
    const config = {
        tracks,
        shuffle,
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
    let html = `<iframe title="${escapeAttribute(config.labels.volume)}" style="${frameStyle}" srcdoc="${escapeAttribute(srcdoc)}"></iframe>`;

    // Lecteur YouTube invisible, piloté par le lecteur ci-dessus
    const firstVideo = tracks.find(track => track.type === "youtube");
    if (firstVideo) {
        const params = "enablejsapi=1&controls=0&disablekb=1&playsinline=1&rel=0";
        html += `<iframe title="YouTube" style="position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;border:0;" `
            + `src="https://www.youtube.com/embed/${encodeURIComponent(firstVideo.id)}?${params}"></iframe>`;
    }
    const sig = signature(`${PLAYER_VERSION}|${html}`);
    return `<div id="${FRAGMENT_ID}" data-lqol-sig="${sig}">${html}</div>`;
}

let syncing = Promise.resolve();

async function writeDescription() {
    if (!game.ready || !game.users.activeGM?.isSelf) return;
    const volume = Math.clamp(Number(game.settings.get(MODULE_ID, "joinMusicVolume")) || 0, 0, 1);
    const music = getTracks();
    const current = game.world.description ?? "";
    const fragment = music.tracks.length ? buildFragment(music, volume) : "";

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
    Log.debug("Musique de connexion : description mise à jour", music.name || "(retirée)", `${music.tracks.length} piste(s)`);

    const stored = (response.description ?? "").match(FRAGMENT_PATTERN)?.[0] ?? "";
    if (music.tracks.length && !/<iframe[^>]*srcdoc/.test(stored)) {
        ui.notifications.warn("LIWIL_QOL.JoinMusic.Blocked", { localize: true });
    }
}

/** Remplit la liste des playlists du réglage */
function refreshPlaylistChoices() {
    for (const key of Object.keys(PLAYLIST_CHOICES)) if (key) delete PLAYLIST_CHOICES[key];
    const playlists = [...(game.playlists ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const playlist of playlists) PLAYLIST_CHOICES[playlist.id] = playlist.name;
}

export const JoinMusic = {
    registerSettings() {
        const onChange = () => JoinMusic.sync();
        game.settings.register(MODULE_ID, "joinMusicPlaylist", {
            name: "LIWIL_QOL.Settings.JoinMusicPlaylist.Name",
            hint: "LIWIL_QOL.Settings.JoinMusicPlaylist.Hint",
            scope: "world",
            config: true,
            type: String,
            choices: PLAYLIST_CHOICES,
            default: "",
            onChange
        });
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

    /** Liste des playlists, et mise à jour quand la playlist choisie change */
    listen() {
        Hooks.once("ready", refreshPlaylistChoices);
        let timer = null;
        const resync = () => {
            clearTimeout(timer);
            timer = setTimeout(() => JoinMusic.sync(), 1500);
        };
        const isChosen = playlist => playlist?.id && playlist.id === game.settings.get(MODULE_ID, "joinMusicPlaylist");
        for (const hook of ["createPlaylist", "updatePlaylist", "deletePlaylist"]) {
            Hooks.on(hook, playlist => {
                refreshPlaylistChoices();
                if (isChosen(playlist)) resync();
            });
        }
        // Lecture en jeu : updatePlaylistSound part aussi à chaque lecture ou pause, mais la signature évite toute
        // réécriture tant que les pistes et leurs volumes ne changent pas
        for (const hook of ["createPlaylistSound", "updatePlaylistSound", "deletePlaylistSound"]) {
            Hooks.on(hook, sound => {
                if (isChosen(sound.parent)) resync();
            });
        }
    },

    /** Met la description du monde en accord avec les réglages (MJ actif seulement) */
    sync() {
        syncing = syncing.then(writeDescription, writeDescription);
        return syncing;
    }
};
