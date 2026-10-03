"""Plagiarism engine: sentence-level similarity using embeddings.

Primary mode  : sentence-transformers (all-MiniLM-L6-v2) embeddings.
Fallback mode : TF-IDF vectors (used automatically if the model cannot be
                loaded, e.g. no internet on first run) so the app always works.
"""
import glob
import os
import re

import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CORPUS_DIR = os.path.join(BASE_DIR, "corpus")
MODEL_NAME = "all-MiniLM-L6-v2"


def split_sentences(text):
    text = re.sub(r"\s+", " ", text.strip())
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if len(p.split()) >= 4]


class PlagiarismEngine:
    def __init__(self):
        self.model = None
        self.mode = "tfidf"
        try:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer(MODEL_NAME)
            self.mode = "embeddings"
        except Exception as exc:  # no package / no internet
            print(f"[engine] Embedding model unavailable ({exc}). Using TF-IDF fallback.")
        self.default_threshold = 0.75 if self.mode == "embeddings" else 0.35
        self.corpus = self._load_corpus()
        self._corpus_vecs = None
        if self.mode == "embeddings" and self.corpus:
            self._corpus_vecs = self._encode([s for _, s in self.corpus])

    def _load_corpus(self):
        items = []
        for path in sorted(glob.glob(os.path.join(CORPUS_DIR, "*.txt"))):
            name = os.path.basename(path)
            with open(path, encoding="utf-8", errors="ignore") as f:
                for sent in split_sentences(f.read()):
                    items.append((name, sent))
        return items

    def _encode(self, sentences):
        return np.asarray(self.model.encode(sentences, normalize_embeddings=True,
                                            show_progress_bar=False))

    def _vectors(self, query, refs):
        """Return (query_matrix, ref_matrix), both L2-normalised."""
        if self.mode == "embeddings":
            q = self._encode(query)
            if self._corpus_vecs is not None and refs is self.corpus:
                return q, self._corpus_vecs
            return q, self._encode(refs)
        from sklearn.feature_extraction.text import TfidfVectorizer
        vec = TfidfVectorizer(ngram_range=(1, 2), stop_words="english", sublinear_tf=True)
        vec.fit(query + refs)
        return vec.transform(query).toarray(), vec.transform(refs).toarray()

    def check(self, text, extra_reference="", threshold=None):
        threshold = float(threshold if threshold is not None else self.default_threshold)
        sentences = split_sentences(text)
        if not sentences:
            raise ValueError("Please enter some text (at least one sentence of 4+ words).")

        ref_items = list(self.corpus)
        use_cached = not extra_reference.strip()
        for sent in split_sentences(extra_reference):
            ref_items.append(("Your reference text", sent))
        if not ref_items:
            raise ValueError("No reference documents found. Add .txt files to the corpus folder "
                             "or paste a reference text.")

        ref_sents = [s for _, s in ref_items]
        refs_arg = self.corpus if use_cached and self.corpus else ref_sents
        q, r = self._vectors(sentences, [s for _, s in refs_arg] if refs_arg is self.corpus else ref_sents)
        sims = q @ r.T
        best_idx = sims.argmax(axis=1)

        results, flagged_words, total_words = [], 0, 0
        for i, sent in enumerate(sentences):
            score = float(sims[i, best_idx[i]])
            source, matched = ref_items[best_idx[i]]
            words = len(sent.split())
            total_words += words
            level = "original"
            if score >= max(threshold, 0.9 if self.mode == "embeddings" else 0.8):
                level = "copied"
            elif score >= threshold:
                level = "paraphrased"
            if level != "original":
                flagged_words += words
            results.append({
                "sentence": sent, "score": round(score, 3), "level": level,
                "source": source if level != "original" else None,
                "matched": matched if level != "original" else None,
            })

        overall = round(100 * flagged_words / total_words, 1) if total_words else 0.0
        verdict = ("High plagiarism risk" if overall >= 50 else
                   "Moderate similarity" if overall >= 20 else
                   "Low similarity" if overall > 0 else "Looks original")
        return {
            "mode": self.mode, "threshold": threshold,
            "overall_percent": overall, "verdict": verdict,
            "sentence_count": len(sentences),
            "flagged_count": sum(r_["level"] != "original" for r_ in results),
            "results": results,
        }
