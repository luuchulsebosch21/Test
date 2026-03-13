"""
Relevance filtering using the Claude API.
Scores articles for relevance to a company and returns the top N.
"""

import json
import os
from typing import Optional

import anthropic

MAX_ARTICLES_PER_COMPANY = 10


def _build_scoring_prompt(company_name: str, articles: list[dict]) -> str:
    articles_text = ""
    for i, article in enumerate(articles, 1):
        articles_text += (
            f"\n[{i}] Title: {article.get('title', '')}\n"
            f"    Source: {article.get('source', '')}\n"
            f"    Published: {article.get('published_at', '')}\n"
            f"    Description: {article.get('description', '')}\n"
        )

    return f"""You are a financial news analyst. Evaluate the relevance of the following news articles for the company "{company_name}".

For each article, assign a relevance score from 0 to 10:
- 10: Directly about {company_name} (earnings, products, leadership, strategy, legal issues, etc.)
- 7-9: Strongly related (industry news directly affecting {company_name}, mentions {company_name} prominently)
- 4-6: Moderately related (sector news, mentions {company_name} briefly)
- 1-3: Weakly related (general industry, {company_name} mentioned incidentally)
- 0: Not relevant

Articles to evaluate:
{articles_text}

Respond ONLY with a JSON array of objects, one per article, in this exact format:
[
  {{"index": 1, "score": 8, "reason": "Brief reason"}},
  {{"index": 2, "score": 3, "reason": "Brief reason"}},
  ...
]"""


def score_articles(
    company_name: str,
    articles: list[dict],
    max_results: int = MAX_ARTICLES_PER_COMPANY,
) -> list[dict]:
    """
    Use Claude to score articles by relevance to a company.
    Returns the top `max_results` articles, each enriched with a relevance score.

    Args:
        company_name: The company name for relevance context.
        articles: List of article dicts from the news fetcher.
        max_results: Maximum number of articles to return (default: 10).

    Returns:
        Sorted list of up to `max_results` articles with added 'relevance_score'
        and 'relevance_reason' fields.
    """
    if not articles:
        return []

    # Skip scoring if there are already few articles
    if len(articles) <= max_results:
        articles_to_score = articles
    else:
        articles_to_score = articles

    client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    # Batch into chunks of 20 to keep prompts manageable
    chunk_size = 20
    scores: dict[int, dict] = {}

    for chunk_start in range(0, len(articles_to_score), chunk_size):
        chunk = articles_to_score[chunk_start : chunk_start + chunk_size]
        # Renumber for this chunk's prompt (1-based)
        prompt = _build_scoring_prompt(company_name, chunk)

        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = next(
            (b.text for b in response.content if b.type == "text"), "[]"
        )

        # Extract the JSON array even if Claude adds surrounding text
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start == -1 or end == 0:
            # Fallback: give all articles in this chunk a neutral score
            for i, _ in enumerate(chunk):
                scores[chunk_start + i] = {"score": 5, "reason": "Could not parse score"}
            continue

        try:
            scored = json.loads(raw[start:end])
        except json.JSONDecodeError:
            for i, _ in enumerate(chunk):
                scores[chunk_start + i] = {"score": 5, "reason": "JSON parse error"}
            continue

        for item in scored:
            # item["index"] is 1-based within the chunk
            global_idx = chunk_start + item["index"] - 1
            scores[global_idx] = {
                "score": item.get("score", 0),
                "reason": item.get("reason", ""),
            }

    # Enrich articles with scores
    enriched = []
    for i, article in enumerate(articles_to_score):
        score_data = scores.get(i, {"score": 0, "reason": ""})
        enriched.append(
            {
                **article,
                "relevance_score": score_data["score"],
                "relevance_reason": score_data["reason"],
            }
        )

    # Sort by relevance score descending, return top N
    enriched.sort(key=lambda a: a["relevance_score"], reverse=True)
    return enriched[:max_results]


def filter_articles_simple(
    company_name: str,
    articles: list[dict],
    max_results: int = MAX_ARTICLES_PER_COMPANY,
) -> list[dict]:
    """
    Lightweight keyword-based filter used as a fallback when the Claude API
    is unavailable or for speed. Returns top `max_results` articles that
    mention the company name in title or description.
    """
    name_lower = company_name.lower()
    matched = []
    unmatched = []
    for article in articles:
        text = (
            (article.get("title") or "")
            + " "
            + (article.get("description") or "")
        ).lower()
        if name_lower in text:
            matched.append(article)
        else:
            unmatched.append(article)

    combined = matched + unmatched
    return combined[:max_results]
