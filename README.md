# Liwil QoL — Confort de jeu

Module Foundry VTT (V14) de confort de jeu, indépendant du système.

## Fonctions

| Réglage | Portée | Effet |
|---|---|---|
| Barre latérale ouverte au démarrage | joueur | Ouvre ou replie la barre latérale de droite au chargement de la partie. |
| Chat sombre | joueur | Thème sombre très contrasté : fond noir, cadre à la couleur du joueur, chuchotements en bleu `#0038F5`, pas d'italique. |
| Musique de la page de connexion | monde (MJ) | Musique en boucle sur la page `/join`, avec un bouton pour couper le son. |
| Volume de la musique de connexion | monde (MJ) | Volume de départ de cette musique. |

**Assistant de chuchotement** (sans réglage) : une bulle dans les modes de message ouvre la liste des joueurs connectés. Clic : chuchoter à une personne. Maj + clic : plusieurs personnes. La commande `/w [A, B]` en tête du message reste la seule référence.

## Cartes propres à un système

Le CSS générique (`styles/chat-dark.css`) ne touche qu'aux classes de Foundry. Les cartes d'un système s'habillent dans `styles/systems/<fichier>.css`, déclaré dans `SYSTEM_STYLES` de `scripts/main.js`. Actuellement : `ptr.css` pour `ptu` et `liwil-mon`.

## Musique de la page de connexion : fonctionnement

Foundry ne charge aucun script de module sur `/join`. La seule chose de la partie affichée sur cette page est la **description du monde**. Le module y écrit donc un fragment caché (`<div id="liwil-qol-join-music">`) qui lance la musique.

- Le MJ actif réécrit ce fragment au chargement et à chaque changement de réglage. S'il disparaît (par exemple après une modification de la description), il revient au prochain chargement du MJ.
- Les navigateurs bloquent souvent le son tant que la page n'a reçu aucun clic ni aucune touche. La musique démarre alors à la première interaction, par exemple au choix du joueur.
- **Avant de désactiver le module, videz le réglage** : le fragment est retiré de la description. Sinon, la musique continue de jouer.
- Sans effet avec le thème de connexion « minimal », qui n'affiche pas la description.
