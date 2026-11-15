import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from psychological_support_backend import create_app, detect_crisis_signal


class FakePredictor:
    is_loaded = True

    def health(self):
        return {"status": "ok", "modelLoaded": True, "modelName": "test-model"}

    def predict(self, _text):
        return {
            "emotion": "sadness",
            "confidence": 81.5,
            "allScores": {"sadness": 81.5, "joy": 18.5},
            "emoji": "😢",
        }


class OfflinePredictor:
    is_loaded = False

    def health(self):
        return {"status": "ok", "modelLoaded": False, "modelName": "test-model"}

    def predict(self, _text):
        raise AssertionError("An unloaded model must not be used.")


class PsychologicalSupportApiTests(unittest.TestCase):
    def setUp(self):
        self.client = create_app(FakePredictor()).test_client()

    def test_chat_returns_model_estimate_without_persisting_message(self):
        response = self.client.post("/api/psychological-support/chat", json={"message": "I feel low today"})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["modelLoaded"])
        self.assertEqual(payload["emotion"], "sadness")
        self.assertEqual(payload["confidence"], 81.5)
        self.assertNotIn("message", payload)

    def test_crisis_message_bypasses_model(self):
        self.assertTrue(detect_crisis_signal("I might hurt myself"))
        self.assertTrue(detect_crisis_signal("Je ne suis pas en sécurité"))
        response = self.client.post("/api/psychological-support/chat", json={"message": "I want to end my life"})
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["emergency"])
        self.assertIsNone(payload["emotion"])

    def test_invalid_and_oversized_messages_are_rejected(self):
        self.assertEqual(self.client.post("/api/psychological-support/chat", json={"message": "  "}).status_code, 400)
        self.assertEqual(self.client.post("/api/psychological-support/chat", json={"message": "x" * 2001}).status_code, 413)

    def test_health_reports_model_state(self):
        response = self.client.get("/api/psychological-support/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["modelLoaded"])

    def test_unavailable_model_returns_explicit_error(self):
        client = create_app(OfflinePredictor()).test_client()
        response = client.post("/api/psychological-support/chat", json={"message": "I feel low"})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.get_json()["success"])
        self.assertNotIn("emotion", response.get_json())


if __name__ == "__main__":
    unittest.main()
