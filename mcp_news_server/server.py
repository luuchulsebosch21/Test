"""
MCP Server — Bedrijfsnieuws Monitor
====================================
Exposes tools for managing a company watchlist and fetching daily filtered news.

Tools:
  add_company        — Add a company to the watchlist
  remove_company     — Remove a company from the watchlist
  list_companies     — List all watched companies
  get_company_news   — Fetch and filter news for one company
  get_daily_digest   — Fetch and filter news for all companies
"""

import json
import os
from typing import Any

from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolResult,
    TextContent,
    Tool,
)

load_dotenv()

from . import storage, news, filter as news_filter  # noqa: E402

app = Server("mcp-company-news-server")


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="add_company",
            description=(
                "Voeg een bedrijf toe aan de volglijst. "
                "Add a company to the watchlist."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Naam van het bedrijf / Company name",
                    },
                    "description": {
                        "type": "string",
                        "description": "Optionele beschrijving / Optional description",
                    },
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="remove_company",
            description=(
                "Verwijder een bedrijf van de volglijst. "
                "Remove a company from the watchlist."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Naam van het bedrijf / Company name",
                    },
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="list_companies",
            description=(
                "Toon alle bedrijven op de volglijst. "
                "List all companies on the watchlist."
            ),
            inputSchema={
                "type": "object",
                "properties": {},
            },
        ),
        Tool(
            name="get_company_news",
            description=(
                "Haal het gefilterde dagelijkse nieuws op voor één bedrijf (max 10 items). "
                "Fetch filtered daily news for one company (max 10 items). "
                "Uses Claude to rank articles by relevance."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Naam van het bedrijf / Company name",
                    },
                    "days_back": {
                        "type": "integer",
                        "description": "Aantal dagen terug / Days back to search (default 1)",
                        "default": 1,
                    },
                    "use_ai_filter": {
                        "type": "boolean",
                        "description": (
                            "Gebruik Claude AI voor relevantiescoring / "
                            "Use Claude AI for relevance scoring (default true)"
                        ),
                        "default": True,
                    },
                },
                "required": ["name"],
            },
        ),
        Tool(
            name="get_daily_digest",
            description=(
                "Haal het dagelijkse nieuwsoverzicht op voor alle gevolgde bedrijven. "
                "Fetch daily news digest for all watched companies. "
                "Returns up to 10 relevant articles per company."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "days_back": {
                        "type": "integer",
                        "description": "Aantal dagen terug / Days back (default 1)",
                        "default": 1,
                    },
                    "use_ai_filter": {
                        "type": "boolean",
                        "description": "Gebruik Claude AI-filter / Use Claude AI filter (default true)",
                        "default": True,
                    },
                },
            },
        ),
    ]


# ---------------------------------------------------------------------------
# Tool call handler
# ---------------------------------------------------------------------------

@app.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> CallToolResult:
    if name == "add_company":
        return _handle_add_company(arguments)
    elif name == "remove_company":
        return _handle_remove_company(arguments)
    elif name == "list_companies":
        return _handle_list_companies()
    elif name == "get_company_news":
        return _handle_get_company_news(arguments)
    elif name == "get_daily_digest":
        return _handle_get_daily_digest(arguments)
    else:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Unknown tool: {name}")],
            isError=True,
        )


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

def _handle_add_company(args: dict) -> CallToolResult:
    company_name = args.get("name", "").strip()
    if not company_name:
        return CallToolResult(
            content=[TextContent(type="text", text="Error: 'name' is required.")],
            isError=True,
        )
    description = args.get("description", "")
    result = storage.add_company(company_name, description)

    if result["status"] == "already_exists":
        text = f"⚠️  '{company_name}' staat al op de volglijst.\n'{company_name}' is already on the watchlist."
    else:
        text = (
            f"✅ '{company_name}' toegevoegd aan de volglijst.\n"
            f"'{company_name}' added to the watchlist."
        )
        if description:
            text += f"\nBeschrijving / Description: {description}"

    return CallToolResult(content=[TextContent(type="text", text=text)])


def _handle_remove_company(args: dict) -> CallToolResult:
    company_name = args.get("name", "").strip()
    if not company_name:
        return CallToolResult(
            content=[TextContent(type="text", text="Error: 'name' is required.")],
            isError=True,
        )
    result = storage.remove_company(company_name)

    if result["status"] == "not_found":
        text = (
            f"⚠️  '{company_name}' niet gevonden op de volglijst.\n"
            f"'{company_name}' not found on the watchlist."
        )
    else:
        text = (
            f"🗑️  '{company_name}' verwijderd van de volglijst.\n"
            f"'{company_name}' removed from the watchlist."
        )

    return CallToolResult(content=[TextContent(type="text", text=text)])


def _handle_list_companies() -> CallToolResult:
    companies = storage.list_companies()

    if not companies:
        text = (
            "📋 De volglijst is leeg. Voeg bedrijven toe met 'add_company'.\n"
            "The watchlist is empty. Add companies using 'add_company'."
        )
        return CallToolResult(content=[TextContent(type="text", text=text)])

    lines = ["📋 **Gevolgde bedrijven / Watched companies:**\n"]
    for c in companies:
        line = f"  • {c['name']}"
        if c.get("description"):
            line += f" — {c['description']}"
        lines.append(line)
    lines.append(f"\nTotaal / Total: {len(companies)} bedrijf/bedrijven")

    return CallToolResult(content=[TextContent(type="text", text="\n".join(lines))])


