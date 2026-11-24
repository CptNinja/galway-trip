# Galway: Sláinte, Eejits!

Offline-eerst PWA voor één vriendengroep op trip naar Galway: pubbezoek, challenges, het rad, bingo, punten, uitgaven, foto's, de planning en de 1-tegen-1 **Wedstryd**.

Online: [https://d1luu4d2i8itxg.cloudfront.net/](https://d1luu4d2i8itxg.cloudfront.net/). Open het, wacht tot alles is geladen en kies "Zet op beginscherm" (iPhone) of "Installeer als app" (Android). Daarna werkt alles zonder internet.

- `LEESMIJ.txt` — voor wie de app gebruikt: installeren, back-up, offline.
- `CLAUDE.md` — de bouwkunde van de code, voor mensen en agenten.
- `DESIGN.md` — het ontwerpcontract: kleuren, typografie en wat de UI niet mag doen.
- `controle/` — zes controles zonder extra software; `node controle/wedstrijd.mjs`, `node controle/migratie.mjs` en `node controle/inhoud.mjs` draaien met alleen Node.
- `infra/` en `deploy/` — hoe de site online komt: Terraform zet AWS op (CloudFront, S3, DynamoDB, Lambda), `deploy/deploy.py` publiceert de bestanden.

Ontwikkelen: `python3 lokale_testserver.py` en dan <http://127.0.0.1:8765/> — op Windows dubbelklik `Start-Galway.cmd`.
