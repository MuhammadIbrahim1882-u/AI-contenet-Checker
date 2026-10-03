import os

from flask import Flask, jsonify, request, send_from_directory

from engine import PlagiarismEngine

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, "static"), static_url_path="/static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0  # always load fresh CSS/JS while developing
engine = PlagiarismEngine()
print(f"[app] Engine mode: {engine.mode} | corpus sentences: {len(engine.corpus)}")


@app.after_request
def add_cors(resp):
    # lets index.html work even when opened directly from disk (file://)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/status")
def status():
    return jsonify(mode=engine.mode, default_threshold=engine.default_threshold,
                   corpus_sentences=len(engine.corpus))


@app.route("/api/check", methods=["POST"])
def check():
    data = request.get_json(silent=True) or {}
    try:
        out = engine.check(data.get("text", ""), data.get("reference", ""),
                           data.get("threshold"))
        return jsonify(out)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except Exception as exc:
        return jsonify(error=f"Server error: {exc}"), 500


if __name__ == "__main__":
    print("Open http://127.0.0.1:5000 in your browser")
    app.run(host="127.0.0.1", port=5000, debug=False)
