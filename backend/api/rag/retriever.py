from typing import List, Dict, Any
from api.services.vector_service import vector_service

class ContextRetriever:
    def retrieve(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        # Cap retrieval window to top 5 chunks (under 2,000 tokens) instead of hardcoding 25 chunks (28,870 tokens)
        k = min(max(top_k, 3), 6)
        results = vector_service.search_similar_chunks(query, k)
        
        # Sort chunks so that overall and yearly summaries appear first for LLM context prioritization
        def chunk_priority(chunk):
            cid = str(chunk.get("ID", "")).lower()
            if "overall" in cid or "enterprise" in cid:
                return 0
            elif "yearly" in cid:
                return 1
            elif "quarterly" in cid:
                return 2
            return 3

        sorted_results = sorted(results, key=chunk_priority)
        return sorted_results

retriever = ContextRetriever()
