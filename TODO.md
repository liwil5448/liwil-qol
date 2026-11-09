# À faire

## Chat sombre : cartes de dnd5e (et midi-qol)

Signalé le 2026-11-09, à faire hors séance de jeu.

Avec le chat sombre, les cartes de capacité, d'attaque et de dégâts de dnd5e gardent leur fond clair. Le texte du module, passé en blanc, devient alors illisible : du blanc sur blanc.

Constaté sur les captures :
- **Carte de capacité** (ex. « Storm Aura: Sea », Aptitude) : en-tête de carte (icône, nom, type) et description sur fond beige clair, texte blanc illisible. Les dés intégrés au texte (`[[/r …]]`) aussi.
- **Carte de dégâts** : bloc « Appliquer » (onglets Ciblé / Sélectionné, cible avec ses dégâts, multiplicateurs -1, 0, ¼, ½, 1, 2, bouton Appliquer) et ligne « JDS réussi / Demi-dégâts ».
- **Carte d'attaque** (ex. « Hache à deux mains ») : en-tête et description, bloc des cibles avec la CA, étiquettes (Action, Instantané, Allonge 1,5 m, Équipé, Maîtrisé).

Piste :
- Créer `styles/systems/dnd5e.css`, déclaré dans `SYSTEM_STYLES` de `scripts/main.js` (`"dnd5e": "dnd5e"`), chargé dans la couche `modules` comme `ptr.css`.
- Règles préfixées par `body.liwil-qol-chat-dark`. Viser les classes de dnd5e 5.x : `.dnd5e2.chat-card`, `.card-header`, `.description`, `.card-tray`, `.card-buttons`, `.pills` / `.pill`, `damage-application` et ses multiplicateurs, `.target-source-control`. Vérifier aussi les variables de dnd5e (`--dnd5e-color-parchment`, `--color-text-primary`…) : les redéfinir sur `.chat-message` peut suffire pour une partie des cartes.
- Vérifier les cartes de midi-qol (`.midi-qol-…`), utilisé dans ce monde.
- Garder la direction visuelle du chat sombre : fond noir, texte blanc, blocs noirs à liseré blanc, boutons blanc sur noir, pas d'italique.
- Attention au module **Custom CSS** de ce monde : il a des règles `!important` sur `.dnd5e2-chat-card` qui peuvent l'emporter.
- Tester : capacité, attaque, dégâts avec application, jet de sauvegarde, sort avec niveau, carte d'objet, en message public et en chuchotement.
