# Relais de recherche eBay

La recherche de l'onglet **Collection Pop** fonctionne sans configuration grâce au catalogue intégré (`pop-catalog.json`) : plus de 21 000 Pop, cherchables par nom, licence, **numéro** (« 1362 ») ou **code-barres**, avec les sorties jusqu'à 2025 environ. Voir la section « Catalogue » plus bas.

Ce relais est **facultatif** : il ajoute les annonces eBay, utiles pour les toutes dernières sorties que le catalogue n'a pas encore. Tu l'installes une fois (environ 15 minutes, gratuit), puis tu colles son adresse dans Grand Livre. Attention : en 2026, eBay refuse automatiquement beaucoup d'inscriptions au programme développeur, sans explication.

Pourquoi un relais ? La clé eBay est secrète et ne doit jamais se trouver dans une page web. Le relais la garde et ne répond qu'à ton application.

## 1. Clés eBay

1. Crée un compte sur <https://developer.ebay.com> (« Register », gratuit). La validation peut prendre jusqu'à un jour ouvré.
2. Va dans **Application Keys** et crée un jeu de clés **Production** (nom au choix, par exemple `grand-livre`).
3. eBay te demande alors de gérer les notifications de suppression de compte (« Marketplace Account Deletion »). Choisis l'exemption : **« I do not persist eBay data »**. C'est exact : le relais ne stocke rien.
4. Note deux valeurs du jeu Production :
   - **App ID (Client ID)** ;
   - **Cert ID (Client Secret)**.

## 2. Relais Cloudflare

1. Crée un compte sur <https://dash.cloudflare.com/sign-up> (offre gratuite).
2. Va dans **Workers & Pages → Create → Create Worker**, nomme-le `grand-livre-pop`, puis **Deploy**.
3. Clique sur **Edit code**. Remplace tout le contenu par celui de [`ebay-relay.mjs`](ebay-relay.mjs), puis **Deploy**.
4. Va dans **Settings → Variables and Secrets** du Worker et ajoute :

   | Nom | Type | Valeur |
   |---|---|---|
   | `EBAY_CLIENT_ID` | Secret | l'App ID eBay |
   | `EBAY_CLIENT_SECRET` | Secret | le Cert ID eBay |
   | `ALLOWED_ORIGIN` | Text | l'adresse où tu ouvres Grand Livre, sans chemin ni `/` final (par exemple `https://ton-compte.github.io`). Avec l'app iOS, ajoute `,capacitor://localhost` |
   | `EBAY_MARKETPLACE` | Text (facultatif) | `EBAY_US` par défaut, qui a le plus d'annonces Funko ; `EBAY_FR` pour eBay France |

5. Redéploie, puis note l'adresse du Worker : `https://grand-livre-pop.<ton-compte>.workers.dev`.

## 3. Dans Grand Livre

Sur **chaque appareil**, ouvre **Réglages → Recherche de Pop en ligne**, colle l'adresse du Worker et appuie sur **Enregistrer**. Un message confirme que le relais répond.

## Bon à savoir

- **Quotas** : eBay accorde 5 000 recherches par jour et Cloudflare 100 000 appels par jour. Le relais garde chaque recherche en cache une heure, et l'app attend une courte pause dans la frappe avant d'appeler.
- **Qualité des résultats** : les suggestions viennent d'annonces, donc le nom proposé peut contenir un mot en trop (« Marvel Spider-Man »). Tu peux le corriger dans le formulaire avant d'ajouter.
- **Mise à jour du relais** : si `ebay-relay.mjs` change, recolle son contenu dans l'éditeur Cloudflare.
- **Catalogue** : `pop-catalog.json` est construit par `tools/build-pop-catalog.py`, qui fusionne deux jeux de données ouverts sous licence MIT :
  - [celticht32/funkodex-catalog](https://github.com/celticht32/funkodex-catalog) (© 2026 Chris Ahrendt) : numéros, codes-barres, années, une partie des photos ;
  - [kennymkchan/funko-pop-data](https://github.com/kennymkchan/funko-pop-data) (© 2020 Kenny Chan) : photos manquantes et Pop absentes du premier.

  Pour le régénérer : télécharge `funkodex_base_catalog.json` et `funko_pop.json` depuis ces deux dépôts, puis
  `python3 tools/build-pop-catalog.py funkodex_base_catalog.json funko_pop.json pop-catalog.json`.