def _handle_get_company_news(args: dict) -> CallToolResult:
    company_name = args.get("name", "").strip()
    if not company_name:
        return CallToolResult(
            content=[TextContent(type="text", text="Error: 'name' is required.")],
            isError=True,
        )

    days_back = int(args.get("days_back", 1))
    use_ai = bool(args.get("use_ai_filter", True))

    try:
        articles = news.fetch_news_for_company(company_name, days_back=days_back)
    except Exception as e:
        return CallToolResult(
            content=[TextContent(type="text", text=f"❌ Nieuws ophalen mislukt / News fetch failed: {e}")],
            isError=True,
        )

    if not articles:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=(
                    f"📰 Geen nieuws gevonden voor '{company_name}' "
                    f"in de afgelopen {days_back} dag(en).\n"
                    f"No news found for '{company_name}' in the last {days_back} day(s)."
                ),
            )]
        )

    # Filter for relevance
    if use_ai and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            filtered = news_filter.score_articles(company_name, articles)
        except Exception:
            filtered = news_filter.filter_articles_simple(company_name, articles)
    else:
        filtered = news_filter.filter_articles_simple(company_name, articles)

    return CallToolResult(content=[TextContent(type="text", text=_format_news(company_name, filtered, days_back))])


def _handle_get_daily_digest(args: dict) -> CallToolResult:
    days_back = int(args.get("days_back", 1))
    use_ai = bool(args.get("use_ai_filter", True))

    companies = storage.list_companies()
    if not companies:
        return CallToolResult(
            content=[TextContent(
                type="text",
                text=(
                    "📋 De volglijst is leeg. Voeg eerst bedrijven toe met 'add_company'.\n"
                    "The watchlist is empty. First add companies using 'add_company'."
                ),
            )]
        )

    sections = [
        f"📰 **Dagelijks Nieuwsoverzicht / Daily News Digest**",
        f"Periode / Period: afgelopen {days_back} dag(en) / last {days_back} day(s)",
        f"Bedrijven / Companies: {len(companies)}\n",
        "=" * 60,
    ]

    for company in companies:
        name = company["name"]
        sections.append(f"\n## {name}")

        try:
            articles = news.fetch_news_for_company(name, days_back=days_back)
        except Exception as e:
            sections.append(f"❌ Fout / Error: {e}\n")
            continue

        if not articles:
            sections.append(
                f"  Geen nieuws gevonden in de afgelopen {days_back} dag(en).\n"
                f"  No news found in the last {days_back} day(s).\n"
            )
            continue

        if use_ai and os.environ.get("ANTHROPIC_API_KEY"):
            try:
                filtered = news_filter.score_articles(name, articles)
            except Exception:
                filtered = news_filter.filter_articles_simple(name, articles)
        else:
            filtered = news_filter.filter_articles_simple(name, articles)

        sections.append(_format_news_compact(name, filtered))
        sections.append("-" * 40)

    return CallToolResult(content=[TextContent(type="text", text="\n".join(sections))])


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _format_news(company_name: str, articles: list[dict], days_back: int) -> str:
    """Format a full news listing for a single company."""
    header = (
        f"📰 **Nieuws voor / News for: {company_name}**\n"
        f"Periode / Period: afgelopen {days_back} dag(en) / last {days_back} day(s)\n"
        f"Gevonden / Found: {len(articles)} artikel(en)\n"
        + "=" * 60
    )
    lines = [header]

    for i, article in enumerate(articles, 1):
        score = article.get("relevance_score")
        score_str = f" [Relevantie/Relevance: {score}/10]" if score is not None else ""
        reason = article.get("relevance_reason", "")

        lines.append(f"\n**{i}. {article.get('title', 'Geen titel')}**{score_str}")
        lines.append(f"   📡 Bron/Source: {article.get('source', 'Onbekend')}")
        lines.append(f"   📅 {article.get('published_at', '')[:10]}")

        if article.get("description"):
            lines.append(f"   {article['description']}")

        if reason:
            lines.append(f"   💡 {reason}")

        lines.append(f"   🔗 {article.get('url', '')}")

    return "\n".join(lines)


def _format_news_compact(company_name: str, articles: list[dict]) -> str:
    """Compact format for the daily digest (used inside multi-company output)."""
    if not articles:
        return "  Geen relevante artikelen / No relevant articles found."

    lines = []
    for i, article in enumerate(articles, 1):
        score = article.get("relevance_score")
        score_str = f" [{score}/10]" if score is not None else ""
        title = article.get("title", "Geen titel")
        source = article.get("source", "")
        date_str = (article.get("published_at") or "")[:10]
        url = article.get("url", "")
        lines.append(f"  {i}. {title}{score_str}")
        lines.append(f"     {source} • {date_str}")
        if article.get("description"):
            desc = article["description"]
            if len(desc) > 120:
                desc = desc[:120] + "…"
            lines.append(f"     {desc}")
        lines.append(f"     {url}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main():
    async with stdio_server() as streams:
        await app.run(streams[0], streams[1], app.create_initialization_options())


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
