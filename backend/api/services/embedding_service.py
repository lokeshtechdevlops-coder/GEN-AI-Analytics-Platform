from typing import List
from api.services.ai_core_service import ai_core_service

class EmbeddingService:
    def get_embedding(self, text: str) -> List[float]:
        return ai_core_service.generate_embedding(text)

    def batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        from concurrent.futures import ThreadPoolExecutor
        from contextvars import copy_context
        batches = [texts[i:i + 64] for i in range(0, len(texts), 64)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(copy_context().run, ai_core_service.generate_embeddings, batch) for batch in batches]
            return [embedding for future in futures for embedding in future.result()]

embedding_service = EmbeddingService()
