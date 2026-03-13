"""
News fetcher using the NewsAPI (newsapi.org).
Fetches articles for a given company/keyword and returns structured results.
"""

import os
from datetime import date, timedelta
from typing import Optional

import httpx

NEWSAPI_BASE_URL = "https://newsapi.org/v2/everything"


def _get_api_key() -> str:
    key = os.environ.get("NEWSAPI_KEY", "")
    if not key:
        raise ValueError(
            "NEWSAPI_KEY environment variable is not set. "
            "Get a free key at https://newsapi.org/register"
        )
    return key


def fetch_news_for_company(
    company_name: str,
    days_back: int = 1,
    page_size: int = 30,
    language: str = "en",
) -> list[dict]:
    """
    Fetch news articles for a given company name from NewsAPI.

    Args:
        company_name: The company to search for.
        days_back: How many days back to search (default: 1 for daily news).
        page_size: Maximum number of raw articles to fetch before filtering.
        language: Language of articles (default: 'en').

    Returns:
        List of article dicts with keys: title, description, url, source,
        published_at, content.
    """
    api_key = _get_api_key()
    from_date = (date.today() - timedelta(days=days_back)).isoformat()

    params = {
        "q": f'"{company_name}"',
        "from": from_date,
        "sortBy": "relevancy",
        "language": language,
        "pageSize": min(page_size, 100),
        "apiKey": api_key,
    }

    with httpx.Client(timeout=15.0) as client:
        response = client.get(NEWSAPI_BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()

    if data.get("status") != "ok":
        raise RuntimeError(
            f"NewsAPI error: {data.get('message', 'Unknown error')}"
        )

    articles = []
    for article in data.get("articles", []):
        # Skip removed or placeholder articles
        if article.get("title") in ("[Removed]", None):
            continue
        articles.append(
            {
                "title": article.get("title", ""),
                "description": article.get("description", ""),
                "url": article.get("url", ""),
                "source": article.get("source", {}).get("name", ""),
                "published_at": article.get("publishedAt", ""),
                "content": article.get("content", ""),
            }
        )

    return articles


def fetch_news_for_companies(
    company_names: list[str],
    days_back: int = 1,
) -> dict[str, list[dict]]:
    """
    Fetch news for multiple companies.

    Returns:
        Dict mapping company name -> list of articles.
    """
    results = {}
    for name in company_names:
        try:
            results[name] = fetch_news_for_company(name, days_back=days_back)
        except Exception as e:
            results[name] = [{"error": str(e)}]
    return results
