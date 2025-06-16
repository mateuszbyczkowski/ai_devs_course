import TurndownService from "turndown";
import { parse } from "node-html-parser";
import https from "https";

export interface ScrapedPage {
  url: string;
  title: string;
  content: string;
  markdown: string;
  metadata: {
    contentLength: number;
    wordCount: number;
    headings: string[];
    links: string[];
    scrapedAt: string;
  };
}

export class WebScrapingService {
  private turndown: TurndownService;
  private visitedUrls: Set<string> = new Set();

  constructor() {
    // Disable SSL verification for self-signed certificates
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });

    // Configure turndown rules
    this.setupTurndownRules();
  }

  private setupTurndownRules(): void {
    // Preserve links with proper formatting
    this.turndown.addRule("links", {
      filter: "a",
      replacement: (content, node) => {
        const href = (node as any).getAttribute("href");
        if (!href) return content;
        return `[${content}](${href})`;
      },
    });

    // Better handling of code blocks
    this.turndown.addRule("code", {
      filter: ["pre", "code"],
      replacement: (content, node) => {
        if (node.nodeName === "PRE") {
          return `\n\`\`\`\n${content}\n\`\`\`\n`;
        }
        return `\`${content}\``;
      },
    });

    // Remove unnecessary elements
    this.turndown.remove(["script", "style", "noscript", "iframe"]);
  }

  async fetchPage(url: string): Promise<string> {
    console.log(`🌐 Fetching page: ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate",
          "Connection": "keep-alive",
        },
        // @ts-ignore
        agent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      this.visitedUrls.add(url);
      return html;
    } catch (error) {
      console.error(`❌ Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  htmlToMarkdown(html: string): string {
    try {
      // Parse HTML and clean it up
      const root = parse(html);

      // Remove unwanted elements
      root.querySelectorAll("script, style, noscript, iframe, nav, footer, header, aside").forEach((el) => el.remove());

      // Remove elements with specific classes that are usually navigation/ads
      root.querySelectorAll(".nav, .navigation, .menu, .sidebar, .ads, .advertisement, .footer, .header").forEach((el) => el.remove());

      // Convert to markdown
      const markdown = this.turndown.turndown(root.innerHTML);

      // Clean up the markdown
      return this.cleanMarkdown(markdown);
    } catch (error) {
      console.error("❌ Failed to convert HTML to markdown:", error);
      return "";
    }
  }

  private cleanMarkdown(markdown: string): string {
    return markdown
      // Remove excessive newlines
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      // Remove trailing spaces
      .replace(/[ \t]+$/gm, "")
      // Remove leading/trailing whitespace
      .trim();
  }

  extractMetadata(html: string, markdown: string): {
    contentLength: number;
    wordCount: number;
    headings: string[];
    links: string[];
    title: string;
  } {
    const root = parse(html);

    // Extract title
    let title = "";
    const titleEl = root.querySelector("title");
    if (titleEl) {
      title = titleEl.text.trim();
    }

    // Extract headings from markdown
    const headings = markdown
      .split("\n")
      .filter(line => line.match(/^#{1,6}\s+/))
      .map(line => line.replace(/^#{1,6}\s+/, "").trim());

    // Extract links
    const linkMatches = markdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    const links = linkMatches.map(match => {
      const urlMatch = match.match(/\(([^)]+)\)/);
      return urlMatch ? urlMatch[1] : "";
    }).filter(Boolean);

    return {
      contentLength: markdown.length,
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      headings,
      links,
      title,
    };
  }

  async scrapePage(url: string): Promise<ScrapedPage> {
    console.log(`📄 Scraping page: ${url}`);

    try {
      const html = await this.fetchPage(url);
      const markdown = this.htmlToMarkdown(html);
      const metadata = this.extractMetadata(html, markdown);

      const scrapedPage: ScrapedPage = {
        url,
        title: metadata.title,
        content: html,
        markdown,
        metadata: {
          ...metadata,
          scrapedAt: new Date().toISOString(),
        },
      };

      console.log(`✅ Scraped ${url}: ${metadata.wordCount} words, ${metadata.headings.length} headings`);
      return scrapedPage;
    } catch (error) {
      console.error(`❌ Failed to scrape ${url}:`, error);
      throw error;
    }
  }

  async scrapeMultiplePages(urls: string[]): Promise<ScrapedPage[]> {
    console.log(`📚 Scraping ${urls.length} pages...`);

    const results: ScrapedPage[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(`\n🔄 Processing ${i + 1}/${urls.length}: ${url}`);
        const scrapedPage = await this.scrapePage(url);
        results.push(scrapedPage);

        // Add small delay to be respectful
        if (i < urls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Failed to scrape ${url}, continuing...`);
        // Continue with other pages even if one fails
      }
    }

    console.log(`\n✅ Successfully scraped ${results.length}/${urls.length} pages`);
    return results;
  }

  extractLinks(html: string, baseUrl: string): string[] {
    try {
      const root = parse(html);
      const links: string[] = [];

      root.querySelectorAll("a").forEach((link) => {
        const href = link.getAttribute("href");
        if (href) {
          let fullUrl = href;

          // Convert relative URLs to absolute
          if (href.startsWith("/")) {
            const base = new URL(baseUrl);
            fullUrl = `${base.protocol}//${base.host}${href}`;
          } else if (!href.startsWith("http")) {
            fullUrl = new URL(href, baseUrl).toString();
          }

          // Only include links from the same domain
          try {
            const linkDomain = new URL(fullUrl).hostname;
            const baseDomain = new URL(baseUrl).hostname;
            if (linkDomain === baseDomain) {
              links.push(fullUrl);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      });

      // Remove duplicates and return
      return [...new Set(links)];
    } catch (error) {
      console.error("❌ Failed to extract links:", error);
      return [];
    }
  }

  isVisited(url: string): boolean {
    return this.visitedUrls.has(url);
  }

  getVisitedUrls(): string[] {
    return Array.from(this.visitedUrls);
  }

  clearVisitedUrls(): void {
    this.visitedUrls.clear();
  }
}
