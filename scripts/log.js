/**
 * Journal du module. Tous les messages commencent par « liwil-qol | » :
 * taper liwil-qol dans le filtre de la console (F12) n'affiche qu'eux.
 * Les messages de débogage n'apparaissent que si le réglage « Journal de débogage » est coché.
 */
import { MODULE_ID } from "./constants.js";

const PREFIX = `${MODULE_ID} |`;
let enabled = false;

export const Log = {
    registerSetting() {
        game.settings.register(MODULE_ID, "debug", {
            name: "LIWIL_QOL.Settings.Debug.Name",
            hint: "LIWIL_QOL.Settings.Debug.Hint",
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
            onChange: value => enabled = !!value
        });
        enabled = !!game.settings.get(MODULE_ID, "debug");
    },
    debug(...args) {
        if (enabled) console.log(PREFIX, ...args);
    },
    warn(...args) {
        console.warn(PREFIX, ...args);
    },
    error(...args) {
        console.error(PREFIX, ...args);
    }
};
