# MBA Trainer — Digital Business Lerntool

Flashcard-/MC-Lerntool als statische Web-App (`index.html`), ausgeliefert über
einen Cloudflare Worker (`src/index.js`, siehe `wrangler.jsonc`). Fortschritt
wird lokal (`localStorage`) gehalten und optional über `/sync` geräteübergreifend
gespeichert.

## Native Android-App

Das Repo enthält zusätzlich ein natives Android-Projekt (`android/`), erzeugt mit
[Capacitor](https://capacitorjs.com/). Es lädt dieselbe `index.html` als App-UI —
Karteninhalte, Design und Logik sind identisch zur Web-Version, keine Doppelpflege.

### Struktur

- `index.html`, `robots.txt` — die eigentliche App (einzige Quelle der Wahrheit)
- `scripts/sync-web-assets.js` — kopiert diese Dateien nach `www/` (Capacitor-`webDir`)
- `scripts/generate-icons.js` — erzeugt die Launcher-Icons unter `android/app/src/main/res`
- `capacitor.config.json` — App-ID `com.mbatrainer.app`, App-Name „MBA Trainer“
- `android/` — natives Gradle/Kotlin-Projekt (Android Studio kann es direkt öffnen)
- `.github/workflows/android-apk.yml` — baut bei jedem Push eine Debug-APK per CI

### APK bauen

**Per GitHub Actions (kein lokales Android SDK nötig):** Der Workflow
„Android APK“ läuft automatisch bei Push und legt `mba-trainer-debug-apk` als
Artifact im jeweiligen Actions-Run ab — dort herunterladen und auf dem Handy
installieren (unbekannte Quellen erlauben).

**Lokal mit Android Studio / SDK:**

```bash
npm install
npm run android:sync   # kopiert index.html/robots.txt nach www/ und synct das native Projekt
npx cap open android    # öffnet Android Studio, oder:
cd android && ./gradlew assembleDebug
```

Nach jeder Änderung an `index.html` einfach `npm run android:sync` erneut ausführen,
bevor neu gebaut wird.

### Login & Sync in der App

Die Android-App lädt die Assets lokal, daher greift die relative `/sync`-Route
aus der Web-Version dort nicht automatisch. Beim ersten Start zeigt die App
deshalb einen verpflichtenden Login-Screen (Worker-URL, Benutzername, Passwort —
dieselben Zugangsdaten wie der Basic-Auth-Schutz des Workers). Nach erfolgreicher
Prüfung wird der Login lokal gespeichert und der Lernstand synct danach automatisch
im Hintergrund (auf jede Änderung debounced, beim App-Start abgeglichen) —
kein erneutes Anmelden nötig, außer Zugangsdaten ändern sich oder ein Sync-Aufruf
liefert `401` (dann erscheint der Login-Screen automatisch wieder).

Über das ⚙-Symbol neben der Sync-Anzeige lassen sich URL/Zugangsdaten jederzeit
ändern; „Zurücksetzen“ meldet die App ab (Login-Screen erscheint beim nächsten
Start erneut). Die **Web-Version bleibt unverändert** beim Browser-Basic-Auth-Popup
— der Login-Screen läuft ausschließlich in der nativen App
(`window.Capacitor.isNativePlatform()`).

Der Worker (`src/index.js`) erlaubt CORS-Anfragen von `https://localhost`
(Capacitor-Android-Standardursprung), damit die App-Anfragen an `/sync` überhaupt
ankommen.
