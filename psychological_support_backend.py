import json
import logging
import os
import re
from collections import Counter
from pathlib import Path

from flask import Flask, jsonify, request

logger = logging.getLogger("aether.psychological_support")
MAX_MESSAGE_LENGTH = 2000
EMOTIONS = ("anger", "fear", "joy", "love", "sadness", "surprise")
DEFAULT_MODEL_PATH = Path(r"D:\emotion_chatbot_v2\models\emotion_model")
DEFAULT_DATA_PATH = Path(r"D:\emotion_chatbot_v2\data")

CRISIS_PATTERNS = (
    re.compile(r"\b(?:kill myself|end my life|want to die|suicid(?:e|al)|self[- ]harm|hurt myself|not safe with myself|immediate danger|unsafe|in danger|being hurt)\b", re.I),
    re.compile(r"\b(?:don'?t|do not|cannot|can'?t)\s+(?:feel\s+)?safe\b", re.I),
    re.compile(r"\b(?:me suicider|me faire du mal|me tuer|envie de mourir|je veux mourir|danger immédiat|je suis en danger|je ne suis pas en sécurité)\b", re.I),
)
CRISIS_RESPONSE = {
    "content": "I’m glad you told me. I can’t assess or handle an emergency. Please contact your mission’s qualified medical or psychological support team now and follow the mission emergency protocol. If you can, stay with a trusted crew member while you reach them.",
    "contentFr": "Merci de me l’avoir dit. Je ne peux pas évaluer ni gérer une urgence. Contactez maintenant l’équipe médicale ou psychologique qualifiée de votre mission et suivez le protocole d’urgence. Si possible, restez avec un membre de l’équipage de confiance pendant que vous les contactez.",
}

RESPONSES = {
    "en": {
        "anger": ("There may be frustration in what you wrote. I may be misreading it—what feels important for me to understand?", "What happened from your point of view?"),
        "fear": ("Your words may point to worry or uncertainty. Does that fit, or is another feeling closer?", "What feels most uncertain right now?"),
        "joy": ("I notice some positive feeling in your words, though I may be wrong. What part feels most meaningful to you?", "What would you like to hold on to from this moment?"),
        "love": ("Your words may reflect care or connection. What feels important about that relationship to you?", "Would you like to share more about that connection?"),
        "sadness": ("There may be some sadness in what you shared. I’m here to listen without judgment. What feels hardest right now?", "Would it help to tell me a little more?"),
        "surprise": ("It sounds as though something may have caught you off guard. How are you making sense of it?", "What surprised you most?"),
    },
    "fr": {
        "anger": ("Il y a peut-être de la frustration dans vos mots. Je peux me tromper : qu’est-ce qui est important pour moi de comprendre ?", "Que s’est-il passé de votre point de vue ?"),
        "fear": ("Vos mots peuvent évoquer de l’inquiétude ou de l’incertitude. Est-ce juste, ou ressentez-vous autre chose ?", "Qu’est-ce qui vous semble le plus incertain en ce moment ?"),
        "joy": ("Je remarque peut-être une émotion positive dans vos mots, mais je peux me tromper. Qu’est-ce qui compte le plus pour vous dans ce moment ?", "Que souhaitez-vous retenir de ce moment ?"),
        "love": ("Vos mots évoquent peut-être de l’affection ou un lien important. Qu’est-ce qui compte pour vous dans cette relation ?", "Souhaitez-vous en dire davantage sur ce lien ?"),
        "sadness": ("Il y a peut-être de la tristesse dans ce que vous partagez. Je suis là pour écouter sans jugement. Qu’est-ce qui est le plus difficile en ce moment ?", "Souhaitez-vous m’en dire un peu plus ?"),
        "surprise": ("On dirait que quelque chose vous a peut-être pris au dépourvu. Comment comprenez-vous ce qui s’est passé ?", "Qu’est-ce qui vous a le plus surpris ?"),
    },
}
FRENCH_HINTS = {"avec", "au", "beaucoup", "car", "dans", "des", "du", "elle", "et", "je", "mais", "mon", "nous", "pas", "pour", "que", "suis", "une", "vous"}


def detect_crisis_signal(text):
    return any(pattern.search(text) for pattern in CRISIS_PATTERNS)


def detect_language(text):
    words = re.findall(r"[a-zà-ÿ']+", text.lower())
    return "fr" if words and sum(word in FRENCH_HINTS for word in words) / len(words) > 0.15 else "en"


def count_dataset_examples(data_dir):
    counts = {}
    for split in ("train", "test"):
        path = Path(data_dir) / f"{split}.txt"
        emotions = Counter()
        try:
            with path.open(encoding="utf-8") as data_file:
                for line in data_file:
                    parts = line.rstrip("\r\n").rsplit(";", 1)
                    if len(parts) == 2 and parts[1] in EMOTIONS:
                        emotions[parts[1]] += 1
        except OSError:
            counts[split] = None
        else:
            counts[split] = {"examples": sum(emotions.values()), "by_emotion": dict(emotions)}
    return counts


