"""Локальная многоязычная модель для смыслового поиска."""
import os
import threading
import numpy as np
from .config import MODELS

MODEL = os.getenv('EMBEDDING_REPO', 'Xenova/multilingual-e5-small')
MODEL_FILE = os.getenv('EMBEDDING_FILE', 'onnx/model_quantized.onnx')
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
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = min(4, os.cpu_count() or 2)
        session = ort.InferenceSession(model_path, opts, providers=['CPUExecutionProvider'])
        _tokenizer, _session = tokenizer, session
        return session, tokenizer

def embed(texts, query=False):
    session, tokenizer = load_model()
    result = []
    with _lock:
        for i in range(0, len(texts), 16):
            batch = tokenizer.encode_batch([('query: ' if query else 'passage: ') + t for t in texts[i:i+16]])
            ids = np.asarray([b.ids for b in batch], dtype=np.int64)
            mask = np.asarray([b.attention_mask for b in batch], dtype=np.int64)
            feeds = {'input_ids': ids, 'attention_mask': mask, 'token_type_ids': np.zeros_like(ids)}
            feeds = {v.name: feeds[v.name] for v in session.get_inputs()}
            tokens = session.run(None, feeds)[0]
            vectors = (tokens * mask[:, :, None]).sum(1) / np.maximum(mask.sum(1)[:, None], 1)
            vectors /= np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-9)
            result.extend(vectors.astype(np.float32))
    return result
