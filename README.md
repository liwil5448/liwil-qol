# Liwil QoL — Confort de jeu

Module Foundry VTT (V14) de confort de jeu, indépendant du système.

## Fonctions

| Réglage | Portée | Effet |
|---|---|---|
| Barre latérale ouverte au démarrage | joueur | Ouvre ou replie la barre latérale de droite au chargement de la partie. |
| Chat sombre | joueur | Désactivé par défaut. Blanc sur fond noir : cadre à la couleur du joueur, chuchotements en bleu `#0038F5`, pas d'italique, fonds décoratifs du système retirés. |
| Musique de la page de connexion | monde (MJ) | Musique en boucle sur la page `/join`, avec un haut-parleur pour couper le son et régler le volume. |
| Volume de la musique de connexion | monde (MJ) | Volume de départ de cette musique. |

Les réglages de portée « joueur » sont accessibles à chaque joueur pour lui-même. Ceux de portée « monde » ne sont visibles que des utilisateurs qui ont le droit de modifier la configuration : par défaut, le MJ et le MJ assistant.

**Cadre du chat sombre** : les messages qui se suivent d'un même joueur, envoyés par le même locuteur (même token, même acteur, ou le joueur lui-même sans token) et à moins de 10 minutes d'intervalle, forment un groupe, entouré d'un cadre épais (10 px) à sa couleur, avec un liseré fin (2 px) entre les messages. Épaisseurs et couleurs sont des variables en tête de `styles/chat-dark.css`.

**Couleur du texte des dossiers** (sans réglage) : la fenêtre de configuration d'un dossier propose un second sélecteur, sous la couleur du dossier, pour choisir la couleur de son nom. Vide : couleur d'origine.

**Assistant de chuchotement** (sans réglage) : une bulle dans les modes de message ouvre la liste des joueurs : connectés d'abord, puis déconnectés (mention « hors ligne », ils liront le chuchotement à leur connexion). Clic : chuchoter à une personne. Maj + clic : plusieurs personnes. La commande `/w [A, B]` en tête du message reste la seule référence.

## Cartes propres à un système

Le CSS générique (`styles/chat-dark.css`) ne touche qu'aux classes de Foundry. Les cartes d'un système s'habillent dans `styles/systems/<fichier>.css`, déclaré dans `SYSTEM_STYLES` de `scripts/main.js`. Actuellement : `ptr.css` pour `ptu` et `liwil-mon`.

## Musique de la page de connexion : fonctionnement

Foundry ne charge aucun script de module sur `/join`. La seule chose de la partie affichée sur cette page est la **description du monde**, et le serveur la nettoie à l'enregistrement : une `<iframe>` y est toujours isolée (`sandbox`), sans accès à la page. Le module y écrit donc un lecteur complet, enfermé dans une iframe placée en bas à gauche de l'écran sur fond transparent (`<div id="liwil-qol-join-music">`).

- Le MJ actif réécrit ce fragment au chargement et à chaque changement de réglage, seulement s'il a changé (signature `data-lqol-sig`). S'il disparaît (par exemple après une modification de la description), il revient au prochain chargement du MJ.
- **Application Foundry** (Windows, macOS, Linux) : la musique démarre dès l'ouverture de la page.
- **Navigateur** : les navigateurs bloquent le son tant qu'on n'a pas cliqué. Le haut-parleur reste barré : un clic dessus lance la musique. Un clic ailleurs sur la page ne suffit pas, car l'iframe isolée ne le voit pas.
- Un clic sur le haut-parleur coupe ou rétablit le son. Le survol (ou la touche Tab, ou un appui long sur écran tactile) affiche le curseur de volume à sa droite. Il se referme quand la souris s'en va, ou au plus tard après 4 secondes sans mouvement.
- L'iframe isolée n'a pas accès au stockage du navigateur : volume et son coupé ne sont pas mémorisés d'une visite à l'autre. Chaque visite repart du volume choisi par le MJ.
- **Avant de désactiver le module, videz le réglage** : le fragment est retiré de la description. Sinon, la musique continue de jouer.
- Sans effet avec le thème de connexion « minimal », qui n'affiche pas la description.

## Dépannage

Le réglage **Journal de débogage** (propre à chaque navigateur) affiche dans la console (F12) le détail de ce que fait le module. Tous ses messages commencent par `liwil-qol |` : tapez `liwil-qol` dans le filtre de la console pour ne voir qu'eux. Les avertissements et les erreurs du module y apparaissent même sans ce réglage.
