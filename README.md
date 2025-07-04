# TL;DR News
AI-powered Chrome extension for instant news and article summaries. It uses Readability.js to extract the article text and can generate a concise summary for quick reading.

## Features
- One-click extraction of main news/article content from any web page
- (Planned) AI-powered summary using OpenAI or HuggingFace
- Clean and simple popup UI

## How It Works
1. On any news/article page, click the extension icon
2. The extension extracts the main content using Readability.js
3. (Planned) The content is sent to an AI model for summarization
4. The summary is displayed in the popup

## Setup
1. Clone or download this repository
2. Download [Readability.js](https://github.com/mozilla/readability/blob/master/Readability.js) and place it in the project root as `readability.js`
3. Go to `chrome://extensions/` in Chrome
4. Enable Developer Mode
5. Click "Load unpacked" and select this project folder

## Usage
- Navigate to any news or article page
- Click the extension icon to see the extracted content (and summary, if enabled)

## Roadmap
- Integrate OpenAI/HuggingFace summarization API
- Add options for summary length and language
- Improve content extraction for more sites

---
Forked from a YouTube transcript summarizer, now focused on general news/article summarization.
