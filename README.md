# Zsound

Lecteur de musique pour Windows : recherche instantanée, lecture en ~0,2 s, ZS Quality, interface liquid glass bleu sombre, français et anglais.

## Télécharger

Dernière version : [Releases](https://github.com/2dekur/ZS/releases/latest) → `Zsound-Setup-x.y.z.exe`.
L'app prévient quand une mise à jour sort, rien ne s'installe sans ton accord.

## Fonctionnalités

- **ZS Engine** : moteur de lecture maison, chaque titre démarre en ~0,2 s
- **ZS Quality** : meilleur flux Opus disponible (~160 kbps), volume calibré, chemin audio 48 kHz sans traitement
- File d'attente, lecture auto (radio), titres likés, playlists, paroles, égaliseur 5 bandes
- Touches média Windows, raccourcis clavier
- Accélération matérielle activable dans les Paramètres

## Développement

```powershell
pnpm install
pnpm fetch:engine   # moteur de secours yt-dlp, embarqué dans l'installeur
pnpm electron:build # installeur dans release/
```

Publier une version : changer `version` dans `package.json`, écrire les notes dans `build/release-notes.md`, puis
`$env:GH_TOKEN = "<token>"; pnpm release`.

Vérifications : `pnpm check:api`, `pnpm check:engine`, `pnpm check:quality`.
