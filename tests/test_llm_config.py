import json
import httpx
from backend.processing import call_llm


def test_luna_request_uses_medium_reasoning_and_completion_budget(monkeypatch):
    monkeypatch.setenv('LLM_BASE_URL', 'https://provider.example/v1')
    monkeypatch.setenv('LLM_API_KEY', 'test-key')
    monkeypatch.setenv('LLM_MODEL', 'gpt-6-luna')
    monkeypatch.setenv('LLM_REASONING_EFFORT', 'medium')
    monkeypatch.setenv('LLM_MAX_COMPLETION_TOKENS', '8192')
    def respond(request):
        payload = json.loads(request.content)
        assert payload['model'] == 'gpt-6-luna'
        assert payload['reasoning_effort'] == 'medium'
        assert payload['max_completion_tokens'] == 8192
        assert 'temperature' not in payload and 'max_tokens' not in payload
        return httpx.Response(200, json={'choices': [{'message': {'content': 'Ответ'}}]})
    original = httpx.Client
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    assert call_llm('Система', 'Вопрос') == 'Ответ'
