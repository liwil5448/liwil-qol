/**
 * Couleur du texte des dossiers.
 * La fenêtre de configuration d'un dossier reçoit un second sélecteur, sous la couleur du dossier.
 * La couleur est enregistrée dans le flag `textColor` du dossier, puis appliquée à l'en-tête
 * du dossier dans toutes les listes (barre latérale, compendiums).
 * Champ vide : texte d'origine de Foundry.
 */
import { MODULE_ID } from "./constants.js";
import { Log } from "./log.js";

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function getTextColor(folder) {
    const color = folder?.getFlag?.(MODULE_ID, "textColor");
    return COLOR_PATTERN.test(color ?? "") ? color : null;
}

/** Ajoute le sélecteur sous celui de la couleur du dossier */
function addPicker(app, html) {
    if (html.querySelector(`[name="flags.${MODULE_ID}.textColor"]`)) return;
    const colorGroup = html.querySelector('[name="color"]')?.closest(".form-group");
    if (!colorGroup) return;

    const id = `${app.id}-lqol-text-color`;
    const group = document.createElement("div");
    group.classList.add("form-group");
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = game.i18n.localize("LIWIL_QOL.FolderTextColor.Name");
    const fields = document.createElement("div");
    fields.classList.add("form-fields");
    // create() : <color-picker> ne lit sa valeur initiale que dans son constructeur,
    // un attribut « value » posé après coup serait ignoré (et la couleur effacée au prochain enregistrement)
    const picker = foundry.applications.elements.HTMLColorPickerElement.create({
        name: `flags.${MODULE_ID}.textColor`,
        value: getTextColor(app.document) ?? "",
        placeholder: "#ffffff"
    });
    picker.id = id;
    fields.append(picker);
    const hint = document.createElement("p");
    hint.classList.add("hint");
    hint.textContent = game.i18n.localize("LIWIL_QOL.FolderTextColor.Hint");
    group.append(label, fields, hint);
    colorGroup.after(group);
    app.setPosition?.({ height: "auto" });
    Log.debug("Dossier : sélecteur ajouté pour", app.document?.name, "— couleur actuelle :", getTextColor(app.document));
}

/** Dossier affiché par un élément de liste (dossier du monde ou d'un compendium) */
function getFolder(item) {
    const { uuid, folderId } = item.dataset;
    // Les dossiers d'un compendium vivent dans pack.folders, que fromUuidSync ne consulte pas
    if (uuid?.startsWith("Compendium.")) {
        const parsed = foundry.utils.parseUuid(uuid);
        return parsed?.collection?.folders?.get(parsed.id) ?? null;
    }
    return game.folders.get(folderId) ?? null;
}

/** Applique la couleur du texte aux en-têtes de dossiers d'une liste */
function applyColors(html) {
    for (const header of html.querySelectorAll("li.folder > .folder-header")) {
        const color = getTextColor(getFolder(header.parentElement));
        if (color) Log.debug("Dossier : couleur du texte appliquée", color, header);
        header.classList.toggle("lqol-folder-text", !!color);
        // Style en ligne : ne dépend d'aucune feuille de style et passe devant les règles des systèmes et modules
        const targets = [header, ...header.querySelectorAll(":scope > i, :scope > .folder-name")];
        for (const element of targets) {
            if (color) {
                element.style.setProperty("color", color);
                element.style.setProperty("text-shadow", "none");
            }
            else {
                element.style.removeProperty("color");
                element.style.removeProperty("text-shadow");
            }
        }
        if (color) header.style.setProperty("--lqol-folder-text", color);
        else header.style.removeProperty("--lqol-folder-text");
        // Boutons « + » : le cœur fixe --button-text-color sur chaque bouton
        for (const button of header.querySelectorAll(".create-button")) {
            if (color) {
                button.style.setProperty("--button-text-color", color);
                button.style.setProperty("color", color);
            }
            else {
                button.style.removeProperty("--button-text-color");
                button.style.removeProperty("color");
            }
        }
    }
}

export const FolderTextColor = {
    listen() {
        Hooks.on("renderFolderConfig", (app, html) => {
            try {
                addPicker(app, html);
            }
            catch (error) {
                Log.error("Dossier : impossible d'ajouter le sélecteur de couleur du texte", error);
            }
        });
        Hooks.on("preUpdateFolder", (folder, changes) => {
            Log.debug("Dossier : enregistrement demandé pour", folder.name, foundry.utils.deepClone(changes));
        });
        Hooks.on("updateFolder", folder => {
            Log.debug("Dossier : enregistré", folder.name, "— couleur du texte :", folder.getFlag(MODULE_ID, "textColor"));
        });
        // Seules fenêtres qui affichent des dossiers : listes de la barre latérale et contenu d'un compendium
        // (DocumentDirectory, dont hérite Compendium), liste des compendiums (CompendiumDirectory)
        const onRender = (_app, html) => {
            if (html instanceof HTMLElement) applyColors(html);
        };
        Hooks.on("renderDocumentDirectory", onRender);
        Hooks.on("renderCompendiumDirectory", onRender);
    }
};
