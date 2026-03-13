# MCP Company News Server

Een MCP-server die bedrijfsnieuws beheert en filtert met AI.
An MCP server that manages and AI-filters company news.

## Features

1. **Bedrijvenlijst beheren** — voeg bedrijven toe/verwijder ze
   **Company list management** — add/remove companies
2. **Dagelijks nieuws ophalen** — via NewsAPI (nieuwste artikelen)
   **Daily news fetching** — via NewsAPI
3. **Relevantiefiltering** — Claude AI rankt artikelen op relevantie, max 10/bedrijf/dag
   **Relevance filtering** — Claude AI ranks articles by relevance, max 10/company/day
4. **Gestructureerde output** — per bedrijf of als volledig dagoverzicht
   **Structured output** — per company or as a full daily digest

## Tools

| Tool | Beschrijving / Description |
|------|---------------------------|
| `add_company` | Voeg een bedrijf toe / Add a company |
| `remove_company` | Verwijder een bedrijf / Remove a company |
| `list_companies` | Toon alle gevolgde bedrijven / List all watched companies |
| `get_company_news` | Haal gefilterd nieuws op voor één bedrijf / Get filtered news for one company |
| `get_daily_digest` | Volledig dagelijks overzicht voor alle bedrijven / Full daily digest for all companies |

## Vereisten / Requirements

- Python 3.11+
- [NewsAPI key](https://newsapi.org/register) (gratis tier beschikbaar / free tier available)
- [Anthropic API key](https://console.anthropic.com)

## Installatie / Installation

```bash
# 1. Clone & installeer
pip install -r requirements.txt

# 2. Configureer omgevingsvariabelen
cp .env.example .env
# Vul je API-sleutels in / Fill in your API keys
nano .env
```

## Gebruik / Usage

### Als MCP-server (Claude Desktop / MCP client)

Voeg toe aan je `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "company-news": {
      "command": "python",
      "args": ["/pad/naar/Test/main.py"],
      "env": {
        "NEWSAPI_KEY": "jouw_newsapi_sleutel",
        "ANTHROPIC_API_KEY": "jouw_anthropic_sleutel"
      }
    }
  }
}
```

### Direct testen / Direct testing

```bash
# Installeer MCP inspector
npm install -g @modelcontextprotocol/inspector

# Start de server
NEWSAPI_KEY=xxx ANTHROPIC_API_KEY=xxx npx @modelcontextprotocol/inspector python main.py
```

## Voorbeeldworkflow / Example workflow

```
# Voeg bedrijven toe
add_company("ASML", "Halfgeleiderapparatuur / Semiconductor equipment")
add_company("Philips", "Medische technologie / Medical technology")
add_company("Shell", "Energie / Energy")

# Haal dagelijks digest op
get_daily_digest()

# Of nieuws voor één bedrijf
get_company_news("ASML", days_back=2)
```

## Architectuur / Architecture

```
mcp_news_server/
├── server.py      # MCP server + tool handlers
├── storage.py     # JSON-persistentie voor bedrijvenlijst
├── news.py        # NewsAPI integratie
└── filter.py      # Claude AI relevantiefiltering
main.py            # Entry point
```

## Omgevingsvariabelen / Environment Variables

| Variabele | Vereist | Beschrijving |
|-----------|---------|-------------|
| `NEWSAPI_KEY` | ✅ | NewsAPI sleutel (newsapi.org) |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API sleutel |
| `COMPANIES_STORAGE_PATH` | ❌ | Aangepast pad voor opslag (standaard: `~/.mcp_news_server/companies.json`) |

## AI Relevantiescoring / AI Relevance Scoring

Elk artikel krijgt een score van **0-10**:
- **8-10**: Direct over het bedrijf (winst, producten, leiderschap)
- **5-7**: Sterk gerelateerd (sector nieuws)
- **2-4**: Zwak gerelateerd
- **0-1**: Niet relevant

Alleen de top 10 meest relevante artikelen per bedrijf worden weergegeven.
Only the top 10 most relevant articles per company are shown.
