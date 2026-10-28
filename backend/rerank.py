"""Повторная оценка того, отвечает ли фрагмент на вопрос пользователя."""
import os
import threading
from functools import lru_cache

import numpy as np

from .config import MODELS

MODEL = os.getenv('RERANKER_REPO', 'onnx-community/bge-reranker-v2-m3-ONNX')
MODEL_FILE = os.getenv('RERANKER_FILE', 'onnx/model_quantized.onnx')
_lock = threading.RLock()
_session = None
_tokenizer = None


def load_model():
    global _session, _tokenizer
    with _lock:
        if _session is not None:
            return _session, _tokenizer
        import onnxruntime as ort
        from tokenizers import Tokenizer
        from huggingface_hub import hf_hub_download
        from huggingface_hub.errors import LocalEntryNotFoundError

        def cached_file(filename):
            try:
                return hf_hub_download(MODEL, filename, cache_dir=str(MODELS), local_files_only=True)
            except LocalEntryNotFoundError:
                return hf_hub_download(MODEL, filename, cache_dir=str(MODELS))

        tokenizer_path = cached_file('tokenizer.json')
        model_path = cached_file(MODEL_FILE)
        tokenizer = Tokenizer.from_file(tokenizer_path)
        tokenizer.enable_truncation(max_length=512)
        tokenizer.enable_padding(pad_id=1, pad_token='<pad>')
        options = ort.SessionOptions()
        options.intra_op_num_threads = min(4, os.cpu_count() or 2)
        session = ort.InferenceSession(model_path, options, providers=['CPUExecutionProvider'])
        _session, _tokenizer = session, tokenizer
        return session, tokenizer


def relevance(query, passages):
    if not passages:
        return []
    return list(_relevance(query, tuple(passages)))


@lru_cache(maxsize=128)
def _relevance(query, passages):
    try:
        session, tokenizer = load_model()
    except Exception as exc:
        raise RuntimeError('Не удалось загрузить модель оценки фрагментов. Выполните download-models из README.') from exc
    result = []
    with _lock:
        for offset in range(0, len(passages), 8):
            batch = tokenizer.encode_batch([(query, text) for text in passages[offset:offset + 8]])
            feeds = {
                'input_ids': np.asarray([item.ids for item in batch], dtype=np.int64),
                'attention_mask': np.asarray([item.attention_mask for item in batch], dtype=np.int64),
                'token_type_ids': np.asarray([item.type_ids for item in batch], dtype=np.int64),
            }
            logits = session.run(None, {item.name: feeds[item.name] for item in session.get_inputs()})[0].reshape(-1)
            if not np.isfinite(logits).all() or len(logits) != len(batch):
                raise RuntimeError('Модель оценки фрагментов вернула некорректный результат.')
            result.extend((1 / (1 + np.exp(-np.clip(logits, -50, 50)))).tolist())
    return tuple(result)