class EmotionPredictor:
    def __init__(self, model_path=None, data_dir=None):
        self.model_path = Path(model_path or os.environ.get("EMOTION_MODEL_PATH", DEFAULT_MODEL_PATH))
        self.data_dir = Path(data_dir or os.environ.get("EMOTION_DATA_DIR", DEFAULT_DATA_PATH))
        self.model = None
        self.tokenizer = None
        self.torch = None
        self.device = None
        self.metadata = self._read_metadata()
        self.dataset = count_dataset_examples(self.data_dir)
        self.load_error = None

    @property
    def is_loaded(self):
        return self.model is not None and self.tokenizer is not None

    def _read_metadata(self):
        metadata_path = self.model_path / "emotion_config.json"
        try:
            return json.loads(metadata_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            logger.warning("Could not read local emotion metadata: %s", error)
            return {}

    def health(self):
        metrics = self.metadata.get("metrics", {})
        return {
            "status": "ok",
            "service": "local-emotion-support",
            "modelLoaded": self.is_loaded,
            "modelName": self.metadata.get("model_name", "XLM-RoBERTa"),
            "device": str(self.device) if self.device is not None else None,
            "languages": self.metadata.get("languages", ["en", "fr"]),
            "labels": list(EMOTIONS),
            "metrics": {
                "accuracy": metrics.get("accuracy"),
                "weightedF1": metrics.get("f1"),
            },
            "dataset": self.dataset,
        }

    def load(self):
        if not (self.model_path / "config.json").is_file() or not (self.model_path / "model.safetensors").is_file():
            raise FileNotFoundError(f"Local emotion model files were not found in {self.model_path}")

        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self.torch = torch
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_path), local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(
            str(self.model_path),
            local_files_only=True,
            low_cpu_mem_usage=True,
            use_safetensors=True,
        ).to(self.device)
        self.model.eval()
        self.load_error = None

    def predict(self, text):
        if not self.is_loaded:
            raise RuntimeError("The local emotion model is not loaded.")

        inputs = self.tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=int(self.metadata.get("max_length", 128)),
        )
        inputs = {key: value.to(self.device) for key, value in inputs.items()}
        with self.torch.inference_mode():
            probabilities = self.torch.softmax(self.model(**inputs).logits, dim=-1)[0].cpu().tolist()

        id2label = self.metadata.get("id2label", {})
        scores = {
            id2label.get(str(index), EMOTIONS[index] if index < len(EMOTIONS) else f"emotion_{index}"): round(float(score) * 100, 1)
            for index, score in enumerate(probabilities)
        }
        emotion = max(scores, key=scores.get)
        return {
            "emotion": emotion,
            "confidence": scores[emotion],
            "allScores": scores,
            "emoji": self.metadata.get("emotions_emoji", {}).get(emotion, "💬"),
        }


def create_app(predictor=None):
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
    app.config["EMOTION_PREDICTOR"] = predictor or EmotionPredictor()

    @app.get("/health")
    @app.get("/api/psychological-support/health")
    def health():
        return jsonify(app.config["EMOTION_PREDICTOR"].health())

    @app.post("/api/psychological-support/chat")
    def chat():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"success": False, "error": "A JSON request body is required."}), 400
        text = payload.get("message")
        if not isinstance(text, str) or not text.strip():
            return jsonify({"success": False, "error": "Enter a non-empty message."}), 400
        text = text.strip()
        if len(text) > MAX_MESSAGE_LENGTH:
            return jsonify({"success": False, "error": f"Messages must be {MAX_MESSAGE_LENGTH} characters or fewer."}), 413

        language = detect_language(text)
        if detect_crisis_signal(text):
            return jsonify({
                "success": True,
                "modelLoaded": app.config["EMOTION_PREDICTOR"].is_loaded,
                "emergency": True,
                "response": CRISIS_RESPONSE["contentFr" if language == "fr" else "content"],
                "suggestions": [],
                "emotion": None,
                "confidence": None,
                "allScores": {},
            })

        predictor = app.config["EMOTION_PREDICTOR"]
        if not predictor.is_loaded:
            return jsonify({"success": False, "error": "The local emotion model is unavailable. No model result was generated."}), 503

        try:
            prediction = predictor.predict(text)
        except (RuntimeError, ValueError, OSError, MemoryError):
            logger.exception("Local emotion inference failed")
            return jsonify({"success": False, "error": "Local emotion inference failed. No model result was generated."}), 500

        emotion = prediction["emotion"]
        response, suggestion = RESPONSES[language].get(
            emotion,
            ("I’m listening. What would feel helpful to talk about next?", "What feels most important right now?"),
        )
        return jsonify({
            "success": True,
            "modelLoaded": True,
            "modelName": predictor.health()["modelName"],
            "emergency": False,
            "emotion": emotion,
            "emotionLabel": emotion.replace("_", " ").title(),
            "emoji": prediction["emoji"],
            "confidence": prediction["confidence"],
            "allScores": prediction["allScores"],
            "response": response,
            "suggestions": [suggestion],
            "language": language,
        })

    return app


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    predictor = EmotionPredictor()
    try:
        predictor.load()
    except (ImportError, OSError, RuntimeError, ValueError, MemoryError) as error:
        predictor.load_error = str(error)
        logger.exception("Local emotion model could not be loaded")
    create_app(predictor).run(host="127.0.0.1", port=8000, debug=False, threaded=True)


if __name__ == "__main__":
    main()
