"""
Entry point for the MCP Company News Server.
Run directly: python main.py
"""

import asyncio
from mcp_news_server.server import main

if __name__ == "__main__":
    asyncio.run(main())
