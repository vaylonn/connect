# Carnet.

Suivi de patrimoine personnel. Vos comptes, vos lignes et votre historique restent **dans votre navigateur** (stockage local). Aucun serveur ne reçoit vos données personnelles.

- Quatre onglets : **Patrimoine**, **Analyse**, **Simuler**, **Données**.
- Import direct du CSV Trade Republic (« Exportation de transactions »).
- Sauvegarde en clair ou chiffrée par phrase de passe, restauration sur un autre appareil.
- Installable sur téléphone (« Ajouter à l’écran d’accueil »), fonctionne hors ligne.
- Mode clair, sombre ou automatique.
- Aucune dépendance npm, aucune requête externe depuis l’interface : polices (Lora) et icônes sont livrées avec l’app.

---

## 1. En local, sur votre ordinateur

Prérequis : [Node.js](https://nodejs.org) 18.17 ou plus récent (rien d’autre à installer).

```bash
cd carnet
node server.mjs
```

Ouvrez **http://localhost:8080**. Pour arrêter : `Ctrl + C`.

Par défaut le serveur n’écoute que sur votre ordinateur (`127.0.0.1`). Options :

```bash
PORT=9000 node server.mjs                         # autre port
HOST=0.0.0.0 node server.mjs                      # accessible depuis le réseau local
CARNET_PASSWORD="une phrase longue" HOST=0.0.0.0 node server.mjs   # avec mot de passe
```

Sous Windows (PowerShell) : `$env:PORT=9000; node server.mjs`.

## 2. Chez vous, avec Docker (NAS, Raspberry Pi)

```bash
cd carnet
docker compose up -d
```

Ouvrez **http://adresse-du-nas:8080**. L’image se construit à partir de `node:22-alpine`, disponible pour x86-64 et ARM (Raspberry Pi 3/4/5 en 64 bits).

**Mot de passe (facultatif)** : dans `docker-compose.yml`, renseignez `CARNET_PASSWORD` puis relancez `docker compose up -d`. Le navigateur demandera l’identifiant `carnet` (modifiable via `CARNET_USER`) et le mot de passe. Ce mot de passe protège l’accès à l’application ; vos données, elles, restent de toute façon dans chaque navigateur.

Sans Compose :

```bash
docker build -t carnet .
docker run -d --name carnet -p 8080:8080 -e CARNET_PASSWORD="..." --restart unless-stopped carnet
```

Pour un accès depuis l’extérieur de chez vous, passez par un VPN (WireGuard, Tailscale) ou un reverse proxy HTTPS plutôt que d’ouvrir le port directement. L’installation sur l’écran d’accueil d’un iPhone exige HTTPS, sauf sur `localhost`.

## 3. Sur le web, avec Vercel

L’adresse est publique, mais elle ne contient **aucune donnée personnelle** : chaque visiteur voit un Carnet vide, et ce qu’il y saisit reste dans son propre navigateur.

1. Créez un dépôt Git avec le contenu du dossier `carnet` (sans votre CSV ni vos sauvegardes : le `.gitignore` les exclut).
2. Sur [vercel.com](https://vercel.com), « Add New… → Project », importez le dépôt. Framework : **Other**. Laissez les réglages par défaut : `vercel.json` indique de servir le dossier `public` et les fonctions du dossier `api` servent les cours.
3. Ou en ligne de commande : `npx vercel` puis `npx vercel --prod`.

Le mot de passe n’existe pas sur Vercel : si vous ne voulez pas d’adresse publique, préférez Docker ou la protection par mot de passe payante de Vercel.

---

## Vos données

**Où elles sont.** Dans le stockage local du navigateur (`localStorage`), sur l’appareil utilisé. Effacer les données du site dans le navigateur les supprime. Une navigation privée ne les garde pas.

**Chaque appareil a les siennes.** Pour passer de l’ordinateur au téléphone : Données → *Exporter chiffrée*, transférez le fichier (AirDrop, e-mail à vous-même…), puis Données → *Restaurer une sauvegarde* sur le téléphone.

**Chiffrement.** La sauvegarde chiffrée utilise AES-GCM 256 bits ; la clé est dérivée de votre phrase de passe par PBKDF2-SHA-256 (310 000 itérations), avec un sel aléatoire. Sans la phrase, le fichier est illisible, et personne ne peut la retrouver pour vous.

**Ce qui sort de votre appareil.** Uniquement pour l’actualisation des cours : le navigateur envoie la liste des **symboles** (ex. `WPEA.PA`) à votre serveur Carnet, qui interroge Yahoo Finance. Ni quantités, ni montants, ni noms de comptes. Yahoo (et Vercel si vous l’utilisez) voit donc quels titres sont demandés, depuis l’adresse IP du serveur.

## Import Trade Republic

Dans Trade Republic, exportez vos transactions au format CSV (fichier « Exportation de transactions »). Puis Carnet → Données → *Importer le CSV*.

Carnet recalcule :

- les **quantités** (achats, ventes, plans d’épargne, Saveback, divisions d’actions, actions gratuites, transferts de titres) ;
- le **prix de revient** au coût moyen pondéré, frais d’achat inclus (une vente retire une part proportionnelle du prix de revient) ;
- le **PEA séparément du compte-titres** (colonne `account_type`), y compris pour un même titre détenu dans les deux ;
- le **solde espèces** : somme de `amount + fee + tax` de toutes les opérations du compte ;
- les fonds **non cotés** (Private Markets) : parts exécutées + versements anticipés encore en attente ;
- le dernier **prix de transaction** connu de chaque ligne, en attendant l’actualisation.

Un nouvel import remplace les lignes Trade Republic et conserve les lignes ajoutées à la main, ainsi que les noms et symboles que vous avez modifiés.

En ligne de commande, on peut aussi produire directement une sauvegarde à restaurer :

```bash
node tools/csv-vers-sauvegarde.mjs "Exportation de transactions.csv" sauvegarde.json Prénom
```

## Autres comptes (banque, livrets, assurance-vie)

Données → *Ajouter un compte* :

- **Compte courant / Livret** : indiquez le solde, il devient une ligne d’espèces ou de livret.
- **Assurance-vie, PER, compte-titres** : créez le compte, puis *Ajouter une ligne* : fonds en euros (montant), unité de compte ou ETF (quantité, prix de revient, cours, ISIN). Avec un ISIN, l’actualisation cherche le symbole Yahoo correspondant ; vous pouvez aussi saisir le symbole vous-même ou mettre le cours à jour à la main.

## Cours (Yahoo Finance)

Le bouton **Actualiser**, toujours visible en haut de l’écran, met à jour chaque produit qui a une cotation publique :

1. pour une ligne sans symbole, le serveur cherche le symbole Yahoo à partir de l’ISIN (actions, ETF, OPCVM, unités de compte) ;
2. il récupère le cours du jour et l’historique : 5 ans en hebdomadaire, puis la dernière année au jour le jour ;
3. les cours en devise étrangère sont convertis en euros avec le taux `EUR<devise>=X`, date par date.

L’historique alimente la courbe d’évolution du patrimoine et la courbe de cours dans le détail de chaque ligne (1 mois, 6 mois, 1 an, 5 ans, avec le prix de revient en pointillé). Le résultat de chaque actualisation (produits à jour, produits sans cours et pourquoi) est détaillé dans Données → Cours.

Restent sans cours : les fonds non cotés (Private Equity), les fonds en euros, et les fonds que Yahoo ne référence pas (fréquent pour les parts institutionnelles « I » d’assurance-vie). Pour ceux-là, saisissez la valeur liquidative à la main (toucher la ligne → *Modifier*).

Le serveur interroge `query1.finance.yahoo.com`, puis `query2` si le premier refuse. Cette API n’est pas officielle : elle peut changer ou limiter les appels (erreur 429 : réessayez quelques minutes plus tard). Sans serveur (fichiers ouverts directement, ou aperçu en ligne), l’actualisation est indisponible et l’app le dit.

## Ajouter des comptes depuis un fichier

Données → *Restaurer une sauvegarde* accepte aussi un fichier qui ne contient que quelques comptes (marqué `"partial": true`). Carnet propose alors **Ajouter à mes données** : les comptes du fichier s’ajoutent, ceux qui ont le même identifiant sont remplacés, le reste ne bouge pas. Pour une sauvegarde complète, vous pouvez choisir entre ajouter et tout remplacer.

Une ligne d’assurance-vie peut être saisie par son **montant investi** (`"estimateFromAmount": true`) : à la première actualisation, Carnet calcule la quantité avec la valeur liquidative du jour de souscription, et l’indique comme estimée.

## Composition des ETF

Les principales entreprises, secteurs et pays des ETF connus sont des **ordres de grandeur** saisis dans `public/js/library.js` (mi-2026). Ils servent à donner une vue d’ensemble dans *Analyse* et dans le détail d’une ligne ; vérifiez la fiche de l’émetteur pour les chiffres exacts. Pour ajouter un produit, ajoutez une entrée avec son ISIN dans ce fichier.

## Structure

```
carnet/
├── server.mjs              serveur Node (fichiers + /api), sans dépendance
├── lib/                    client Yahoo Finance et routes /api partagées
├── api/                    fonctions Vercel (health, quote, search)
├── public/                 l’application (HTML, CSS, JS, polices, icônes, PWA)
│   └── js/                 app, import CSV, calculs, stockage, courbe, bibliothèque ETF
├── tools/                  conversion CSV → sauvegarde en ligne de commande
├── tests/                  test de bout en bout (Playwright) et faux Yahoo
├── Dockerfile, docker-compose.yml, vercel.json
```

## Tests

```bash
node tests/mock-yahoo.mjs &                                   # faux Yahoo sur :9911
YAHOO_BASE=http://127.0.0.1:9911 node server.mjs &
python3 tests/e2e.py http://localhost:8080 export.csv captures/ sauvegarde.json
```

Licence MIT.
