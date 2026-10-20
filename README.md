# Carnet.

Suivi de patrimoine personnel : PEA, compte-titres, crypto, livrets, assurance-vie.
**Vos données restent dans votre navigateur.** Le serveur ne voit jamais rien en clair.

👉 **https://connect-liard-three.vercel.app**

- Patrimoine, analyse (secteurs, pays, entreprises), simulateur d'achat ou de vente.
- Import du CSV Trade Republic, ajout manuel de n'importe quel compte.
- Cours à jour via Yahoo Finance.
- Synchronisation entre appareils, chiffrée de bout en bout (facultative).
- Installable sur téléphone, fonctionne hors ligne, mode clair ou sombre.

---

## Bien démarrer

1. **Importer Trade Republic.** Dans l'app TR : *Exportation de transactions* en CSV, **depuis l'ouverture du compte**. Puis Carnet → Données → *Importer le CSV*.
   Un export sur une période partielle donne des quantités et des espèces fausses : Carnet reconstruit tout à partir de l'historique complet.
2. **Ajouter vos autres comptes.** Données → *Ajouter un compte* (livret, assurance-vie, PER…), puis *Ajouter une ligne*.
3. **Actualiser les cours** avec le bouton en haut de l'écran.
4. **Synchroniser vos appareils** (facultatif). Données → *Créer un coffre* sur le premier appareil, puis *Se connecter* avec les mêmes identifiant et phrase de passe sur les autres.

Pour installer l'app sur un téléphone : menu du navigateur → *Ajouter à l'écran d'accueil*.

## Lire les chiffres

- **Patrimoine total** : tout compris, espèces et comptes ajoutés à la main inclus.
  Le « Total » de Trade Republic, lui, **n'inclut pas les espèces** : comparez compte par compte.
- **« En hausse de x % »** : plus-value latente de vos placements actuels **depuis l'achat**, soit (valeur − prix de revient) ÷ prix de revient.
  Les espèces, livrets et fonds en euros n'entrent pas dans le pourcentage, ni les ventes passées ou les dividendes. Ce n'est pas la variation du jour affichée par TR.
- **Prix de revient** : coût moyen pondéré, frais d'achat inclus.
- **Non coté** (Private Markets) : parts × dernier prix connu + versements en attente d'exécution.
- Petits écarts avec TR : normaux. TR affiche des cours en temps réel, Yahoo des cours légèrement différés.

## Vos données

- **Stockées dans le navigateur** (`localStorage`). Effacer les données du site les supprime ; la navigation privée ne les garde pas.
- **Synchronisation** : la phrase de passe ne quitte jamais l'appareil. Elle sert à chiffrer les données (AES-GCM 256 bits, clé dérivée par PBKDF2, 310 000 itérations). Le serveur ne garde qu'un bloc illisible.
  **Phrase oubliée = coffre perdu**, mais les données déjà présentes sur vos appareils restent intactes.
- **Sauvegarde** : Données → *Exporter* (en clair ou chiffrée), puis *Restaurer* sur un autre appareil.
- **Seule information envoyée en clair** : les symboles des titres (ex. `WPEA.PA`), pour récupérer les cours. Jamais les quantités ni les montants.

---

## Héberger Carnet

### Vercel (version en ligne)

1. Importez le dépôt sur [vercel.com](https://vercel.com). Aucun réglage à faire : `vercel.json` fixe tout (preset « Other », dossier `public`, fonctions `api/`).
2. Pour la synchronisation : *Storage → Create Database → Redis* (ou Upstash), reliée au projet pour **Production et Preview**, puis redéployez.
   Carnet accepte `REDIS_URL` comme `KV_REST_API_URL` / `KV_REST_API_TOKEN`, même avec un préfixe. Sans base, l'app fonctionne, seule la synchronisation est désactivée.

Les URL de preview sont protégées par la connexion Vercel (*Settings → Deployment Protection*).

### En local

Prérequis : [Node.js](https://nodejs.org) 18.17 ou plus récent, rien d'autre.

```bash
node server.mjs
```

Ouvrez http://localhost:8080. Les coffres de synchronisation sont rangés dans `./data`.

Options : `PORT=9000`, `HOST=0.0.0.0` (accès depuis le réseau local), `CARNET_PASSWORD="…"` (mot de passe d'accès).
Sous PowerShell : `$env:PORT=9000; node server.mjs`.

### Docker (NAS, Raspberry Pi)

```bash
docker compose up -d
```

Ouvrez http://adresse-du-nas:8080. Les coffres sont sur le volume `carnet-data`. Mot de passe facultatif : `CARNET_PASSWORD` dans `docker-compose.yml`.
Pour un accès hors de chez vous, passez par un VPN (Tailscale, WireGuard) ou un reverse proxy HTTPS.

---

## Développer

**Déploiement automatique.** Chaque push sur `main` met la prod à jour sur Vercel. Une autre branche ou une PR crée une URL de preview, sans toucher à la prod.

**CI.** GitHub Actions, sur `main` et sur les PR : syntaxe JS, test de l'API de synchronisation, démarrage du serveur.

**Tests en local**

```bash
node --test tests/sync.test.mjs
```

Test de bout en bout (Playwright) avec un faux Yahoo :

```bash
node tests/mock-yahoo.mjs &
YAHOO_BASE=http://127.0.0.1:9911 node server.mjs &
python3 tests/e2e.py http://localhost:8080 export.csv captures/ sauvegarde.json
```

**Structure**

```
server.mjs      serveur Node sans dépendance (fichiers + /api)
api/            fonctions Vercel : health, quote, search, sync
lib/            client Yahoo Finance, routes /api, coffres de synchronisation (Redis ou fichiers)
public/         l'application (HTML, CSS, JS, polices, icônes, PWA)
  js/           interface, import CSV, calculs, stockage, synchronisation, courbe, bibliothèque ETF
tools/          CSV Trade Republic → sauvegarde, en ligne de commande
tests/          test de l'API de synchronisation, test de bout en bout, faux Yahoo
```

**Bibliothèque ETF** (`public/js/library.js`) : symbole Yahoo, secteurs, pays et principales entreprises des fonds connus, en ordres de grandeur (mi-2026).

**Compositions automatiques** : chaque ETF, fonds (y compris unités de compte d'assurance-vie) et action reçoit sa composition, récupérée par le serveur (`/api/composition`, seul l'ISIN est envoyé). Source principale : Morningstar (pays et 11 secteurs complets, vus à travers l'indice même pour les ETF synthétiques du PEA, part en actions, principales positions). En secours : justETF (positions de l'indice des ETF synthétiques). Mise à jour tous les 30 jours ; la bibliothèque sert de repli quand le serveur ne trouve rien.
Pour ajouter un fonds, ajoutez une entrée avec son ISIN. Vérifiez que le symbole correspond bien au fonds **et à la bonne part** (Acc ou Dist) : un symbole voisin peut donner un cours très différent.

**Yahoo Finance** : API non officielle. Elle peut changer ou limiter les appels (erreur 429 : réessayez plus tard). Les fonds non cotés, fonds en euros et parts que Yahoo ne référence pas se mettent à jour à la main (toucher la ligne → *Modifier*).

Licence MIT.
