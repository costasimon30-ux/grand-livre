# Installer Grand Livre comme app iOS

Le dossier `ios/` contient un vrai projet Xcode, généré avec [Capacitor](https://capacitorjs.com). Il embarque la même page `index.html` que la version web, avec en plus ce que le téléphone apporte : l'export passe par la feuille de partage d'iOS, et la barre d'état suit le thème clair ou sombre.

## Ce qu'il te faut (une seule fois)

1. **Xcode** : installe-le depuis le Mac App Store (gratuit, mais lourd : compte une heure). Lance-le une première fois et accepte l'installation des composants.
2. **Node.js** en version 22 ou plus récente : télécharge la version « LTS » sur <https://nodejs.org> et installe-la.
3. **Ton identifiant Apple dans Xcode** : menu **Xcode → Settings → Accounts**, bouton **+**, puis **Apple ID**.
4. **Le mode développeur sur l'iPhone** : **Réglages → Confidentialité et sécurité → Mode développeur**, active-le, puis redémarre l'iPhone. L'option n'apparaît qu'après avoir branché l'iPhone au Mac une première fois avec Xcode ouvert.

## Récupérer le projet et lancer l'app

Ouvre l'app **Terminal** du Mac et tape :

```sh
git clone https://github.com/costasimon30-ux/grand-livre.git
cd grand-livre
npm install
npm run ios
```

Si le Mac propose d'installer les « outils de ligne de commande » à la première commande `git`, accepte. Si le dépôt est privé, GitHub te demandera de te connecter.

`npm run ios` prépare les fichiers, puis ouvre le projet dans Xcode. Là :

1. Dans la colonne de gauche, clique sur **App** tout en haut, puis sur la cible **App** au centre, puis sur l'onglet **Signing & Capabilities**.
2. Dans **Team**, choisis ton nom (« Personal Team »).
3. Si Xcode signale que l'identifiant `com.costasimon.grandlivre` est déjà pris, remplace-le dans **Bundle Identifier** par autre chose d'unique, par exemple `com.costasimon.grandlivre2`.
4. Branche l'iPhone en USB, déverrouille-le et accepte « Faire confiance à cet ordinateur ».
5. En haut de Xcode, choisis ton iPhone comme destination, puis clique sur **▶**.

Au premier lancement, l'iPhone peut refuser l'app (« développeur non approuvé »). Va alors dans **Réglages → Général → VPN et gestion de l'appareil**, touche ton identifiant et choisis **Faire confiance**.

## Retrouver tes données

L'app iOS a son propre stockage, **séparé** de la version ajoutée à l'écran d'accueil depuis Safari. Elle démarre donc vide. Pour retrouver tes comptes, ta collection et ses photos :

- **Avec la synchronisation GitHub (recommandé)** : dans l'app, ouvre **Réglages** (roue crantée), remplis la section « Synchronisation entre appareils » avec les mêmes informations que sur tes autres appareils, puis appuie sur **Enregistrer**. Tout arrive, photos comprises.
- **Sans synchronisation** : exporte une sauvegarde JSON depuis l'ancienne version, puis importe-la dans l'app. Les photos de la collection ne suivent pas par ce chemin.

## Compte gratuit ou payant

- **Gratuit** : l'app installée par Xcode **expire au bout de 7 jours**. Il suffit alors de rebrancher l'iPhone et de recliquer sur **▶** dans Xcode. Tes données restent sur le téléphone.
- **Apple Developer Program (99 €/an)** : l'app n'expire plus, et tu peux la partager avec d'autres personnes via **TestFlight**.

## Mettre à jour l'app après un changement

```sh
cd grand-livre
git pull
npm run ios
```

Puis **▶** dans Xcode.

## Relais eBay

Si tu utilises le relais de recherche eBay (voir `relay/README.md`), ajoute l'adresse de l'app à la variable `ALLOWED_ORIGIN` du Worker, séparée par une virgule :

```
https://ton-compte.github.io,capacitor://localhost
```

## Pour info : ce qui a été préparé

- `package.json` : les modules Capacitor et les commandes `npm run ios`, `npm run sync` et `npm test`.
- `capacitor.config.json` : le nom de l'app, son identifiant et la couleur de fond.
- `tools/build-www.mjs` : copie les fichiers du site dans `www/`, le dossier que Capacitor embarque.
- `ios/` : le projet Xcode (Swift Package Manager, iOS 15 minimum), avec :
  - l'icône redessinée en 1024 px ;
  - un écran de démarrage sombre ;
  - l'app en français, en portrait ;
  - les autorisations appareil photo et photos, pour photographier les Pop.
