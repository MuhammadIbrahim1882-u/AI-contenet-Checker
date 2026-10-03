# AI Plagiarism Checker (Text Similarity with Embeddings)

Checks every sentence of your text against a reference corpus using sentence embeddings
(`all-MiniLM-L6-v2`) and cosine similarity. Flags sentences as **copied** or **paraphrased**.
If the embedding model can't be downloaded, it automatically falls back to TF-IDF so it still works.

## Run
```
cd ai-plagiarism-checker
python -m venv venv
venv\Scripts\activate          # Windows   (Mac/Linux: source venv/bin/activate)
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000  (first run downloads the ~90 MB model; internet needed once).

## Files
- `app.py` – Flask server and API (`/api/check`, `/api/status`)
- `engine.py` – sentence splitting, embeddings, similarity, scoring
- `corpus/*.txt` – built-in reference documents (add your own .txt files here, restart app)
- `index.html` (page), `static/style.css` (all styling), `static/script.js` (logic)
- `run.bat` / `run.sh` – one-click install + start

## UI features
Light/dark theme toggle, paste or drag-and-drop .txt upload, Lenient/Balanced/Strict presets,
animated score gauge, click-to-jump highlights, Copied/Paraphrased filters, copy/download report,
recent-check history, and Ctrl+Enter shortcut.

## Important
Keep the folder structure exactly as shipped (`index.html` next to `app.py`, and the `static/` folder beside it).
Start the server with `python app.py` (or double-click `run.bat`) and open **http://127.0.0.1:5000**.
Opening `index.html` directly also shows the full design; the server must be running for the checks to work.
